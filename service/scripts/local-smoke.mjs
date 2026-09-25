import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Pool } from 'pg';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { databasePoolConfig } from '../dist/db/client.js';

const port = Number(process.env.SMOKE_PORT ?? 4599);
const jwksPort = port + 1;
const issuer = `http://127.0.0.1:${jwksPort}/auth/v1`;
const jwksUrl = `${issuer}/.well-known/jwks.json`;
const databaseUrl = process.env.SMOKE_DATABASE_URL;
if (!databaseUrl) throw new Error('SMOKE_DATABASE_URL is required');

const webhookSecret = 'smoke-webhook-secret';
const encryptionKey = randomBytes(32).toString('base64');
const failures = [];
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`  FAIL ${label}${detail ? ` :: ${detail}` : ''}`);
}

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = { keys: [{ ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig' }] };
const jwksServer = createServer((request, response) => {
  if (request.url?.startsWith('/auth/v1/.well-known/jwks.json')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(jwks));
    return;
  }
  response.writeHead(404).end();
});
await new Promise((done) => jwksServer.listen(jwksPort, '127.0.0.1', done));

async function mintToken(subject, email, issuerOverride) {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'RS256', kid: jwks.keys[0].kid })
    .setSubject(subject)
    .setIssuer(issuerOverride ?? issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

function signWebhook(rawBody) {
  return createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('base64');
}

const serviceEnv = {
  ...process.env,
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: String(port),
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: process.env.SMOKE_DATABASE_SSL === 'true' ? 'true' : 'false',
  SUPABASE_JWT_ISSUER: issuer,
  SUPABASE_JWKS_URL: jwksUrl,
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  SHOPIFY_API_KEY: 'smoke-client-id',
  SHOPIFY_API_SECRET: 'smoke-client-secret',
  SHOPIFY_WEBHOOK_SECRET: webhookSecret,
  SHOPIFY_API_VERSION: '2026-07',
  SHOPIFY_TOKEN_ENCRYPTION_KEY: encryptionKey,
  SHOPIFY_SCOPES: 'read_products,read_customers,read_orders',
  APP_BASE_URL: `http://127.0.0.1:${port}`,
  SHOPIFY_OAUTH_CALLBACK_URL: `http://127.0.0.1:${port}/v1/auth/shopify/callback`,
  SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL: 'threadline://shopify/install',
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'debug',
  TRUST_PROXY: 'false',
};

const service = spawn(process.execPath, ['dist/index.js'], { env: serviceEnv, stdio: ['ignore', 'pipe', 'pipe'] });
const serviceLog = [];
service.stdout.on('data', (chunk) => serviceLog.push(String(chunk)));
service.stderr.on('data', (chunk) => serviceLog.push(String(chunk)));

const pool = new Pool(databasePoolConfig(databaseUrl, process.env.SMOKE_DATABASE_SSL === 'true', 'development'));
const workspaceId = `smoke-${randomUUID()}`;
const ownerId = `smoke-owner-${randomUUID()}`;
const viewerId = `smoke-viewer-${randomUUID()}`;
const shopDomain = `${workspaceId}.myshopify.com`;
const base = `http://127.0.0.1:${port}`;

async function call(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, { redirect: 'manual', ...options });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, headers: response.headers, body };
}

