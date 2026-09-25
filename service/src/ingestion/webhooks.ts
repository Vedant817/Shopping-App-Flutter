import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config/env.js';
import { decryptToken } from '../crypto/token-vault.js';
import type { Database } from '../db/client.js';
import { getInstallation, getWorkspaceByShopDomain, markWorkspaceUninstalled, recordAuditEvent } from '../db/operations.js';
import { upsertCustomEvent, upsertCustomer, upsertOrder, upsertProduct, upsertRefund } from '../db/upserts.js';
import { processCustomerDataRequest, purgeUninstalledShop, redactCustomer } from './compliance.js';
import { verifyHmacHex } from '../utils/hmac.js';
import { normalizeMyshopifyDomain } from '../shopify/domain.js';
import { ShopifyGraphqlClient } from '../shopify/graphql-client.js';
import { CUSTOMER_BY_ID_QUERY, ORDER_BY_ID_QUERY, PRODUCT_BY_ID_QUERY, REFUND_BY_ID_QUERY } from '../shopify/queries.js';
import { fetchCompleteOrderLines, fetchCompleteProductVariants } from '../shopify/sync.js';

export const SHOPIFY_WEBHOOK_TOPICS = new Set([
  'app/uninstalled',
  'customers/create',
  'customers/update',
  'customers/delete',
  'customers/data_request',
  'customers/redact',
  'privacy/delete',
  'shop/redact',
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'orders/fulfilled',
  'orders/paid',
  'refunds/create',
  'products/create',
  'products/update',
  'products/delete',
  'events/create',
  'custom_events/create',
]);

export type ShopifyWebhookInput = {
  rawBody: Buffer;
  hmac: string | undefined;
  webhookId: string | undefined;
  shopDomain: string | undefined;
  topic: string | undefined;
  apiVersion?: string | undefined;
  maxAttempts?: number;
  secret: string;
};

export type AcceptedWebhook = {
  workspaceId: string;
  webhookId: string;
  duplicate: boolean;
  jobId?: string;
};

export type CanonicalResource = 'product' | 'customer' | 'order' | 'refund';
export type WebhookResource = CanonicalResource | 'product_delete' | 'customer_delete' | 'compliance' | 'uninstall' | 'custom_event';

export type WebhookRefetcher = (resource: CanonicalResource, stableId: string, shopDomain: string) => Promise<Record<string, unknown>>;

export function verifyWebhookHmac(rawBody: Buffer, provided: string | undefined, secret: string): boolean {
  return typeof provided === 'string' && verifyHmacHex(rawBody, secret, provided);
}

export function parseWebhookPayload(rawBody: Buffer): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new Error('Webhook body is not valid JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error('Webhook body must be an object');
  return payload as Record<string, unknown>;
}

export async function acceptWebhook(db: Database, input: ShopifyWebhookInput): Promise<AcceptedWebhook> {
  if (!verifyWebhookHmac(input.rawBody, input.hmac, input.secret)) throw new Error('Webhook HMAC is invalid');
  if (!input.webhookId || !input.shopDomain || !input.topic || !input.hmac) throw new Error('Webhook headers are incomplete');
  if (!SHOPIFY_WEBHOOK_TOPICS.has(input.topic)) throw new Error('Webhook topic is not accepted');
  const shopDomain = normalizeMyshopifyDomain(input.shopDomain);
  const body = parseWebhookPayload(input.rawBody);
  const bodyShopDomain = firstString(body.shop_domain, body.shopDomain);
  if (bodyShopDomain && normalizeMyshopifyDomain(bodyShopDomain) !== shopDomain) throw new Error('Webhook shop does not match the registered shop');
  const normalized = normalizeWebhook(input.topic, body, input.webhookId);
  const storedPayload = normalized.resource === 'compliance' || normalized.resource === 'uninstall'
    ? { redacted: true, webhookId: input.webhookId, topic: input.topic, resource: normalized.resource, stableId: normalized.stableId, shopDomain }
    : { webhookId: input.webhookId, topic: input.topic, resource: normalized.resource, stableId: normalized.stableId, shopDomain, action: normalized.action, ...(normalized.resource === 'custom_event' ? { payload: body } : {}) };
  const workspace = await getWorkspaceByShopDomain(db, shopDomain);
  if (!workspace) throw new Error('Webhook shop is not registered');
  const jobId = await db.transaction(async (tx) => {
    const event = await tx.execute(sql`
      insert into webhook_events (webhook_id, workspace_id, shop_domain, topic, api_version, payload, hmac)
      values (${input.webhookId}, ${workspace.id}, ${shopDomain}, ${input.topic}, ${input.apiVersion ?? null}, ${JSON.stringify(storedPayload)}::jsonb, ${input.hmac})
      on conflict (webhook_id) do nothing
      returning id
    `);
    if (!event.rows[0]) return undefined;
    const job = await tx.execute(sql`
      insert into ingestion_jobs (workspace_id, resource, payload, idempotency_key, max_attempts)
      values (${workspace.id}, ${normalized.resource}, ${JSON.stringify(storedPayload)}::jsonb, ${`webhook:${input.webhookId}`}, ${input.maxAttempts ?? 5})
      on conflict (workspace_id, idempotency_key) do nothing
      returning id
    `);
    return job.rows[0]?.id === undefined ? undefined : String(job.rows[0].id);
  });
  return { workspaceId: workspace.id, webhookId: input.webhookId, duplicate: jobId === undefined, ...(jobId ? { jobId } : {}) };
}

