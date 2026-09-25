import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getOverview } from '../dist/api/queries.js';
import { closeDatabase, createDatabase, databasePoolConfig } from '../dist/db/client.js';

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required');
const nodeEnv = process.env.NODE_ENV ?? 'test';
const pool = new Pool(databasePoolConfig(databaseUrl, process.env.MIGRATION_DATABASE_SSL === 'true', nodeEnv));
const database = createDatabase(databaseUrl, process.env.MIGRATION_DATABASE_SSL === 'true', nodeEnv);
const workspaceId = `overview-${randomUUID()}`;
const userId = `overview-user-${randomUUID()}`;
const domain = `${workspaceId}.myshopify.com`;
const insertOrderSql = 'insert into orders (workspace_id, id, name, customer_id, email, financial_status, fulfillment_status, currency_code, subtotal_price, total_discounts, total_tax, total_price, total_units, processed_at, shopify_created_at, shopify_updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $14)';

try {
  await pool.query('insert into workspaces (id, shop_domain, name, currency_code, time_zone) values ($1, $2, $3, $4, $5)', [workspaceId, domain, 'Overview integration', 'USD', 'America/New_York']);
   await pool.query('insert into shopify_installations (workspace_id, encrypted_offline_token, scopes, api_version) values ($1, $2, $3, $4)', [workspaceId, 'integration-token', ['read_orders'], '2026-01']);
   await pool.query('insert into app_users (id, email) values ($1, $2)', [userId, 'overview@example.test']);
   await pool.query('insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)', [workspaceId, userId, 'owner']);
  await pool.query(insertOrderSql, [workspaceId, `${workspaceId}-usd`, '#1001', 'customer-1', 'buyer@example.test', 'PAID', 'FULFILLED', 'USD', '10', '0', '0', '10', 1, '2026-03-10T16:00:00.000Z']);
  await pool.query(insertOrderSql, [workspaceId, `${workspaceId}-eur`, '#1002', 'customer-1', 'buyer@example.test', 'PAID', 'FULFILLED', 'EUR', '100', '0', '0', '100', 10, '2026-03-10T16:00:00.000Z']);
  await pool.query(insertOrderSql, [workspaceId, `${workspaceId}-cancelled`, '#1003', 'customer-1', 'buyer@example.test', 'CANCELLED', 'FULFILLED', 'USD', '50', '0', '0', '50', 5, '2026-03-10T16:00:00.000Z']);
  await pool.query('update orders set cancelled_at = $1 where workspace_id = $2 and id = $3', ['2026-03-10T16:00:00.000Z', workspaceId, `${workspaceId}-cancelled`]);
   const overview = await getOverview(database.db, workspaceId, { from: new Date('2026-03-07T05:00:00.000Z'), to: new Date('2026-03-12T04:00:00.000Z'), preset: 'custom' }, new Date('2026-03-12T05:00:00.000Z'), userId);
  if (!overview || overview.currencyCode !== 'USD' || overview.metricBasis !== 'gross_non_cancelled_order_value') throw new Error('Overview currency basis was not truthful');
  if (overview.trend.length !== 5 || overview.trend[0]?.date !== '2026-03-07' || overview.trend[1]?.revenue !== '0' || overview.trend[3]?.revenue !== '10' || overview.trend[4]?.revenue !== '0') throw new Error('Overview local trend was not dense and currency-scoped');
  console.log('overview-currency-trend-integration-valid');
} finally {
  await pool.query('delete from orders where workspace_id = $1', [workspaceId]);
  await pool.query('delete from shopify_installations where workspace_id = $1', [workspaceId]);
   await pool.query('delete from workspaces where id = $1', [workspaceId]);
   await pool.query('delete from app_users where id = $1', [userId]);
   await closeDatabase(database);
  await pool.end();
}
