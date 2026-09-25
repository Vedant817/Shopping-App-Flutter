import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config/env.js';
import { decryptToken } from '../crypto/token-vault.js';
import type { Database } from '../db/client.js';
import { getInstallation } from '../db/operations.js';
import { upsertCheckoutWithExecutor, upsertCustomerWithExecutor, upsertOrderWithExecutor, upsertProductWithExecutor } from '../db/upserts.js';
import { updateJobResourcePage } from '../ingestion/queue.js';
import { ShopifyGraphqlClient, type GraphqlConnection, type GraphqlPage } from './graphql-client.js';
import { ABANDONED_CHECKOUTS_QUERY, ABANDONED_CHECKOUT_LINES_QUERY, CUSTOMERS_QUERY, ORDERS_QUERY, ORDER_LINE_ITEMS_QUERY, PRODUCTS_QUERY, PRODUCT_VARIANTS_QUERY } from './queries.js';

export type SyncResource = 'products' | 'customers' | 'orders' | 'abandoned_checkouts';

type SqlExecutor = Pick<Database, 'execute'>;

type SyncPage = {
  query: string;
  select: (data: unknown) => GraphqlConnection<unknown>;
  upsert: (executor: SqlExecutor, workspaceId: string, node: unknown, options?: { replaceVariants?: boolean; replaceLines?: boolean }) => Promise<string>;
};

export type SyncCursorState = {
  cursor: string | null;
  watermarkAt: Date | null;
};

export type SyncRunResult = {
  count: number;
  cursor: null;
  watermark: Date;
  variantsComplete: boolean;
};

export type SyncClient = Pick<ShopifyGraphqlClient, 'forEachPage'>;

export type CommitSyncPageInput = {
  runId: string;
  workspaceId: string;
  resource: SyncResource;
  cursor: string | null;
  count: number;
  jobId?: string;
  nodes: unknown[];
  variantsComplete?: boolean;
  hasNextPage?: boolean;
};

const pageSize = 100;
const watermarkOverlapSeconds = 300;

export async function commitSyncPage(
  db: Database,
  input: CommitSyncPageInput,
  upsert: (executor: SqlExecutor, workspaceId: string, node: unknown, options?: { replaceVariants?: boolean; replaceLines?: boolean }) => Promise<string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const persistedCursor = input.hasNextPage === false ? null : input.cursor;
    for (const node of input.nodes) {
      await upsert(tx, input.workspaceId, node, { replaceVariants: input.resource === 'products', replaceLines: input.resource === 'orders' });
    }
    await saveSyncCursor(tx, input.workspaceId, input.resource, persistedCursor);
    await updateSyncRunPage(tx, input.runId, persistedCursor, input.count);
    if (input.jobId) {
      await updateJobResourcePage(tx, {
        jobId: input.jobId,
        workspaceId: input.workspaceId,
        resource: input.resource,
        cursor: persistedCursor,
        recordsRead: input.nodes.length,
        recordsWritten: input.nodes.length,
        variantsComplete: input.variantsComplete ?? input.resource !== 'products',
      });
    }
  });
}

export async function fetchCompleteProductVariants(client: SyncClient, productId: string): Promise<unknown[]> {
  const variants: unknown[] = [];
  await client.forEachPage(PRODUCT_VARIANTS_QUERY, { productId, first: pageSize, after: null }, (data) => {
    const product = (data as { product?: { variants?: GraphqlConnection<unknown> } }).product;
    if (!product?.variants) throw new Error('Shopify product variants are unavailable');
    return product.variants;
  }, async (page: GraphqlPage<unknown>) => {
    variants.push(...page.nodes);
  });
  return variants;
}

export async function fetchCompleteOrderLines(client: SyncClient, orderId: string): Promise<unknown[]> {
  const lines: unknown[] = [];
  await client.forEachPage(ORDER_LINE_ITEMS_QUERY, { orderId, first: pageSize, after: null }, (data) => {
    const order = (data as { order?: { lineItems?: GraphqlConnection<unknown> } }).order;
    if (!order?.lineItems) throw new Error('Shopify order line items are unavailable');
    return order.lineItems;
  }, async (page: GraphqlPage<unknown>) => {
    lines.push(...page.nodes);
  });
  return lines;
}

async function attachCompleteOrderLines(client: SyncClient, nodes: unknown[]): Promise<unknown[]> {
  const enriched: unknown[] = [];
  for (const value of nodes) {
    const node = value as Record<string, unknown>;
    const orderId = typeof node.id === 'string' ? node.id : '';
    if (!orderId) throw new Error('Order id is required for line reconciliation');
    const lineItems = await fetchCompleteOrderLines(client, orderId);
    enriched.push({ ...node, lineItems: { nodes: lineItems } });
  }
  return enriched;
}

