import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { ensureAppUser, requireWorkspaceMembership } from '../auth/tenant.js';
import { getWorkspaceByShopDomain, addWorkspaceMember, getWorkspaceMemberRole, listWorkspaceMembers, recordAuditEvent, removeWorkspaceMember, updateWorkspaceMemberRole, upsertInstallation, upsertWorkspace } from '../db/operations.js';
import { consumeOAuthState } from '../db/oauth-state.js';
import { encryptToken, decryptToken } from '../crypto/token-vault.js';
import { normalizeMyshopifyDomain } from '../shopify/domain.js';
import { createShopifyAuthorization, postInstallReturnUrl } from '../shopify/install.js';
import { exchangeAuthorizationCode, verifyOAuthCallback, type OAuthQuery } from '../shopify/oauth.js';
import { ShopifyGraphqlClient } from '../shopify/graphql-client.js';
import { fetchShopProfile } from '../shopify/profile.js';
import { enqueueJob } from '../ingestion/queue.js';
import { acceptWebhook } from '../ingestion/webhooks.js';
import { getCustomerDetail, getOverview, getProductDetail, getWorkspaceDto, listCustomers, listOrders, listProducts, listWorkspaces } from '../api/queries.js';
import { getIngestionJob, getSyncStatus } from '../api/jobs.js';
import { decodeCursor, parseLimit } from '../utils/cursor.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { resolveRange } from '../utils/time.js';
import { requireAuth } from './auth.js';

export type RouteDependencies = {
  config: AppConfig;
  db: Database;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

const workspaceParams = z.object({ workspaceId: z.string().min(1).max(128) });
const tenantParams = z.object({ tenantId: z.string().min(1).max(128) });
const idParams = z.object({ workspaceId: z.string().min(1).max(128), id: z.string().min(1).max(256) });
const rangeQuery = z.object({ from: z.string().optional(), to: z.string().optional(), preset: z.string().optional() });
const listQuery = z.object({ limit: z.string().optional(), cursor: z.string().optional() });
const optionalBooleanQuery = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());
const optionalProductSearch = z.preprocess((value) => value === '' ? undefined : value, z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/).optional());
const optionalCategory = z.preprocess((value) => value === '' ? undefined : value, z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/).optional());
const optionalCustomerSearch = z.preprocess((value) => value === '' ? undefined : value, z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/).optional());
const productListQuery = listQuery.extend({ q: optionalProductSearch, category: optionalCategory });
const customerListQuery = listQuery.extend({ q: optionalCustomerSearch });
const orderListQuery = listQuery.extend({ customerId: z.string().min(1).max(256).optional(), includeCancelled: optionalBooleanQuery });
const syncBody = z.object({ resources: z.array(z.enum(['products', 'customers', 'orders', 'abandoned_checkouts'])).min(1).max(4).optional() });
const memberRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
const memberBody = z.object({ userId: z.string().min(1).max(256), role: memberRoleSchema });
const memberRoleBody = z.object({ role: memberRoleSchema });
const installBody = z.object({
  shop: z.string().min(1).max(253),
  returnUrl: z.string().min(1).max(2048),
});
const eventBody = z.object({
  id: z.string().min(1).max(256),
  eventType: z.string().min(1).max(128),
  customerId: z.string().min(1).max(256).nullable().optional(),
  sessionId: z.string().min(1).max(256).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.record(z.unknown()),
});

