import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { databasePoolConfig } from '../dist/db/client.js';

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required');
const nodeEnv = process.env.NODE_ENV ?? 'test';
if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') throw new Error('NODE_ENV must be development, test, or production');
const pool = new Pool(databasePoolConfig(databaseUrl, process.env.MIGRATION_DATABASE_SSL === 'true', nodeEnv));
const requiredColumns = [
  ['ingestion_jobs', 'updated_at'],
  ['ingestion_job_resources', 'variants_complete'],
  ['orders', 'cancelled_at'],
  ['order_lines', 'workspace_id'],
  ['product_variants', 'position'],
  ['product_variants', 'option_values'],
  ['products', 'variants_complete'],
  ['sync_cursors', 'watermark_at'],
  ['customers', 'company'],
  ['customers', 'city'],
  ['customers', 'province'],
  ['customers', 'country'],
  ['refunds', 'total_amount'],
  ['compliance_exports', 'payload'],
  ['worker_heartbeats', 'last_heartbeat'],
  ['service_metadata', 'value'],
];
const requiredIndexes = [
  'products_search_idx',
  'customers_search_idx',
  'orders_workspace_cancelled_period_idx',
  'ingestion_job_resources_workspace_status_idx',
  'compliance_exports_workspace_webhook_unique',
  'refunds_workspace_order_idx',
];

try {
  const database = drizzle(pool);
  await migrate(database, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  await migrate(database, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  const columns = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `);
  const indexes = await pool.query(`
    select indexname
    from pg_indexes
    where schemaname = 'public'
  `);
  const rls = await pool.query(`
    select relname
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and relrowsecurity
  `);
  for (const [table, column] of requiredColumns) {
    if (!columns.rows.some((row) => row.table_name === table && row.column_name === column)) throw new Error(`Missing column ${table}.${column}`);
  }
  for (const index of requiredIndexes) {
    if (!indexes.rows.some((row) => row.indexname === index)) throw new Error(`Missing index ${index}`);
  }
  for (const table of ['products', 'product_variants', 'orders', 'order_lines', 'ingestion_job_resources', 'refunds', 'compliance_exports', 'service_metadata', 'worker_heartbeats']) {
    if (!rls.rows.some((row) => row.relname === table)) throw new Error(`RLS is not enabled on ${table}`);
  }
  const marker = await pool.query(`select value from service_metadata where key = 'schema_version' limit 1`);
  if (marker.rows.length !== 1) throw new Error('Missing authoritative schema marker');
  const privileges = await pool.query(`
    select has_table_privilege(current_user, 'public.workspaces', 'SELECT') as workspaces_select,
      has_table_privilege(current_user, 'public.products', 'SELECT') as products_select,
      has_table_privilege(current_user, 'public.orders', 'SELECT') as orders_select,
      has_table_privilege(current_user, 'public.customers', 'SELECT') as customers_select,
      has_table_privilege(current_user, 'public.products', 'INSERT') as products_insert,
      has_table_privilege(current_user, 'public.orders', 'UPDATE') as orders_update,
      has_table_privilege(current_user, 'public.ingestion_jobs', 'DELETE') as jobs_delete
  `);
  if (!privileges.rows[0] || Object.values(privileges.rows[0]).some((value) => value !== true)) throw new Error('Required database privileges are missing');
  const policies = await pool.query(`select policyname from pg_policies where schemaname = 'public'`);
  if (policies.rows.some((row) => String(row.policyname).includes('self_write'))) throw new Error('Authenticated self-write policies remain');
  const constraints = await pool.query(`select conname from pg_constraint where conname = 'workspace_members_role_check'`);
  if (constraints.rows.length !== 1) throw new Error('Workspace role constraint is missing');
  console.log('clean-migration-integrity-valid');
} finally {
  await pool.end();
}