export async function fetchCompleteAbandonedCheckoutLines(client: SyncClient, checkoutId: string): Promise<unknown[]> {
  const lines: unknown[] = [];
  await client.forEachPage(ABANDONED_CHECKOUT_LINES_QUERY, { id: checkoutId, first: pageSize, after: null }, (data) => {
    const checkout = (data as { node?: { lineItems?: GraphqlConnection<unknown> } }).node;
    if (!checkout?.lineItems) throw new Error('Shopify abandoned checkout lines are unavailable');
    return checkout.lineItems;
  }, async (page: GraphqlPage<unknown>) => {
    lines.push(...page.nodes);
  });
  return lines;
}

async function attachCompleteAbandonedCheckoutLines(client: SyncClient, nodes: unknown[]): Promise<unknown[]> {
  const enriched: unknown[] = [];
  for (const value of nodes) {
    const node = value as Record<string, unknown>;
    const checkoutId = typeof node.id === 'string' ? node.id : '';
    if (!checkoutId) throw new Error('Abandoned checkout id is required for line reconciliation');
    const lineItems = await fetchCompleteAbandonedCheckoutLines(client, checkoutId);
    enriched.push({ ...node, lineItems: { nodes: lineItems } });
  }
  return enriched;
}

export async function runSyncResource(
  db: Database,
  config: AppConfig,
  workspaceId: string,
  resource: SyncResource,
  options: { jobId?: string; now?: () => Date; client?: SyncClient } = {},
): Promise<SyncRunResult> {
  const installation = options.client ? undefined : await getInstallation(db, workspaceId);
  if (!options.client && !installation) throw new Error('Shopify installation is not active');
  const accessToken = installation ? decryptToken(installation.encryptedOfflineToken, config.shopifyTokenEncryptionKey) : '';
  const client = options.client ?? new ShopifyGraphqlClient({
    shopDomain: installation!.shopDomain,
    accessToken,
    apiVersion: installation!.apiVersion || config.shopifyApiVersion,
  });
  const state = await readSyncState(db, workspaceId, resource);
  const startedAt = options.now?.() ?? new Date();
  const run = await startSyncRun(db, workspaceId, resource, state.cursor);
  const page = syncPage(resource);
  let count = 0;
  let lastCursor = state.cursor;
  try {
    const variables = buildSyncVariables(state);
    await client.forEachPage(page.query, variables, (data) => page.select(data), async (result) => {
      const nodes = resource === 'products'
        ? await attachCompleteProductVariants(client, result.nodes)
          : resource === 'orders'
            ? await attachCompleteOrderLines(client, result.nodes)
            : resource === 'abandoned_checkouts'
              ? await attachCompleteAbandonedCheckoutLines(client, result.nodes)
              : result.nodes;
      const nextCursor = result.endCursor ?? lastCursor;
      await commitSyncPage(db, {
        runId: run,
        workspaceId,
        resource,
        cursor: nextCursor,
        count: count + nodes.length,
        jobId: options.jobId,
        nodes,
        variantsComplete: true,
        hasNextPage: result.hasNextPage,
      }, page.upsert);
      lastCursor = result.hasNextPage ? nextCursor : null;
      count += nodes.length;
    });
    const watermark = nextSyncWatermark(startedAt, state.watermarkAt);
    await completeSyncState(db, { workspaceId, resource, runId: run, count, watermark });
    return { count, cursor: null, watermark, variantsComplete: true };
  } catch (error) {
    await finishSyncRun(db, run, 'failed', lastCursor, count, error);
    throw error;
  }
}

export function buildSyncVariables(state: SyncCursorState): { first: number; after: string | null; query: string | null } {
  return { first: pageSize, after: state.cursor, query: state.watermarkAt ? updatedAtQuery(state.watermarkAt) : null };
}

export function updatedAtQuery(watermark: Date): string {
  return `updated_at:>=${watermark.toISOString()}`;
}

export function nextSyncWatermark(startedAt: Date, previousWatermark: Date | null, overlapSeconds = watermarkOverlapSeconds): Date {
  const candidate = new Date(startedAt.getTime() - overlapSeconds * 1000);
  return previousWatermark && previousWatermark.getTime() > candidate.getTime() ? previousWatermark : candidate;
}

export async function failStaleSyncRuns(db: Database, staleLockSeconds: number): Promise<number> {
  const result = await db.execute(sql`
    update sync_runs
    set status = 'failed', completed_at = now(), error = 'stale sync run recovered'
    where status = 'running' and started_at < now() - (${staleLockSeconds} * interval '1 second')
  `);
  return result.rowCount ?? 0;
}