export async function registerRoutes(app: FastifyInstance, dependencies: RouteDependencies): Promise<void> {
  const { config, db } = dependencies;
  const clock = dependencies.now ?? (() => new Date());

  app.get('/v1/auth/shopify/install', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    if (query.redirect_uri !== undefined || query.return_url !== undefined) throw badRequest('Return URLs are configured server-side');
    let authorization;
    try {
      authorization = await createShopifyAuthorization({
        db,
        config,
        user: requireAuth(request),
        shop: normalizeMyshopifyDomain(typeof query.shop === 'string' ? query.shop : ''),
        returnUrl: config.appBaseUrl,
        now: clock(),
      });
    } catch (error) {
      if (error instanceof Error && /invalid shop|shop domain|myshopify/i.test(error.message)) {
        throw badRequest('Invalid Shopify shop domain', 'invalid_shop_domain');
      }
      throw error;
    }
    return reply.redirect(authorization.authorizationUrl);
  });

  app.post('/v1/auth/shopify/install', async (request, reply) => {
    const body = installBody.parse(request.body);
    try {
      const authorization = await createShopifyAuthorization({
        db,
        config,
        user: requireAuth(request),
        shop: body.shop,
        returnUrl: body.returnUrl,
        expectedReturnUrl: config.shopifyMobilePostInstallReturnUrl,
        now: clock(),
      });
      return reply.code(201).send(authorization);
    } catch (error) {
       if (error instanceof Error && /invalid shop|shop domain|myshopify/i.test(error.message)) {
         throw badRequest('Invalid Shopify shop domain', 'invalid_shop_domain');
       }
      if (error instanceof Error && error.message.includes('return URL')) {
         throw badRequest('Post-install return URL is not configured', 'invalid_return_url');
      }
      throw error;
    }
  });

  app.get('/v1/auth/shopify/callback', async (request, reply) => {
    try {
      const callback = verifyOAuthCallback({ query: request.query as OAuthQuery, secret: config.shopifyApiSecret, now: clock(), maxAgeSeconds: config.oauthCallbackMaxAgeSeconds });
      const state = await consumeOAuthState(db, hashState(callback.state), clock());
      if (!state || state.shopDomain !== callback.shopDomain || !state.userId || state.redirectUri !== config.shopifyOauthCallbackUrl) {
        throw badRequest('OAuth state is invalid or expired');
      }
      const existing = await getWorkspaceByShopDomain(db, callback.shopDomain);
      if (existing) {
        const existingRole = await getWorkspaceMemberRole(db, existing.id, state.userId);
        if (existingRole !== 'owner' && existingRole !== 'admin') throw badRequest('Only an existing workspace administrator can reinstall this shop', 'workspace_reinstall_forbidden');
      }
      const codeVerifier = decryptToken(state.codeVerifierEncrypted, config.shopifyTokenEncryptionKey);
      let token: Awaited<ReturnType<typeof exchangeAuthorizationCode>>;
      try {
        token = await exchangeAuthorizationCode({ shopDomain: callback.shopDomain, code: callback.code, clientId: config.shopifyApiKey, clientSecret: config.shopifyApiSecret, redirectUri: state.redirectUri, codeVerifier, fetchImpl: dependencies.fetchImpl });
      } catch (error) {
        request.log.error({ err: error, shopDomain: callback.shopDomain }, 'shopify token exchange failed');
        throw badRequest('Shopify rejected the authorization code', 'token_exchange_failed');
      }
      const client = new ShopifyGraphqlClient({ shopDomain: callback.shopDomain, accessToken: token.accessToken, apiVersion: config.shopifyApiVersion, fetchImpl: dependencies.fetchImpl });
      let profile: Awaited<ReturnType<typeof fetchShopProfile>>;
      try {
        profile = await fetchShopProfile(client);
      } catch (error) {
        request.log.error({ err: error, shopDomain: callback.shopDomain }, 'shopify shop profile fetch failed');
        throw badRequest('The store profile could not be read with the granted token', 'shop_profile_failed');
      }
      const requestedWorkspaceId = state.workspaceId ?? existing?.id ?? randomUUID();
      const workspaceId = await upsertWorkspace(db, { id: requestedWorkspaceId, shopDomain: callback.shopDomain, name: profile.name, currencyCode: profile.currencyCode, timeZone: profile.timeZone, shopifyShopId: profile.id });
      await upsertInstallation(db, {
        workspaceId,
        encryptedOfflineToken: encryptToken(token.accessToken, config.shopifyTokenEncryptionKey),
        encryptedRefreshToken: token.refreshToken ? encryptToken(token.refreshToken, config.shopifyTokenEncryptionKey) : null,
        accessTokenExpiresAt: tokenExpiry(token.expiresIn, clock()),
        refreshTokenExpiresAt: tokenExpiry(token.refreshTokenExpiresIn, clock()),
        scopes: token.scopes.length > 0 ? token.scopes : config.shopifyScopes,
        apiVersion: config.shopifyApiVersion,
      });
      await ensureAppUser(db, state.userId);
      const membershipAdded = await addWorkspaceMember(db, workspaceId, state.userId, 'owner');
      await recordAuditEvent(db, { workspaceId, actorUserId: state.userId, action: membershipAdded ? 'shopify.installed' : 'shopify.reinstalled', resourceType: 'workspace', resourceId: workspaceId, metadata: { shopDomain: callback.shopDomain, apiVersion: config.shopifyApiVersion, membershipAdded } });
      await enqueueJob(db, { workspaceId, resource: 'full_sync', idempotencyKey: `install:${workspaceId}:${randomUUID()}`, maxAttempts: config.ingestionMaxAttempts, payload: { resources: ['products', 'customers', 'orders', 'abandoned_checkouts'] } });
      if (acceptsJson(request)) {
        const workspace = await getWorkspaceDto(db, workspaceId, state.userId);
        if (!workspace) throw notFound('Workspace was not found');
        return reply.send({ workspace });
      }
      return reply.redirect(postInstallReturnUrl(state.returnUrl, workspaceId));
    } catch (error) {
      if (error instanceof AppError) throw error;
      request.log.error({ err: error, shopDomain: request.query && typeof (request.query as Record<string, unknown>).shop === 'string' ? (request.query as Record<string, string>).shop : undefined }, 'shopify install callback failed');
      throw badRequest('Shopify authorization could not be completed', 'oauth_callback_failed');
    }
  });

  app.post('/v1/webhooks/shopify', { config: { rawBody: true } }, async (request, reply) => {
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!rawBody) throw badRequest('Raw webhook body is required');
    const topic = headerValue(request, 'x-shopify-topic');
    let result;
    try {
      result = await acceptWebhook(db, {
        rawBody,
        hmac: headerValue(request, 'x-shopify-hmac-sha256'),
        webhookId: headerValue(request, 'x-shopify-webhook-id'),
        shopDomain: headerValue(request, 'x-shopify-shop-domain'),
        topic,
        apiVersion: headerValue(request, 'x-shopify-api-version'),
        maxAttempts: config.ingestionMaxAttempts,
        secret: config.shopifyWebhookSecret,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook could not be accepted';
      if (/HMAC|headers|topic|registered|valid JSON|body must|shop does not match|shop id|domain|required/i.test(message)) throw badRequest(message, 'invalid_webhook');
      throw error;
    }
    return reply.code(200).send({ received: true, duplicate: result.duplicate });
  });

  app.get('/v1/workspaces', async (request) => {
    const user = requireAuth(request);
    await ensureAppUser(db, user.id, user.email);
    return { items: await listWorkspaces(db, user.id) };
  });

  app.get('/v1/workspaces/:workspaceId', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, workspaceId);
    const workspace = await getWorkspaceDto(db, workspaceId, user.id);
    if (!workspace) throw notFound('Workspace was not found');
    return workspace;
  });

  app.get('/v1/workspaces/:workspaceId/members', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, workspaceId, ['owner', 'admin']);
    return { items: await listWorkspaceMembers(db, workspaceId) };
  });

  app.post('/v1/workspaces/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const actor = requireAuth(request);
    await requireWorkspaceMembership(db, actor.id, workspaceId, ['owner', 'admin']);
    const body = memberBody.parse(request.body);
    await assertMembershipRoleAllowed(actor.id, workspaceId, body.role, db);
    await ensureAppUser(db, body.userId);
    const inserted = await addWorkspaceMember(db, workspaceId, body.userId, body.role);
    if (!inserted) return reply.code(409).send({ userId: body.userId, status: 'already_member' });
    await recordAuditEvent(db, { workspaceId, actorUserId: actor.id, action: 'workspace.member_added', resourceType: 'workspace_member', resourceId: body.userId, metadata: { role: body.role }, requestId: request.id });
    return reply.code(201).send({ userId: body.userId, role: body.role, status: 'active' });
  });

  app.patch('/v1/workspaces/:workspaceId/members/:userId', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const { userId } = z.object({ userId: z.string().min(1).max(256) }).parse(request.params);
    const actor = requireAuth(request);
    await requireWorkspaceMembership(db, actor.id, workspaceId, ['owner', 'admin']);
    const body = memberRoleBody.parse(request.body);
    await assertMembershipRoleAllowed(actor.id, workspaceId, body.role, db);
    const current = (await listWorkspaceMembers(db, workspaceId)).find((member) => member.userId === userId);
    if (!current) throw notFound('Workspace member was not found');
    if (current.role === 'owner') await requireWorkspaceMembership(db, actor.id, workspaceId, ['owner']);
    const updated = await updateWorkspaceMemberRole(db, workspaceId, userId, body.role);
    if (updated === 'last_owner') throw conflict('The workspace must retain an owner', 'last_owner_required');
    if (updated !== 'updated') throw notFound('Workspace member was not found');
    await recordAuditEvent(db, { workspaceId, actorUserId: actor.id, action: 'workspace.member_role_changed', resourceType: 'workspace_member', resourceId: userId, metadata: { from: current.role, to: body.role }, requestId: request.id });
    return { userId, role: body.role, status: 'active' };
  });

  app.delete('/v1/workspaces/:workspaceId/members/:userId', async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const { userId } = z.object({ userId: z.string().min(1).max(256) }).parse(request.params);
    const actor = requireAuth(request);
    await requireWorkspaceMembership(db, actor.id, workspaceId, ['owner', 'admin']);
    const current = (await listWorkspaceMembers(db, workspaceId)).find((member) => member.userId === userId);
    if (!current) throw notFound('Workspace member was not found');
    if (current.role === 'owner') await requireWorkspaceMembership(db, actor.id, workspaceId, ['owner']);
    const removed = await removeWorkspaceMember(db, workspaceId, userId);
    if (removed === 'last_owner') throw conflict('The workspace must retain an owner', 'last_owner_required');
    if (removed !== 'removed') throw notFound('Workspace member was not found');
    await recordAuditEvent(db, { workspaceId, actorUserId: actor.id, action: 'workspace.member_removed', resourceType: 'workspace_member', resourceId: userId, metadata: { role: current.role }, requestId: request.id });
    return reply.code(204).send();
  });

  app.get('/v1/workspaces/:workspaceId/overview', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, workspaceId);
    const range = parseRange(request.query);
    const overview = await getOverview(db, workspaceId, range, clock(), user.id);
    if (!overview) throw notFound('Workspace was not found');
    return overview;
  });

  app.get('/v1/workspaces/:workspaceId/products', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, workspaceId);
    const query = productListQuery.parse(request.query);
    const pagination = parsePagination(query);
    return listProducts(db, workspaceId, pagination.limit, pagination.cursor, { search: query.q, category: query.category });
  });

  app.get('/v1/workspaces/:workspaceId/products/:id', async (request) => {
    const { workspaceId, id } = idParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, workspaceId);
    const range = parseRange(request.query);
    const detail = await getProductDetail(db, workspaceId, id, range, user.id);
    if (!detail) throw notFound('Product was not found');
    return detail;
  });

  app.get('/v1/workspaces/:workspaceId/orders', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, workspaceId);
    const range = parseRange(request.query);
    const query = orderListQuery.parse(request.query);
    const pagination = parsePagination(query);
    return listOrders(db, workspaceId, range, pagination.limit, pagination.cursor, query.customerId, query.includeCancelled);
  });

  app.get('/v1/workspaces/:workspaceId/customers', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, workspaceId);
    const range = parseRange(request.query);
    const query = customerListQuery.parse(request.query);
    const pagination = parsePagination(query);
    return listCustomers(db, workspaceId, range, pagination.limit, pagination.cursor, query.q);
  });

  app.get('/v1/workspaces/:workspaceId/customers/:id', async (request) => {
    const { workspaceId, id } = idParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, workspaceId);
    const range = parseRange(request.query);
    const detail = await getCustomerDetail(db, workspaceId, id, range, user.id, z.object({ includeCancelled: optionalBooleanQuery }).parse(request.query).includeCancelled);
    if (!detail) throw notFound('Customer was not found');
    return detail;
  });

  app.get('/v1/workspaces/:workspaceId/sync', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, workspaceId);
    return getSyncStatus(db, workspaceId);
  });

  app.get('/v1/workspaces/:workspaceId/jobs/:jobId', async (request) => {
    const { workspaceId, jobId } = z.object({ workspaceId: z.string().min(1).max(128), jobId: z.string().uuid() }).parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, workspaceId);
    const job = await getIngestionJob(db, workspaceId, jobId);
    if (!job) throw notFound('Ingestion job was not found');
    return job;
  });

  app.post('/v1/workspaces/:workspaceId/sync', async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, workspaceId, ['owner', 'admin']);
    const body = syncBody.parse(request.body ?? {});
    const resources = body.resources ?? ['products', 'customers', 'orders', 'abandoned_checkouts'];
    const result = await enqueueJob(db, { workspaceId, resource: 'full_sync', idempotencyKey: idempotencyKey(request, `manual-sync:${workspaceId}`), maxAttempts: config.ingestionMaxAttempts, payload: { resources } });
    await recordAuditEvent(db, { workspaceId, actorUserId: user.id, action: 'sync.enqueued', resourceType: 'ingestion_job', resourceId: result.job.id, metadata: { resources }, requestId: request.id });
    return reply.code(result.inserted ? 202 : 200).send({ jobId: result.job.id, status: result.job.status, duplicate: !result.inserted });
  });

  app.post('/v1/workspaces/:workspaceId/events', async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, workspaceId);
    const body = eventBody.parse(request.body);
    const result = await enqueueJob(db, { workspaceId, resource: 'custom_event', idempotencyKey: `event:${workspaceId}:${body.id}`, maxAttempts: config.ingestionMaxAttempts, payload: body });
    await recordAuditEvent(db, { workspaceId, actorUserId: user.id, action: 'custom_event.enqueued', resourceType: 'custom_event', resourceId: body.id, requestId: request.id });
    return reply.code(result.inserted ? 202 : 200).send({ eventId: body.id, status: result.job.status, duplicate: !result.inserted });
  });

  app.get('/v1/tenants', async (request) => {
    const user = requireAuth(request);
    await ensureAppUser(db, user.id, user.email);
    return { items: await listWorkspaces(db, user.id) };
  });

  app.get('/v1/tenants/:tenantId', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, tenantId);
    const workspace = await getWorkspaceDto(db, tenantId, user.id);
    if (!workspace) throw notFound('Workspace was not found');
    return workspace;
  });

  app.get('/v1/tenants/:tenantId/summary', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, tenantId);
    const overview = await getOverview(db, tenantId, parseRange(request.query), clock(), user.id);
    if (!overview) throw notFound('Workspace was not found');
    return overview;
  });

  app.get('/v1/tenants/:tenantId/revenue', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, tenantId);
    const overview = await getOverview(db, tenantId, parseRange(request.query), clock(), user.id);
    if (!overview) throw notFound('Workspace was not found');
     return { range: overview.range, generatedAt: overview.generatedAt, currencyCode: overview.currencyCode, metricBasis: overview.metricBasis, trend: overview.trend };
  });

  app.get('/v1/tenants/:tenantId/products', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, tenantId);
    const query = productListQuery.parse(request.query);
    const pagination = parsePagination(query);
    return listProducts(db, tenantId, pagination.limit, pagination.cursor, { search: query.q, category: query.category });
  });

  app.get('/v1/tenants/:tenantId/products/:id', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const { id } = z.object({ id: z.string().min(1).max(256) }).parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, tenantId);
    const detail = await getProductDetail(db, tenantId, id, parseRange(request.query), user.id);
    if (!detail) throw notFound('Product was not found');
    return detail;
  });

  app.get('/v1/tenants/:tenantId/orders', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, tenantId);
    const range = parseRange(request.query);
    const query = orderListQuery.parse(request.query);
    const pagination = parsePagination(query);
    return listOrders(db, tenantId, range, pagination.limit, pagination.cursor, query.customerId, query.includeCancelled);
  });

  app.get('/v1/tenants/:tenantId/customers', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, tenantId);
    const range = parseRange(request.query);
    const query = customerListQuery.parse(request.query);
    const pagination = parsePagination(query);
    return listCustomers(db, tenantId, range, pagination.limit, pagination.cursor, query.q);
  });

  app.get('/v1/tenants/:tenantId/customers/:id', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const { id } = z.object({ id: z.string().min(1).max(256) }).parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, tenantId);
    const detail = await getCustomerDetail(db, tenantId, id, parseRange(request.query), user.id, z.object({ includeCancelled: optionalBooleanQuery }).parse(request.query).includeCancelled);
    if (!detail) throw notFound('Customer was not found');
    return detail;
  });

  app.get('/v1/tenants/:tenantId/jobs/:jobId', async (request) => {
    const { tenantId, jobId } = z.object({ tenantId: z.string().min(1).max(128), jobId: z.string().uuid() }).parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, tenantId);
    const job = await getIngestionJob(db, tenantId, jobId);
    if (!job) throw notFound('Ingestion job was not found');
    return job;
  });

  app.get('/v1/tenants/:tenantId/sync-runs', async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    await requireWorkspaceMembership(db, requireAuth(request).id, tenantId);
    return getSyncStatus(db, tenantId);
  });

  app.post('/v1/tenants/:tenantId/sync-runs', async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const user = requireAuth(request);
    await requireWorkspaceMembership(db, user.id, tenantId, ['owner', 'admin']);
    const body = syncBody.parse(request.body ?? {});
    const resources = body.resources ?? ['products', 'customers', 'orders', 'abandoned_checkouts'];
    const result = await enqueueJob(db, { workspaceId: tenantId, resource: 'full_sync', idempotencyKey: idempotencyKey(request, `manual-sync:${tenantId}`), maxAttempts: config.ingestionMaxAttempts, payload: { resources } });
    await recordAuditEvent(db, { workspaceId: tenantId, actorUserId: user.id, action: 'sync.enqueued', resourceType: 'ingestion_job', resourceId: result.job.id, metadata: { resources }, requestId: request.id });
    return reply.code(result.inserted ? 202 : 200).send({ jobId: result.job.id, status: result.job.status, duplicate: !result.inserted });
  });
}

