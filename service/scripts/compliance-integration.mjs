import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { closeDatabase, createDatabase, databasePoolConfig } from '../dist/db/client.js';
import { processCustomerDataRequest, purgeUninstalledShop, redactCustomer } from '../dist/ingestion/compliance.js';

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required');
const nodeEnv = process.env.NODE_ENV ?? 'test';
const pool = new Pool(databasePoolConfig(databaseUrl, process.env.MIGRATION_DATABASE_SSL === 'true', nodeEnv));
const database = createDatabase(databaseUrl, process.env.MIGRATION_DATABASE_SSL === 'true', nodeEnv);
const workspaceId = `compliance-${randomUUID()}`;
const customerId = 'customer-compliance-1';
const orderId = 'order-compliance-1';

try {
  await pool.query('insert into workspaces (id, shop_domain, name, currency_code, time_zone) values ($1, $2, $3, $4, $5)', [workspaceId, `${workspaceId}.myshopify.com`, 'Compliance integration', 'USD', 'UTC']);
  await pool.query('insert into customers (workspace_id, id, email, first_name, last_name) values ($1, $2, $3, $4, $5)', [workspaceId, customerId, 'customer@example.test', 'Ada', 'Lovelace']);
  await pool.query('insert into orders (workspace_id, id, name, customer_id, email, financial_status, fulfillment_status, currency_code, subtotal_price, total_discounts, total_tax, total_price, total_units, processed_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())', [workspaceId, orderId, '#1', customerId, 'customer@example.test', 'PAID', 'FULFILLED', 'USD', '10', '0', '0', '10', 1]);
  await pool.query('insert into order_lines (workspace_id, order_id, id, title, quantity, unit_price, total_discount, total_price) values ($1, $2, $3, $4, $5, $6, $7, $8)', [workspaceId, orderId, 'line-compliance-1', 'Product', 1, '10', '0', '10']);
  await pool.query('insert into refunds (workspace_id, id, order_id, total_amount, currency_code) values ($1, $2, $3, $4, $5)', [workspaceId, 'refund-compliance-1', orderId, '2', 'USD']);
  await pool.query('insert into carts (workspace_id, id, customer_id, currency_code, total_price, subtotal_price) values ($1, $2, $3, $4, $5, $6)', [workspaceId, 'cart-compliance-1', customerId, 'USD', '10', '10']);
  await pool.query('insert into cart_lines (workspace_id, cart_id, id, title, quantity, unit_price, total_price) values ($1, $2, $3, $4, $5, $6, $7)', [workspaceId, 'cart-compliance-1', 'cart-line-compliance-1', 'Product', 1, '10', '10']);
  await pool.query('insert into checkouts (workspace_id, id, customer_id, email, currency_code, total_price, subtotal_price) values ($1, $2, $3, $4, $5, $6, $7)', [workspaceId, 'checkout-compliance-1', customerId, 'customer@example.test', 'USD', '10', '10']);
  await pool.query('insert into custom_events (workspace_id, id, event_type, customer_id, occurred_at) values ($1, $2, $3, $4, now())', [workspaceId, 'event-compliance-1', 'checkout_completed', customerId]);
  await processCustomerDataRequest(database.db, { workspaceId, webhookId: 'export-compliance-1', customerId, topic: 'customers/data_request' });
  const exported = await pool.query('select status, payload from compliance_exports where workspace_id = $1 and webhook_id = $2', [workspaceId, 'export-compliance-1']);
  if (exported.rows[0]?.status !== 'completed' || !exported.rows[0]?.payload?.orders?.length) throw new Error('Customer export did not complete');
  await redactCustomer(database.db, { workspaceId, webhookId: 'redact-compliance-1', customerId, topic: 'customers/redact' });
  const redactedCustomer = await pool.query('select email, first_name, deleted_at from customers where workspace_id = $1 and id = $2', [workspaceId, customerId]);
  const retainedOrder = await pool.query('select customer_id, email from orders where workspace_id = $1 and id = $2', [workspaceId, orderId]);
  const deletedEvent = await pool.query('select 1 from custom_events where workspace_id = $1 and customer_id = $2', [workspaceId, customerId]);
  if (redactedCustomer.rows[0]?.email !== null || retainedOrder.rows[0]?.customer_id !== null || deletedEvent.rows.length !== 0) throw new Error('Customer redaction did not complete');
  const purgeWorkspaceId = `${workspaceId}-purge`;
  await pool.query('insert into workspaces (id, shop_domain, name, currency_code, time_zone) values ($1, $2, $3, $4, $5)', [purgeWorkspaceId, `${purgeWorkspaceId}.myshopify.com`, 'Purge integration', 'USD', 'UTC']);
  await purgeUninstalledShop(database.db, { workspaceId: purgeWorkspaceId, webhookId: 'purge-compliance-1', topic: 'shop/redact' });
  const purged = await pool.query('select 1 from workspaces where id = $1', [purgeWorkspaceId]);
  if (purged.rows.length !== 0) throw new Error('Shop purge did not complete');
  console.log('compliance-integration-valid');
} finally {
  await pool.query('delete from refunds where workspace_id = $1', [workspaceId]);
  await pool.query('delete from cart_lines where workspace_id = $1', [workspaceId]);
  await pool.query('delete from carts where workspace_id = $1', [workspaceId]);
  await pool.query('delete from checkouts where workspace_id = $1', [workspaceId]);
  await pool.query('delete from custom_events where workspace_id = $1', [workspaceId]);
  await pool.query('delete from order_lines where workspace_id = $1', [workspaceId]);
  await pool.query('delete from orders where workspace_id = $1', [workspaceId]);
  await pool.query('delete from customers where workspace_id = $1', [workspaceId]);
  await pool.query('delete from compliance_exports where workspace_id = $1', [workspaceId]);
  await pool.query('delete from workspaces where id = $1', [workspaceId]);
  await pool.query('delete from workspaces where id = $1', [`${workspaceId}-purge`]);
  await closeDatabase(database);
  await pool.end();
}