export async function readSyncState(db: Database, workspaceId: string, resource: SyncResource): Promise<SyncCursorState> {
  const result = await db.execute(sql`select cursor, watermark_at from sync_cursors where workspace_id = ${workspaceId} and resource = ${resource} limit 1`);
  const row = result.rows[0] as { cursor?: unknown; watermark_at?: unknown } | undefined;
  return {
    cursor: row?.cursor === null || row?.cursor === undefined ? null : String(row.cursor),
    watermarkAt: row?.watermark_at === null || row?.watermark_at === undefined ? null : new Date(String(row.watermark_at)),
  };
}

export async function readSyncCursor(db: Database, workspaceId: string, resource: SyncResource): Promise<string | null> {
  return (await readSyncState(db, workspaceId, resource)).cursor;
}

export async function startSyncRun(db: Database, workspaceId: string, resource: SyncResource, cursorFrom: string | null = null): Promise<string> {
  const result = await db.execute(sql`
    insert into sync_runs (workspace_id, resource, status, cursor_from)
    values (${workspaceId}, ${resource}, 'running', ${cursorFrom})
    returning id
  `);
  const row = result.rows[0] as { id?: unknown } | undefined;
  if (!row?.id) throw new Error('Sync run could not be created');
  return String(row.id);
}

export async function completeSyncState(
  db: Database,
  input: { workspaceId: string; resource: SyncResource; runId: string; count: number; watermark: Date },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into sync_cursors (workspace_id, resource, cursor, watermark_at, last_synced_at, updated_at)
      values (${input.workspaceId}, ${input.resource}, null, ${input.watermark}, now(), now())
      on conflict (workspace_id, resource) do update set
        cursor = null, watermark_at = excluded.watermark_at, last_synced_at = now(), updated_at = now()
    `);
    await tx.execute(sql`
      update sync_runs
      set status = 'succeeded', cursor_to = null, completed_at = now(),
        stats = jsonb_build_object('count', ${input.count}::int), error = null
      where id = ${input.runId}
    `);
  });
}

export async function finishSyncRun(db: Database, runId: string, status: 'succeeded' | 'failed', cursor: string | null, count: number, error?: unknown): Promise<void> {
  await db.execute(sql`
    update sync_runs
    set status = ${status}, cursor_to = ${cursor}, completed_at = now(),
      stats = jsonb_build_object('count', ${count}::int), error = ${error instanceof Error ? error.message : error === undefined ? null : String(error)}
    where id = ${runId}
  `);
}

export async function saveSyncCursor(db: Database, workspaceId: string, resource: SyncResource, cursor: string | null): Promise<void> {
  await db.execute(sql`
    insert into sync_cursors (workspace_id, resource, cursor, updated_at)
    values (${workspaceId}, ${resource}, ${cursor}, now())
    on conflict (workspace_id, resource) do update set cursor = excluded.cursor, updated_at = now()
  `);
}

async function attachCompleteProductVariants(client: SyncClient, nodes: unknown[]): Promise<unknown[]> {
  const enriched: unknown[] = [];
  for (const value of nodes) {
    const node = value as Record<string, unknown>;
    const productId = typeof node.id === 'string' ? node.id : '';
    if (!productId) throw new Error('Product id is required for variant reconciliation');
    const variants = await fetchCompleteProductVariants(client, productId);
    enriched.push({ ...node, variants: { nodes: variants }, variantsComplete: true });
  }
  return enriched;
}

function syncPage(resource: SyncResource): SyncPage {
  if (resource === 'products') {
    return {
      query: PRODUCTS_QUERY,
      select: (data) => (data as { products: GraphqlConnection<unknown> }).products,
      upsert: upsertProductWithExecutor,
    };
  }
  if (resource === 'customers') {
    return {
      query: CUSTOMERS_QUERY,
      select: (data) => (data as { customers: GraphqlConnection<unknown> }).customers,
      upsert: upsertCustomerWithExecutor,
    };
  }
  if (resource === 'orders') {
    return {
      query: ORDERS_QUERY,
      select: (data) => (data as { orders: GraphqlConnection<unknown> }).orders,
      upsert: upsertOrderWithExecutor,
    };
  }
  if (resource === 'abandoned_checkouts') {
    return {
      query: ABANDONED_CHECKOUTS_QUERY,
      select: (data) => (data as { abandonedCheckouts: GraphqlConnection<unknown> }).abandonedCheckouts,
      upsert: upsertCheckoutWithExecutor,
    };
  }
  throw new Error('Unsupported sync resource');
}

async function updateSyncRunPage(executor: SqlExecutor, runId: string, cursor: string | null, count: number): Promise<void> {
  await executor.execute(sql`
    update sync_runs
    set cursor_to = ${cursor}, stats = jsonb_build_object('count', ${count}::int)
    where id = ${runId}
  `);
}
