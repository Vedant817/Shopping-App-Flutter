import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const SHOP = 'vedant-mahajan-store.myshopify.com';
const base = env.API_BASE_URL.replace(/\/+$/, '');
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
}

const db = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
});

async function post(topic, body, { signature, webhookId = randomUUID() } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = {
    'content-type': 'application/json',
    'x-shopify-topic': topic,
    'x-shopify-shop-domain': SHOP,
    'x-shopify-webhook-id': webhookId,
    'x-shopify-api-version': env.SHOPIFY_API_VERSION,
  };
  if (signature) headers['x-shopify-hmac-sha256'] = signature;
  const response = await fetch(`${base}/v1/webhooks/shopify`, { method: 'POST', headers, body: raw });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: response.status, body: json };
}

const sign = (raw) => createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).update(raw, 'utf8').digest('base64');

try {
  await db.connect();

  const product = await db.query(
    `select p.id from products p join workspaces w on w.id = p.workspace_id
     where w.shop_domain = $1 order by p.title limit 1`,
    [SHOP],
  );
  const productId = product.rows[0]?.id;
  record('a synced product exists to reference', Boolean(productId), productId ?? 'none found');

  const payload = JSON.stringify({ id: Number(productId?.split('/').pop()), admin_graphql_api_id: productId });
  const signature = sign(payload);

  const accepted = await post('products/update', payload, { signature });
  record('correctly signed base64 webhook is accepted with 200', accepted.status === 200, `got ${accepted.status} ${JSON.stringify(accepted.body).slice(0, 120)}`);

  const webhookId = randomUUID();
  const first = await post('products/update', payload, { signature, webhookId });
  const replay = await post('products/update', payload, { signature, webhookId });
  record('a replayed webhook id is deduplicated', replay.status === 200 && replay.body?.duplicate === true, `got ${replay.status} duplicate=${replay.body?.duplicate}`);

  const badSignature = await post('products/update', payload, { signature: createHmac('sha256', 'wrong').digest('base64') });
  record('a webhook with the wrong secret is refused', badSignature.status === 400, `got ${badSignature.status}`);

  const hexSignature = await post('products/update', payload, { signature: createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).digest('hex') });
  record('a hex digest is refused because Shopify sends base64', hexSignature.status === 400, `got ${hexSignature.status}`);

  const unsupported = await post('carts/update', payload, { signature });
  record('an unsupported cart topic is refused', unsupported.status === 400, `got ${unsupported.status}`);

  await new Promise((resolve) => setTimeout(resolve, 6000));
  const events = await db.query(
    `select topic, status, count(*)::int as n from webhook_events
     join workspaces w on w.id = webhook_events.workspace_id
     where w.shop_domain = $1 group by topic, status order by topic`,
    [SHOP],
  );
  record('webhook events were recorded in the database', events.rows.length > 0, JSON.stringify(events.rows));

  const jobs = await db.query(
    `select j.resource, j.status, count(*)::int as n from ingestion_jobs j
     join workspaces w on w.id = j.workspace_id
     where w.shop_domain = $1 and j.created_at > now() - interval '5 minutes'
     group by j.resource, j.status`,
    [SHOP],
  );
  record('the webhook enqueued ingestion work that completed', jobs.rows.length > 0, JSON.stringify(jobs.rows));

  // RLS: the Data API roles must not be able to read token columns.
  for (const role of ['anon', 'authenticated']) {
    for (const column of ['encrypted_offline_token', 'encrypted_refresh_token']) {
      let denied = false;
      try {
        await db.query('begin');
        await db.query(`set local role ${role}`);
        await db.query(`select ${column} from shopify_installations`);
      } catch (error) {
        denied = error?.code === '42501';
      } finally {
        await db.query('rollback');
      }
      record(`RLS denies ${role} access to ${column}`, denied);
    }
  }

  let anonWorkspacesDenied = false;
  try {
    await db.query('begin');
    await db.query('set local role anon');
    await db.query('select * from workspaces');
  } catch (error) {
    anonWorkspacesDenied = error?.code === '42501';
  } finally {
    await db.query('rollback');
  }
  record('RLS denies anon access to workspaces', anonWorkspacesDenied);

  let serviceCanRead = false;
  try {
    await db.query('begin');
    await db.query('set local role service_role');
    const result = await db.query('select count(*)::int as n from shopify_installations');
    serviceCanRead = result.rows[0].n >= 1;
  } catch {
    serviceCanRead = false;
  } finally {
    await db.query('rollback');
  }
  record('service_role can still read the installation row', serviceCanRead);

  const heartbeat = await db.query('select worker_id, last_heartbeat, processed_jobs, failed_jobs from worker_heartbeats order by last_heartbeat desc limit 1');
  const beat = heartbeat.rows[0];
  const ageSeconds = beat ? Math.round((Date.now() - new Date(beat.last_heartbeat).getTime()) / 1000) : Infinity;
  record('the ingestion worker heartbeat is recent', ageSeconds < 120, beat ? `age=${ageSeconds}s processed=${beat.processed_jobs} failed=${beat.failed_jobs}` : 'no heartbeat');
} catch (error) {
  record('verification script completed', false, error.message);
} finally {
  await db.end().catch(() => {});
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
if (failed.length > 0) {
  console.log('failures:');
  for (const failure of failed) console.log(`  - ${failure.name} :: ${failure.detail}`);
  process.exitCode = 1;
} else {
  console.log('live-verification-valid');
}