async function assertMembershipRoleAllowed(actorId: string, workspaceId: string, targetRole: string, db: Database): Promise<void> {
  if (targetRole !== 'owner') return;
  const actor = await requireWorkspaceMembership(db, actorId, workspaceId, ['owner']);
  if (actor.role !== 'owner') throw forbidden('Only an owner can assign the owner role');
}

function parsePagination(query: unknown): { limit: number; cursor?: string } {
  const parsed = listQuery.parse(query);
  try {
    return { limit: parseLimit(parsed.limit), ...(parsed.cursor ? { cursor: validateCursor(parsed.cursor) } : {}) };
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid pagination', 'invalid_pagination');
  }
}

function validateCursor(value: string): string {
  decodeCursor(value);
  return value;
}

function parseRange(query: unknown): ReturnType<typeof resolveRange> {
  const parsed = rangeQuery.parse(query);
  try {
    return resolveRange(parsed);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid date range', 'invalid_range');
  }
}

function acceptsJson(request: FastifyRequest): boolean {
  const value = request.headers.accept;
  const accepted = Array.isArray(value) ? value.join(',') : value ?? '';
  return accepted.split(',').some((entry) => {
    const mediaType = entry.trim().toLowerCase().split(';', 1)[0] ?? '';
    return mediaType === 'application/json' || mediaType.endsWith('+json');
  });
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function idempotencyKey(request: FastifyRequest, prefix: string): string {
  const provided = headerValue(request, 'idempotency-key');
  if (provided && provided.length > 256) throw badRequest('idempotency-key is too long', 'invalid_idempotency_key');
  if (provided) return `${prefix}:${provided}`;
  return `${prefix}:${request.id}`;
}

function hashState(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function tokenExpiry(seconds: number | undefined, now: Date): Date | null {
  return seconds === undefined ? null : new Date(now.getTime() + seconds * 1000);
}