try {
  let booted = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const probe = await fetch(`${base}/health/live`);
      if (probe.status === 200) { booted = true; break; }
    } catch {}
    await sleep(500);
  }
  if (!booted) throw new Error(`service did not boot:\n${serviceLog.join('')}`);
  console.log('service booted');

  await pool.query('insert into workspaces (id, shop_domain, name, currency_code, time_zone) values ($1,$2,$3,$4,$5)', [workspaceId, shopDomain, 'Smoke Shop', 'USD', 'America/New_York']);
  await pool.query('insert into shopify_installations (workspace_id, encrypted_offline_token, scopes, api_version) values ($1,$2,$3,$4)', [workspaceId, 'smoke-encrypted-token', ['read_products', 'read_orders'], '2026-07']);
  await pool.query('insert into app_users (id, email) values ($1,$2),($3,$4)', [ownerId, 'owner@example.test', viewerId, 'viewer@example.test']);
  await pool.query('insert into workspace_members (workspace_id, user_id, role) values ($1,$2,$3),($4,$5,$6)', [workspaceId, ownerId, 'owner', workspaceId, viewerId, 'viewer']);
  await pool.query('insert into customers (workspace_id, id, email, first_name, last_name, orders_count, total_spent) values ($1,$2,$3,$4,$5,$6,$7)', [workspaceId, 'cust-1', 'buyer@example.test', 'Buyer', 'One', 2, '40.00']);
  const nowIso = new Date().toISOString();
  await pool.query('insert into orders (workspace_id, id, name, customer_id, email, financial_status, fulfillment_status, currency_code, subtotal_price, total_discounts, total_tax, total_price, total_units, processed_at, shopify_created_at, shopify_updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$14)', [workspaceId, 'order-1', '#1001', 'cust-1', 'buyer@example.test', 'PAID', 'FULFILLED', 'USD', '40.00', '0', '0', '40.00', 2, nowIso]);
  await pool.query('insert into products (workspace_id, id, title, handle, category, status, variants_complete) values ($1,$2,$3,$4,$5,$6,$7)', [workspaceId, 'prod-1', 'Smoke Widget', 'smoke-widget', 'Widgets', 'ACTIVE', true]);
  await pool.query('insert into checkouts (workspace_id, id, email, currency_code, total_price, subtotal_price, total_quantity) values ($1,$2,$3,$4,$5,$6,$7)', [workspaceId, 'checkout-1', 'buyer@example.test', 'USD', '25.00', '25.00', 1]);

  const ownerToken = await mintToken(ownerId, 'owner@example.test');
  const viewerToken = await mintToken(viewerId, 'viewer@example.test');
  const auth = (token) => ({ authorization: `Bearer ${token}` });

  console.log('\nhealth');
  const live = await call('/health/live');
  check('liveness is 200', live.status === 200, `got ${live.status}`);
  const ready = await call('/health/ready');
  check('readiness is 200 against a real database', ready.status === 200, `got ${ready.status} ${JSON.stringify(ready.body)}`);
  check('readiness reports the database up', ready.body?.resources?.database?.status === 'up', JSON.stringify(ready.body?.resources?.database));
  check('readiness reports token encryption up', ready.body?.resources?.tokenEncryption?.status === 'up', JSON.stringify(ready.body?.resources?.tokenEncryption));

  console.log('\nauthentication');
  const noAuth = await call(`/v1/workspaces/${workspaceId}/overview`);
  check('missing bearer is 401', noAuth.status === 401, `got ${noAuth.status}`);
  check('401 is a problem+json body', noAuth.headers.get('content-type')?.includes('application/problem+json'), noAuth.headers.get('content-type') ?? 'none');
  const badToken = await call(`/v1/workspaces/${workspaceId}/overview`, { headers: { authorization: 'Bearer not-a-jwt' } });
  check('malformed bearer is 401', badToken.status === 401, `got ${badToken.status}`);
  const wrongIssuer = await call(`/v1/workspaces/${workspaceId}/overview`, { headers: auth(await mintToken(ownerId, 'owner@example.test', 'https://evil.example')) });
  check('token with the wrong issuer is 401', wrongIssuer.status === 401, `got ${wrongIssuer.status}`);
  const expired = await new SignJWT({ email: 'owner@example.test', role: 'authenticated' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(ownerId)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(privateKey);
  const expiredCall = await call(`/v1/workspaces/${workspaceId}/overview`, { headers: auth(expired) });
  check('expired token is 401', expiredCall.status === 401, `got ${expiredCall.status}`);

  console.log('\ntenant reads');
  const overview = await call(`/v1/workspaces/${workspaceId}/overview`, { headers: auth(ownerToken) });
  check('owner reads overview', overview.status === 200, `got ${overview.status} ${JSON.stringify(overview.body).slice(0, 200)}`);
  check('overview states its metric basis', overview.body?.metricBasis === 'gross_non_cancelled_order_value', JSON.stringify(overview.body?.metricBasis));
  check('overview uses the workspace currency', overview.body?.currencyCode === 'USD', JSON.stringify(overview.body?.currencyCode));
  const trend = overview.body?.trend;
  check('overview trend is dense (30d preset yields 31 daily points)', Array.isArray(trend) && trend.length === 31, `got ${Array.isArray(trend) ? trend.length : typeof trend}`);
  check('overview includes today\'s order in the trend', Array.isArray(trend) && Number(trend.at(-1)?.revenue) === 40, JSON.stringify(trend?.at(-1)));
  check('today is the last trend point', trend?.at(-1)?.date === new Date().toISOString().slice(0, 10), trend?.at(-1)?.date);

  const customers = await call(`/v1/workspaces/${workspaceId}/customers?limit=10`, { headers: auth(ownerToken) });
  check('owner lists customers', customers.status === 200 && Array.isArray(customers.body?.items), `got ${customers.status}`);
  check('customer list carries the seeded row', customers.body?.items?.some((row) => row.id === 'cust-1'), JSON.stringify(customers.body?.items?.map((row) => row.id)));
  const orders = await call(`/v1/workspaces/${workspaceId}/orders?limit=10`, { headers: auth(ownerToken) });
  check('owner lists orders', orders.status === 200 && orders.body?.items?.some((row) => row.id === 'order-1'), `got ${orders.status}`);
  const products = await call(`/v1/workspaces/${workspaceId}/products?limit=10`, { headers: auth(ownerToken) });
  check('owner lists products', products.status === 200 && products.body?.items?.some((row) => row.id === 'prod-1'), `got ${products.status}`);
  const checkoutsList = await call(`/v1/workspaces/${workspaceId}/checkouts?limit=10`, { headers: auth(ownerToken) });
  console.log(`  note  abandoned checkouts endpoint returns ${checkoutsList.status} (data is ingested but not exposed)`);
  const search = await call(`/v1/workspaces/${workspaceId}/products?q=widget&limit=10`, { headers: auth(ownerToken) });
  check('product search filters server-side', search.status === 200 && search.body?.items?.length === 1, `got ${search.status} ${search.body?.items?.length}`);
  const searchMiss = await call(`/v1/workspaces/${workspaceId}/products?q=nothingmatchesthis&limit=10`, { headers: auth(ownerToken) });
  check('product search returns empty rather than everything', searchMiss.status === 200 && searchMiss.body?.items?.length === 0, `got ${searchMiss.body?.items?.length}`);

  console.log('\ntenant isolation');
  const otherToken = await mintToken(`stranger-${randomUUID()}`, 'stranger@example.test');
  const stranger = await call(`/v1/workspaces/${workspaceId}/overview`, { headers: auth(otherToken) });
  check('non-member cannot read the workspace', [403, 404].includes(stranger.status), `got ${stranger.status}`);
  const strangerMembers = await call(`/v1/workspaces/${workspaceId}/members`, { headers: auth(otherToken) });
  check('non-member cannot list members', [403, 404].includes(strangerMembers.status), `got ${strangerMembers.status}`);

  console.log('\nauthorization');
  const viewerMembers = await call(`/v1/workspaces/${workspaceId}/members`, { headers: auth(viewerToken) });
  check('viewer cannot read the member roster (owner/admin only, matching the client gate)', viewerMembers.status === 403, `got ${viewerMembers.status}`);
  const viewerSync = await call(`/v1/workspaces/${workspaceId}/sync`, { method: 'POST', headers: { ...auth(viewerToken), 'content-type': 'application/json' }, body: JSON.stringify({ resources: ['products'] }) });
  check('viewer cannot start a sync', viewerSync.status === 403, `got ${viewerSync.status} ${JSON.stringify(viewerSync.body).slice(0, 160)}`);
  const ownerSync = await call(`/v1/workspaces/${workspaceId}/sync`, { method: 'POST', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ resources: ['products', 'orders', 'abandoned_checkouts'] }) });
  check('owner can start a sync', ownerSync.status === 202 || ownerSync.status === 200, `got ${ownerSync.status} ${JSON.stringify(ownerSync.body).slice(0, 200)}`);
  const badResource = await call(`/v1/workspaces/${workspaceId}/sync`, { method: 'POST', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ resources: ['carts'] }) });
  check('removed cart resource is rejected with 400', badResource.status === 400, `got ${badResource.status}`);
  check('rejection names the invalid resource', JSON.stringify(badResource.body).includes('carts'), JSON.stringify(badResource.body).slice(0, 200));
  const emptyResources = await call(`/v1/workspaces/${workspaceId}/sync`, { method: 'POST', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ resources: [] }) });
  check('empty resource list is rejected', emptyResources.status === 400, `got ${emptyResources.status}`);

  console.log('\nmember management');
  const promote = await call(`/v1/workspaces/${workspaceId}/members/${viewerId}`, { method: 'PATCH', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) });
  check('owner can change a role', promote.status === 200, `got ${promote.status} ${JSON.stringify(promote.body).slice(0, 200)}`);
  const lastOwner = await call(`/v1/workspaces/${workspaceId}/members/${ownerId}`, { method: 'PATCH', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ role: 'viewer' }) });
  check('the last owner cannot be demoted', lastOwner.status === 409 || lastOwner.status === 400, `got ${lastOwner.status} ${JSON.stringify(lastOwner.body).slice(0, 160)}`);
  const removeMember = await call(`/v1/workspaces/${workspaceId}/members/${viewerId}`, { method: 'DELETE', headers: auth(ownerToken) });
  check('owner can remove a member', removeMember.status === 200 || removeMember.status === 204, `got ${removeMember.status} ${JSON.stringify(removeMember.body).slice(0, 160)}`);

  console.log('\ninstall flow');
  const install = await call('/v1/auth/shopify/install', { method: 'POST', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ shop: shopDomain, returnUrl: 'threadline://shopify/install' }) });
  check('install returns an authorization url', install.status === 201 && typeof install.body?.authorizationUrl === 'string', `got ${install.status} ${JSON.stringify(install.body).slice(0, 200)}`);
  const authorizeUrl = install.body?.authorizationUrl ? new URL(install.body.authorizationUrl) : null;
  check('authorization url points at the shop', authorizeUrl?.host === shopDomain, authorizeUrl?.host ?? 'none');
  check('authorization url asks for the configured scopes', authorizeUrl?.searchParams.get('scope') === 'read_products,read_customers,read_orders', authorizeUrl?.searchParams.get('scope') ?? 'none');
  check('authorization url carries state and redirect_uri', Boolean(authorizeUrl?.searchParams.get('state')) && authorizeUrl?.searchParams.get('redirect_uri') === serviceEnv.SHOPIFY_OAUTH_CALLBACK_URL, 'missing');
  const badShop = await call('/v1/auth/shopify/install', { method: 'POST', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ shop: 'not-a-shop', returnUrl: 'threadline://shopify/install' }) });
  check('invalid shop domain is 400', badShop.status === 400, `got ${badShop.status}`);
  const badReturn = await call('/v1/auth/shopify/install', { method: 'POST', headers: { ...auth(ownerToken), 'content-type': 'application/json' }, body: JSON.stringify({ shop: shopDomain, returnUrl: 'https://attacker.example/steal' }) });
  check('an off-site return url is refused', badReturn.status === 400, `got ${badReturn.status}`);

  console.log('\nwebhooks');
  const webhookId = randomUUID();
  const event = { id: randomUUID(), topic: 'products/update', shopDomain, shop: shopDomain, apiVersion: '2026-07', triggeredAt: Math.floor(Date.now() / 1000) };
  const rawBody = JSON.stringify(event);
  const goodHmac = await call('/v1/webhooks/shopify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': signWebhook(rawBody), 'x-shopify-webhook-id': webhookId, 'x-shopify-topic': 'products/update', 'x-shopify-shop-domain': shopDomain, 'x-shopify-api-version': '2026-07' }, body: rawBody });
  check('correctly signed webhook is accepted with 200', goodHmac.status === 200, `got ${goodHmac.status} ${JSON.stringify(goodHmac.body).slice(0, 200)}`);
  const duplicate = await call('/v1/webhooks/shopify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': signWebhook(rawBody), 'x-shopify-webhook-id': webhookId, 'x-shopify-topic': 'products/update', 'x-shopify-shop-domain': shopDomain, 'x-shopify-api-version': '2026-07' }, body: rawBody });
  check('a replayed webhook id is deduplicated', duplicate.status === 200 && duplicate.body?.duplicate === true, `got ${duplicate.status} ${JSON.stringify(duplicate.body)}`);
  const badHmac = await call('/v1/webhooks/shopify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': 'bm90LXZhbGlkLWhtYWM=', 'x-shopify-webhook-id': randomUUID(), 'x-shopify-topic': 'products/update', 'x-shopify-shop-domain': shopDomain }, body: rawBody });
  check('badly signed webhook is 400', badHmac.status === 400, `got ${badHmac.status}`);
  const hexHmac = await call('/v1/webhooks/shopify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': createHmac('sha256', webhookSecret).update(rawBody).digest('hex'), 'x-shopify-webhook-id': randomUUID(), 'x-shopify-topic': 'products/update', 'x-shopify-shop-domain': shopDomain }, body: rawBody });
  check('a hex digest is refused because Shopify sends base64', hexHmac.status === 400, `got ${hexHmac.status}`);
  const cartWebhook = await call('/v1/webhooks/shopify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': signWebhook(rawBody), 'x-shopify-webhook-id': randomUUID(), 'x-shopify-topic': 'carts/update', 'x-shopify-shop-domain': shopDomain }, body: rawBody });
  check('unsupported cart webhook topic is rejected', cartWebhook.status === 400, `got ${cartWebhook.status}`);

  console.log('\nrequest hygiene');
  const requestId = await call('/v1/workspaces', { headers: { ...auth(ownerToken), 'x-request-id': 'smoke-request-id' } });
  check('server echoes an adopted request id', requestId.headers.get('x-request-id') === 'smoke-request-id', requestId.headers.get('x-request-id') ?? 'none');
  const badRequestId = await call('/v1/workspaces', { headers: { ...auth(ownerToken), 'x-request-id': 'has spaces and <brackets>' } });
  check('invalid request id is 400', badRequestId.status === 400, `got ${badRequestId.status}`);
  const cors = await call('/v1/workspaces', { headers: { ...auth(ownerToken), origin: 'http://localhost:3000' } });
  check('allowed origin is echoed', cors.headers.get('access-control-allow-origin') === 'http://localhost:3000', cors.headers.get('access-control-allow-origin') ?? 'none');
  const evilCors = await call('/v1/workspaces', { headers: { ...auth(ownerToken), origin: 'https://evil.example' } });
  check('disallowed origin is not echoed', evilCors.headers.get('access-control-allow-origin') === null, evilCors.headers.get('access-control-allow-origin') ?? 'none');
  const helmet = await call('/health/live');
  check('security headers are present', helmet.headers.get('x-content-type-options') === 'nosniff', helmet.headers.get('x-content-type-options') ?? 'none');
  const unknown = await call('/v1/definitely-not-a-route', { headers: auth(ownerToken) });
  check('unknown route is 404 problem+json', unknown.status === 404 && unknown.headers.get('content-type')?.includes('application/problem+json'), `got ${unknown.status}`);

  console.log('\nvalidation');
  const badRange = await call(`/v1/workspaces/${workspaceId}/overview?preset=not-a-preset`, { headers: auth(ownerToken) });
  check('invalid range is 400', badRange.status === 400, `got ${badRange.status}`);
  const badLimit = await call(`/v1/workspaces/${workspaceId}/products?limit=9999`, { headers: auth(ownerToken) });
  check('out-of-range limit is 400', badLimit.status === 400, `got ${badLimit.status}`);
  const badCursor = await call(`/v1/workspaces/${workspaceId}/products?cursor=not-a-cursor`, { headers: auth(ownerToken) });
  check('malformed cursor is 400', badCursor.status === 400, `got ${badCursor.status}`);

  console.log(`\n${checks - failures.length}/${checks} checks passed`);
  if (failures.length > 0) {
    console.log('failures:');
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log('\nservice errors:');
    for (const line of serviceLog.join('').split('\n').filter((entry) => entry.includes('"level":50'))) {
      console.log(line.slice(0, 1200));
    }
    console.log('\nservice log tail:');
    console.log(serviceLog.join('').split('\n').slice(-10).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('local-smoke-valid');
  }
} finally {
  service.kill('SIGTERM');
  await sleep(300);
  if (!service.killed) service.kill('SIGKILL');
  jwksServer.close();
  for (const statement of [
    'delete from order_lines where workspace_id = $1',
    'delete from refunds where workspace_id = $1',
    'delete from checkouts where workspace_id = $1',
    'delete from carts where workspace_id = $1',
    'delete from orders where workspace_id = $1',
    'delete from product_variants where workspace_id = $1',
    'delete from products where workspace_id = $1',
    'delete from customers where workspace_id = $1',
    'delete from ingestion_job_resources where workspace_id = $1',
    'delete from ingestion_jobs where workspace_id = $1',
    'delete from webhook_events where workspace_id = $1',
    'delete from audit_events where workspace_id = $1',
    'delete from workspace_members where workspace_id = $1',
    'delete from shopify_installations where workspace_id = $1',
    'delete from sync_cursors where workspace_id = $1',
    'delete from sync_runs where workspace_id = $1',
    'delete from oauth_states where workspace_id = $1',
    'delete from app_users where id = any($1)',
    'delete from workspaces where id = $1',
  ]) {
    try {
      await pool.query(statement, [workspaceId, [ownerId, viewerId]]);
    } catch {}
  }
  await pool.end();
}