export async function processWebhookJob(db: Database, workspaceId: string, payload: Record<string, unknown>, options: { config?: AppConfig; refetch?: WebhookRefetcher } = {}): Promise<void> {
  const topic = requiredString(payload.topic, 'webhook.topic');
  const webhookId = requiredString(payload.webhookId, 'webhook.webhookId');
  const resource = requiredString(payload.resource, 'webhook.resource') as WebhookResource;
  const stableId = requiredString(payload.stableId, 'webhook.stableId');
  const shopDomain = normalizeMyshopifyDomain(requiredString(payload.shopDomain, 'webhook.shopDomain'));
  try {
    if (resource === 'uninstall') {
      await markWorkspaceUninstalled(db, workspaceId);
      await recordAuditEvent(db, { workspaceId, action: 'shopify.app_uninstalled', resourceType: 'workspace', resourceId: workspaceId, metadata: { webhookId, topic } });
    } else if (resource === 'compliance') {
      await processCompliance(db, workspaceId, webhookId, topic, stableId);
    } else if (resource === 'custom_event') {
      const body = isRecord(payload.payload) ? payload.payload : {};
      await acceptCustomEvent(db, workspaceId, {
        id: stableId,
        eventType: requiredString(body.event_type ?? body.eventType, 'custom event.event_type'),
        customerId: optionalString(body.customer_id ?? body.customerId),
        sessionId: optionalString(body.session_id ?? body.sessionId),
        occurredAt: requiredString(body.occurred_at ?? body.occurredAt ?? body.timestamp, 'custom event.occurred_at'),
        data: isRecord(body.data) ? body.data : body,
        raw: body,
      });
    } else if (resource === 'product_delete') {
      await markProductDeleted(db, workspaceId, stableId);
    } else if (resource === 'customer_delete') {
      await markCustomerDeleted(db, workspaceId, stableId);
    } else {
      const refetch = options.refetch ?? ((canonicalResource, id, canonicalShop) => fetchCanonicalResource(db, options.config, workspaceId, canonicalResource, id, canonicalShop));
      const node = await refetch(resource as CanonicalResource, stableId, shopDomain);
      assertCanonicalId(resource, node, stableId);
      if (resource === 'product') await upsertProduct(db, workspaceId, node, { replaceVariants: true });
      else if (resource === 'customer') await upsertCustomer(db, workspaceId, node);
      else if (resource === 'order') await upsertOrder(db, workspaceId, node, { replaceLines: true });
      else if (resource === 'refund') await upsertRefund(db, workspaceId, node);
      else throw new Error(`Unsupported canonical webhook resource: ${resource}`);
    }
    await db.execute(sql`update webhook_events set status = 'processed', processed_at = now() where webhook_id = ${webhookId}`);
  } catch (error) {
    await db.execute(sql`update webhook_events set status = 'failed', error = ${error instanceof Error ? error.message : 'Webhook processing failed'} where webhook_id = ${webhookId}`);
    throw error;
  }
}

async function processCompliance(db: Database, workspaceId: string, webhookId: string, topic: string, stableId: string): Promise<void> {
  if (topic === 'shop/redact') {
    await purgeUninstalledShop(db, { workspaceId, webhookId, topic });
    return;
  }
  const request = { workspaceId, webhookId, customerId: stableId, topic };
  if (topic === 'customers/data_request') await processCustomerDataRequest(db, request);
  else await redactCustomer(db, request);
}

