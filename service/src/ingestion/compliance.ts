import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { purgeWorkspaceData, recordAuditEvent } from '../db/operations.js';

export type ComplianceRequest = {
  workspaceId: string;
  webhookId: string;
  customerId: string;
  topic: string;
};

export async function processCustomerDataRequest(db: Database, request: ComplianceRequest): Promise<void> {
  const existing = await db.execute(sql`
    select status from compliance_exports where workspace_id = ${request.workspaceId} and webhook_id = ${request.webhookId} limit 1
  `);
  if (existing.rows[0]?.status === 'completed') return;
  await db.execute(sql`
    insert into compliance_exports (workspace_id, webhook_id, customer_id, status)
    values (${request.workspaceId}, ${request.webhookId}, ${request.customerId}, 'processing')
    on conflict (workspace_id, webhook_id) do update set status = 'processing', error = null, updated_at = now()
  `);
  try {
    const customer = await db.execute(sql`
      select id, email, first_name, last_name, phone, company, city, province, country, state,
        verified_email, orders_count, total_spent, default_address, avatar_url,
        shopify_created_at, shopify_updated_at, deleted_at
      from customers where workspace_id = ${request.workspaceId} and id = ${request.customerId} limit 1
    `);
    const orders = await db.execute(sql`
      select id, name, order_number, customer_id, email, financial_status, fulfillment_status,
        currency_code, subtotal_price, total_discounts, total_tax, total_price, total_units,
        source_name, processed_at, shopify_created_at, shopify_updated_at, cancelled_at
      from orders where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}
      order by shopify_created_at asc, id asc
    `);
    const orderLines = await db.execute(sql`
      select ol.order_id, ol.id, ol.product_id, ol.variant_id, ol.title, ol.variant_title,
        ol.sku, ol.quantity, ol.unit_price, ol.total_discount, ol.total_price
      from order_lines ol
      join orders o on o.workspace_id = ol.workspace_id and o.id = ol.order_id
      where ol.workspace_id = ${request.workspaceId} and o.customer_id = ${request.customerId}
      order by ol.order_id asc, ol.id asc
    `);
    const refunds = await db.execute(sql`
      select r.id, r.order_id, r.note, r.total_amount, r.currency_code, r.processed_at,
        r.shopify_created_at, r.shopify_updated_at
      from refunds r
      join orders o on o.workspace_id = r.workspace_id and o.id = r.order_id
      where r.workspace_id = ${request.workspaceId} and o.customer_id = ${request.customerId}
      order by r.shopify_created_at asc, r.id asc
    `);
    const carts = await db.execute(sql`
      select id, customer_id, currency_code, total_price, subtotal_price, total_quantity,
        abandoned_at, completed_at, shopify_updated_at
      from carts where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}
      order by shopify_updated_at asc, id asc
    `);
    const cartLines = await db.execute(sql`
      select cl.cart_id, cl.id, cl.product_id, cl.variant_id, cl.title, cl.quantity,
        cl.unit_price, cl.total_price
      from cart_lines cl join carts c on c.workspace_id = cl.workspace_id and c.id = cl.cart_id
      where cl.workspace_id = ${request.workspaceId} and c.customer_id = ${request.customerId}
      order by cl.cart_id asc, cl.id asc
    `);
    const checkouts = await db.execute(sql`
      select id, cart_id, customer_id, email, currency_code, total_price, subtotal_price,
        total_quantity, completed_at, shopify_created_at, shopify_updated_at
      from checkouts where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}
      order by shopify_created_at asc, id asc
    `);
    const customEvents = await db.execute(sql`
      select id, event_type, customer_id, session_id, occurred_at, data
      from custom_events where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}
      order by occurred_at asc, id asc
    `);
    const payload = {
      customer: customer.rows[0] ?? null,
      orders: orders.rows,
      orderLines: orderLines.rows,
      refunds: refunds.rows,
      carts: carts.rows,
      cartLines: cartLines.rows,
      checkouts: checkouts.rows,
      customEvents: customEvents.rows,
    };
    await db.execute(sql`
      update compliance_exports
      set status = 'completed', payload = ${JSON.stringify(payload)}::jsonb, error = null, completed_at = now(), updated_at = now()
      where workspace_id = ${request.workspaceId} and webhook_id = ${request.webhookId}
    `);
    await recordAuditEvent(db, { workspaceId: request.workspaceId, action: 'privacy.data_request_completed', resourceType: 'customer', resourceId: request.customerId, metadata: { webhookId: request.webhookId, topic: request.topic } });
  } catch (error) {
    await db.execute(sql`
      update compliance_exports set status = 'failed', error = ${error instanceof Error ? error.message : 'Compliance export failed'}, updated_at = now()
      where workspace_id = ${request.workspaceId} and webhook_id = ${request.webhookId}
    `);
    throw error;
  }
}

export async function redactCustomer(db: Database, request: ComplianceRequest): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from custom_events where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}`);
    await tx.execute(sql`delete from cart_lines where workspace_id = ${request.workspaceId} and cart_id in (select id from carts where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId})`);
    await tx.execute(sql`delete from carts where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}`);
    await tx.execute(sql`update checkouts set customer_id = null, email = null, raw = '{}'::jsonb, updated_at = now() where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}`);
     await tx.execute(sql`update order_lines set raw = '{}'::jsonb, updated_at = now() where workspace_id = ${request.workspaceId} and order_id in (select id from orders where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId})`);
     await tx.execute(sql`update refunds set note = null, raw = '{}'::jsonb, updated_at = now() where workspace_id = ${request.workspaceId} and order_id in (select id from orders where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId})`);
     await tx.execute(sql`update orders set customer_id = null, email = null, raw = '{}'::jsonb, updated_at = now() where workspace_id = ${request.workspaceId} and customer_id = ${request.customerId}`);
     await tx.execute(sql`update customers set email = null, first_name = null, last_name = null, phone = null, company = null, city = null, province = null, country = null, state = null, verified_email = null, orders_count = null, total_spent = null, default_address = null, avatar_url = null, raw = '{}'::jsonb, deleted_at = now(), updated_at = now() where workspace_id = ${request.workspaceId} and id = ${request.customerId}`);
  });
  await recordAuditEvent(db, { workspaceId: request.workspaceId, action: 'privacy.customer_redacted', resourceType: 'customer', resourceId: request.customerId, metadata: { webhookId: request.webhookId, topic: request.topic } });
}

export async function purgeUninstalledShop(db: Database, request: Omit<ComplianceRequest, 'customerId'> & { customerId?: string }): Promise<void> {
  const existing = await db.execute(sql`select 1 from workspaces where id = ${request.workspaceId} limit 1`);
  if (!existing.rows[0]) return;
  await recordAuditEvent(db, { workspaceId: request.workspaceId, action: 'privacy.shop_purge_started', resourceType: 'workspace', resourceId: request.workspaceId, metadata: { webhookId: request.webhookId, topic: request.topic } });
  await purgeWorkspaceData(db, request.workspaceId);
}
