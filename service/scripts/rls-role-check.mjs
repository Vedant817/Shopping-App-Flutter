import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const databaseUrl = process.env.RLS_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('RLS_DATABASE_URL or DATABASE_URL is required');
const nodeEnv = process.env.NODE_ENV ?? 'test';
if (nodeEnv === 'production' && process.env.RLS_DATABASE_SSL !== 'true') throw new Error('RLS_DATABASE_SSL must be enabled in production');
const pool = new Pool({
  connectionString: databaseUrl,
  ...(process.env.RLS_DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
});
const client = await pool.connect();
const suffix = randomUUID();
const workspaceA = `rls-a-${suffix}`;
const workspaceB = `rls-b-${suffix}`;
const userA = `rls-user-a-${suffix}`;
const userB = `rls-user-b-${suffix}`;

for (const [role, suffix] of [['anon', ''], ['authenticated', ''], ['service_role', ' bypassrls']]) {
  try {
    await client.query(`create role ${role} nologin${suffix}`);
  } catch (error) {
    if (!/already exists/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
}

try {
  await client.query('alter role service_role bypassrls');
} catch {
}
await client.query('grant usage on schema public to anon, authenticated, service_role');
await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
await client.query('grant select, insert, update, delete on all tables in schema public to service_role');
await client.query('grant usage, select, update on all sequences in schema public to service_role');
await client.query('insert into app_users (id, email) values ($1, $2), ($3, $4)', [userA, 'a@example.test', userB, 'b@example.test']);
await client.query('insert into workspaces (id, shop_domain, name, currency_code, time_zone) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)', [workspaceA, `${workspaceA}.myshopify.com`, 'A', 'USD', 'UTC', workspaceB, `${workspaceB}.myshopify.com`, 'B', 'USD', 'UTC']);
await client.query('insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)', [workspaceA, userA, 'owner']);
await client.query('insert into shopify_installations (workspace_id, encrypted_offline_token, scopes, api_version) values ($1, $2, $3, $4)', [workspaceA, 'encrypted-test-token', ['read_products'], '2026-01']);

async function expectDenied(query, values = []) {
  await client.query('begin');
  let denied = false;
  try {
    await client.query("set role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
    await client.query(query, values);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '42501') denied = true;
    else throw error;
  } finally {
    await client.query('rollback');
  }
  if (!denied) throw new Error(`Expected Data API denial for query: ${query}`);
}

await expectDenied('select * from workspace_members');
await expectDenied('select * from workspaces where id = $1', [workspaceB]);
await expectDenied('select encrypted_offline_token from shopify_installations');
await expectDenied('insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)', [workspaceA, userB, 'owner']);
await expectDenied('update workspace_members set role = $1 where workspace_id = $2 and user_id = $3', ['owner', workspaceA, userA]);
await expectDenied('delete from workspace_members where workspace_id = $1 and user_id = $2', [workspaceA, userA]);
await expectDenied('select * from products');
await client.query('begin');
await client.query('set role anon');
let anonDenied = false;
try {
  await client.query('select * from workspaces');
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === '42501') anonDenied = true;
  else throw error;
} finally {
  await client.query('rollback');
}
if (!anonDenied) throw new Error('Expected anon Data API denial');
await client.query('begin');
await client.query('set role service_role');
const serviceRows = await client.query('select encrypted_offline_token from shopify_installations where workspace_id = $1', [workspaceA]);
if (serviceRows.rows.length !== 1 || serviceRows.rows[0].encrypted_offline_token !== 'encrypted-test-token') throw new Error('service_role could not read the intended installation');
await client.query('commit');
await client.query('reset role');
await client.query('update workspaces set uninstalled_at = now() where id = $1', [workspaceA]);
await client.query('delete from shopify_installations where workspace_id = $1', [workspaceA]);
await client.query('grant select on workspaces, workspace_members, shopify_installations to authenticated');
await client.query('begin');
await client.query('set role authenticated');
await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
const blocked = await client.query('select count(*)::int as count from workspaces where id = $1', [workspaceA]);
const blockedInstallation = await client.query('select count(*)::int as count from shopify_installations where workspace_id = $1', [workspaceA]);
if (Number(blocked.rows[0]?.count) !== 0 || Number(blockedInstallation.rows[0]?.count) !== 0) throw new Error('Uninstalled workspace remained readable to a former member');
await client.query('rollback');
await client.query('revoke select on workspaces, workspace_members, shopify_installations from authenticated');
await client.query('delete from shopify_installations where workspace_id = $1', [workspaceA]);
await client.query('delete from workspace_members where workspace_id = $1', [workspaceA]);
await client.query('delete from workspaces where id = any($1)', [[workspaceA, workspaceB]]);
await client.query('delete from app_users where id = any($1)', [[userA, userB]]);
console.log('rls-role-checks-valid');
await client.release();
await pool.end();