async function fetchCanonicalResource(db: Database, config: AppConfig | undefined, workspaceId: string, resource: CanonicalResource, stableId: string, shopDomain: string): Promise<Record<string, unknown>> {
  if (!config) throw new Error('Webhook canonical refetch configuration is required');
  const installation = await getInstallation(db, workspaceId);
  if (!installation) throw new Error('Shopify installation is not active');
  if (installation.shopDomain !== shopDomain) throw new Error('Webhook shop does not match the workspace installation');
  const client = new ShopifyGraphqlClient({
    shopDomain: installation.shopDomain,
    accessToken: decryptToken(installation.encryptedOfflineToken, config.shopifyTokenEncryptionKey),
    apiVersion: installation.apiVersion || config.shopifyApiVersion,
  });
  if (resource === 'product') {
    const node = await fetchNode(client, PRODUCT_BY_ID_QUERY, 'product', stableId);
    const variants = await fetchCompleteProductVariants(client, stableId);
    return { ...node, variants: { nodes: variants }, variantsComplete: true };
  }
  if (resource === 'customer') return fetchNode(client, CUSTOMER_BY_ID_QUERY, 'customer', stableId);
  if (resource === 'order') {
    const node = await fetchNode(client, ORDER_BY_ID_QUERY, 'order', stableId);
    const lineItems = await fetchCompleteOrderLines(client, stableId);
    return { ...node, lineItems: { nodes: lineItems } };
  }
  const data = await client.execute<{ node?: Record<string, unknown> }>(REFUND_BY_ID_QUERY, { id: stableId });
  if (!data.node || typeof data.node !== 'object') throw new Error('Canonical refund was not found');
  return data.node;
}

async function fetchNode(client: ShopifyGraphqlClient, query: string, key: string, stableId: string): Promise<Record<string, unknown>> {
  const data = await client.execute<Record<string, unknown>>(query, { id: stableId });
  const node = data[key];
  if (!isRecord(node)) throw new Error(`Canonical ${key} was not found`);
  return node;
}

function assertCanonicalId(resource: CanonicalResource, node: Record<string, unknown>, stableId: string): void {
  const id = node.id;
  if (typeof id !== 'string' || id !== stableId) throw new Error(`Canonical ${resource} id did not match the webhook id`);
}

async function markProductDeleted(db: Database, workspaceId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`update products set deleted_at = now(), updated_at = now() where workspace_id = ${workspaceId} and id = ${id}`);
    await tx.execute(sql`delete from product_variants where workspace_id = ${workspaceId} and product_id = ${id}`);
  });
}

async function markCustomerDeleted(db: Database, workspaceId: string, id: string): Promise<void> {
  await db.execute(sql`update customers set deleted_at = now(), updated_at = now() where workspace_id = ${workspaceId} and id = ${id}`);
}

export async function acceptCustomEvent(db: Database, workspaceId: string, input: { id: string; eventType: string; customerId?: string | null; sessionId?: string | null; occurredAt: string; data: Record<string, unknown>; raw?: Record<string, unknown> }): Promise<void> {
  await upsertCustomEvent(db, workspaceId, input);
}

export function normalizeWebhook(topic: string, body: Record<string, unknown>, webhookId: string): { resource: WebhookResource; stableId: string; action: string } {
  if (topic === 'app/uninstalled') {
    const shopId = firstIdentifier(body.id, body.shop_id);
    if (!shopId) throw new Error('Webhook shop id is required');
    return { resource: 'uninstall', stableId: shopId, action: 'uninstall' };
  }
  if (topic === 'customers/data_request' || topic === 'customers/redact' || topic === 'privacy/delete') {
    return { resource: 'compliance', stableId: canonicalResourceId('Customer', 'Webhook customer id is required', body.customer_id, body.customerId, nestedId(body.customer)), action: topic };
  }
  if (topic === 'shop/redact') {
    const shopId = firstIdentifier(body.shop_id, body.shopId, body.id);
    if (!shopId) throw new Error('Webhook shop id is required');
    return { resource: 'compliance', stableId: shopId, action: topic };
  }
  if (topic.startsWith('products/')) return { resource: topic === 'products/delete' ? 'product_delete' : 'product', stableId: canonicalResourceId('Product', 'product.id', body.id, body.product_id), action: topic };
  if (topic.startsWith('customers/')) return { resource: topic === 'customers/delete' ? 'customer_delete' : 'customer', stableId: canonicalResourceId('Customer', 'customer.id', body.id, body.customer_id), action: topic };
  if (topic === 'refunds/create') return { resource: 'refund', stableId: canonicalResourceId('Refund', 'refund.id', body.id, body.refund_id, nestedId(body.refund)), action: topic };
  if (topic.startsWith('orders/')) return { resource: 'order', stableId: canonicalResourceId('Order', 'order.id', body.id, body.order_id, nestedId(body.order)), action: topic };
  if (topic === 'events/create' || topic === 'custom_events/create') return { resource: 'custom_event', stableId: firstIdentifier(body.id, body.event_id) ?? webhookId, action: topic };
  throw new Error('Webhook topic is not accepted');
}

function nestedId(value: unknown): string | undefined {
  return isRecord(value) ? firstIdentifier(value.id) : undefined;
}

function canonicalResourceId(type: string, label: string, ...values: unknown[]): string {
  const id = firstIdentifier(...values);
  if (!id) throw new Error(`${label} is required`);
  return id.startsWith('gid://') ? id : `gid://shopify/${type}/${id}`;
}

function firstIdentifier(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === 'string' && value.trim() !== '') return value;
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
