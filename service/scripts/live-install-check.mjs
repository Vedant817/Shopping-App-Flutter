import { readFileSync } from 'node:fs';
import { Client } from 'pg';

function loadEnv() {
  return Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
const apiBaseUrl = env.API_BASE_URL?.replace(/\/+$/, '');
const shop = process.argv[2] ?? process.env.VERIFY_SHOP;
const requestInstall = process.argv.includes('--request-install');
const email = env.SHOPIFY_VERIFY_USER_EMAIL;
const password = env.SHOPIFY_VERIFY_USER_PASSWORD;

if (!supabaseUrl || !publishableKey || !apiBaseUrl) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and API_BASE_URL are required in service/.env');
if (!shop) throw new Error('Pass the shop domain, for example: node scripts/live-install-check.mjs your-store.myshopify.com');
if (!email || !password) throw new Error('SHOPIFY_VERIFY_USER_EMAIL and SHOPIFY_VERIFY_USER_PASSWORD are required in service/.env');

async function signIn() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(`sign-in failed (${response.status}): ${payload.msg ?? payload.error_description ?? payload.message ?? 'unknown error'}`);
  }
  return payload.access_token;
}

function summarize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value.startsWith('v1.')) return 'encrypted token present';
    return value.length > 12 ? `${value.slice(0, 4)}...${value.length} chars` : value;
  }
  return value;
}

const token = await signIn();
console.log('signed in as', email);

const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const workspaces = await fetch(`${apiBaseUrl}/v1/workspaces`, { headers: { authorization: `Bearer ${token}` } });
const workspacePayload = await workspaces.json().catch(() => ({}));
const items = Array.isArray(workspacePayload.items) ? workspacePayload.items : [];
console.log(`workspaces visible: ${items.length}`);
for (const workspace of items) {
  console.log(`  ${workspace.shopDomain} role=${workspace.role} currency=${workspace.currencyCode}`);
}

if (requestInstall) {
  const install = await fetch(`${apiBaseUrl}/v1/auth/shopify/install`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ shop, returnUrl: env.SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL }),
  });
  const payload = await install.json().catch(() => ({}));
  if (!install.ok) {
    console.log(`install request failed (${install.status}):`, JSON.stringify(payload).slice(0, 300));
  } else {
    console.log('\nAUTHORIZATION URL — open this in a browser signed in to the store:');
    console.log(payload.authorizationUrl);
  }
}

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
});
try {
  await client.connect();
  const installation = await client.query(
    `select i.workspace_id, w.shop_domain, i.scopes, i.api_version,
            i.encrypted_offline_token, i.encrypted_refresh_token,
            i.access_token_expires_at, i.refresh_token_expires_at, i.reauthorize_required_at
     from shopify_installations i join workspaces w on w.id = i.workspace_id
     where w.shop_domain = $1`,
    [shop],
  );
  if (installation.rows.length === 0) {
    console.log(`\nno installation row for ${shop} yet`);
  } else {
    for (const row of installation.rows) {
      console.log('\ninstallation');
      console.log('  scopes:            ', (row.scopes ?? []).join(', '));
      console.log('  api version:       ', row.api_version);
      console.log('  access token:      ', summarize(row.encrypted_offline_token));
      console.log('  refresh token:     ', summarize(row.encrypted_refresh_token));
      console.log('  access expires:    ', row.access_token_expires_at ? new Date(row.access_token_expires_at).toISOString() : 'not expiring');
      console.log('  refresh expires:   ', row.refresh_token_expires_at ? new Date(row.refresh_token_expires_at).toISOString() : 'none');
      console.log('  needs reauth:      ', row.reauthorize_required_at ? new Date(row.reauthorize_required_at).toISOString() : 'no');
    }
  }

  const jobs = await client.query(
    `select j.resource, j.status, j.attempts, j.last_error,
            (select count(*)::int from ingestion_job_resources r where r.job_id = j.id) as resources
     from ingestion_jobs j join workspaces w on w.id = j.workspace_id
     where w.shop_domain = $1 order by j.created_at desc limit 10`,
    [shop],
  );
  console.log('\ningestion jobs');
  for (const job of jobs.rows) {
    console.log(`  ${job.resource} ${job.status} attempts=${job.attempts} resources=${job.resources}${job.last_error ? ` error=${String(job.last_error).slice(0, 120)}` : ''}`);
  }

  const counts = {};
  for (const table of ['products', 'product_variants', 'customers', 'orders', 'order_lines', 'refunds', 'checkouts', 'webhook_events']) {
    const result = await client.query(
      `select count(*)::int as n from ${table} t join workspaces w on w.id = t.workspace_id where w.shop_domain = $1`,
      [shop],
    );
    counts[table] = result.rows[0].n;
  }
  console.log('\nrow counts', JSON.stringify(counts));
} catch (error) {
  console.log('database inspection failed:', error.message);
} finally {
  await client.end().catch(() => {});
}
