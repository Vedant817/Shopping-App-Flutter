import sanitizeHtml from 'sanitize-html';
import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { parseMoney as normalizeMoney } from '../utils/money.js';

type SqlExecutor = Pick<Database, 'execute'>;

export async function upsertProduct(db: Database, workspaceId: string, value: unknown, options: { replaceVariants?: boolean } = {}): Promise<string> {
  let productId = '';
  await db.transaction(async (tx) => {
    productId = await upsertProductWithExecutor(tx, workspaceId, value, options);
  });
  return productId;
}

export async function upsertProductWithExecutor(
  tx: SqlExecutor,
  workspaceId: string,
  value: unknown,
  options: { replaceVariants?: boolean; replaceLines?: boolean } = {},
): Promise<string> {
  const source = record(value, 'product');
  const plainDescription = sanitizePlainText(optionalString(source.descriptionHtml) ?? optionalString(source.description));
  const node: Record<string, unknown> = {
    ...source,
    description: plainDescription,
    descriptionHtml: plainDescription,
  };
  const id = requiredString(node.id, 'product.id');
  const title = requiredString(node.title, 'product.title');
  const featuredImage = optionalRecord(node.featuredImage);
  const category = optionalRecord(node.category);
  const categoryName = optionalString(category?.fullName) ?? optionalString(category?.name) ?? optionalString(node.productType);
  const description = plainDescription;
  const variants = connectionNodes(node.variants);
  const variantsComplete = options.replaceVariants === true || node.variantsComplete === true || hasCompleteVariantConnection(node.variants);
  const raw = JSON.stringify(node);
  await tx.execute(sql`
      insert into products (workspace_id, id, title, handle, description, description_html, category, variants_complete, vendor, product_type, status, tags, total_inventory, featured_image_url, online_store_url, published_at, shopify_created_at, shopify_updated_at, raw)
      values (${workspaceId}, ${id}, ${title}, ${optionalString(node.handle)}, ${description}, ${optionalString(node.descriptionHtml)}, ${categoryName}, ${variantsComplete}, ${optionalString(node.vendor)}, ${optionalString(node.productType)}, ${requiredString(node.status, 'product.status')}, ${textArrayLiteral(node.tags)}::text[], ${optionalInteger(node.totalInventory) ?? null}, ${optionalString(featuredImage?.url)}, ${optionalString(node.onlineStoreUrl)}, ${optionalDate(node.publishedAt)}, ${optionalDate(node.createdAt)}, ${optionalDate(node.updatedAt)}, ${raw}::jsonb)
      on conflict (workspace_id, id) do update set
        title = excluded.title, handle = excluded.handle, description = excluded.description,
        description_html = excluded.description_html, category = excluded.category,
        variants_complete = products.variants_complete or excluded.variants_complete,
        vendor = excluded.vendor, product_type = excluded.product_type, status = excluded.status,
        tags = excluded.tags, total_inventory = excluded.total_inventory,
        featured_image_url = excluded.featured_image_url, online_store_url = excluded.online_store_url,
        published_at = excluded.published_at, shopify_created_at = excluded.shopify_created_at,
        shopify_updated_at = excluded.shopify_updated_at, deleted_at = null, raw = excluded.raw, updated_at = now()
    `);
    if (options.replaceVariants) {
      await tx.execute(sql`delete from product_variants where workspace_id = ${workspaceId} and product_id = ${id}`);
    }
    for (const variantValue of variants) {
      const variant = record(variantValue, 'product.variant');
      const variantId = requiredString(variant.id, 'product.variant.id');
      await tx.execute(sql`
        insert into product_variants (workspace_id, product_id, id, title, position, sku, barcode, price, compare_at_price, inventory_quantity, inventory_policy, taxable, image_url, option_values, raw)
        values (${workspaceId}, ${id}, ${variantId}, ${requiredString(variant.title, 'product.variant.title')}, ${optionalInteger(variant.position) ?? 0}, ${optionalString(variant.sku)}, ${optionalString(variant.barcode)}, ${parseMoney(variant.price, 'product.variant.price')}, ${nullableMoney(variant.compareAtPrice)}, ${optionalInteger(variant.inventoryQuantity) ?? null}, ${optionalString(variant.inventoryPolicy)}, ${nullableBoolean(variant.taxable)}, ${optionalString(optionalRecord(variant.image)?.url)}, ${JSON.stringify(selectedOptionValues(variant.selectedOptions))}::jsonb, ${JSON.stringify(variant)}::jsonb)
        on conflict (workspace_id, id) do update set
          product_id = excluded.product_id, title = excluded.title, position = excluded.position,
          sku = excluded.sku, barcode = excluded.barcode, price = excluded.price,
          compare_at_price = excluded.compare_at_price, inventory_quantity = excluded.inventory_quantity,
          inventory_policy = excluded.inventory_policy, taxable = excluded.taxable,
          image_url = excluded.image_url, option_values = excluded.option_values, raw = excluded.raw, updated_at = now()
      `);
    }
  return id;
}

export async function upsertCustomer(db: Database, workspaceId: string, value: unknown): Promise<string> {
  let customerId = '';
  await db.transaction(async (tx) => {
    customerId = await upsertCustomerWithExecutor(tx, workspaceId, value);
  });
  return customerId;
}

export async function upsertCustomerWithExecutor(db: SqlExecutor, workspaceId: string, value: unknown): Promise<string> {
  const node = record(value, 'customer');
  const id = requiredString(node.id, 'customer.id');
  const address = optionalRecord(node.defaultAddress ?? node.default_address);
  const company = optionalString(node.company) ?? optionalString(address?.company);
  const city = optionalString(address?.city);
  const province = optionalString(address?.province) ?? optionalString(address?.provinceCode) ?? optionalString(node.state);
  const country = optionalString(address?.country) ?? optionalString(address?.countryCode);
  const ordersCount = optionalInteger(node.numberOfOrders ?? node.ordersCount);
  const totalSpent = nullableMoney(node.amountSpent ?? node.totalSpent);
  const avatarUrl = optionalString(node.avatarUrl) ?? optionalString(optionalRecord(node.image)?.url);
  const email = optionalString(optionalRecord(node.defaultEmailAddress)?.emailAddress) ?? optionalString(node.email);
  const phone = optionalString(optionalRecord(node.defaultPhoneNumber)?.phoneNumber) ?? optionalString(node.phone);
  await db.execute(sql`
    insert into customers (workspace_id, id, email, first_name, last_name, phone, company, city, province, country, state, verified_email, orders_count, total_spent, default_address, avatar_url, shopify_created_at, shopify_updated_at, raw)
    values (${workspaceId}, ${id}, ${email}, ${optionalString(node.firstName)}, ${optionalString(node.lastName)}, ${phone}, ${company}, ${city}, ${province}, ${country}, ${optionalString(node.state)}, ${nullableBoolean(node.verifiedEmail)}, ${ordersCount ?? null}, ${totalSpent}, ${address ? JSON.stringify(address) : null}::jsonb, ${avatarUrl}, ${optionalDate(node.createdAt)}, ${optionalDate(node.updatedAt)}, ${JSON.stringify(node)}::jsonb)
    on conflict (workspace_id, id) do update set
      email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name,
      phone = excluded.phone, company = excluded.company, city = excluded.city,
      province = excluded.province, country = excluded.country, state = excluded.state,
      verified_email = excluded.verified_email,
      orders_count = excluded.orders_count, total_spent = excluded.total_spent,
      default_address = excluded.default_address, avatar_url = excluded.avatar_url,
      shopify_created_at = excluded.shopify_created_at, shopify_updated_at = excluded.shopify_updated_at,
      deleted_at = null, raw = excluded.raw, updated_at = now()
  `);
  return id;
}

export async function upsertOrder(db: Database, workspaceId: string, value: unknown, options: { replaceLines?: boolean } = {}): Promise<string> {
  let orderId = '';
  await db.transaction(async (tx) => {
    orderId = await upsertOrderWithExecutor(tx, workspaceId, value, options);
  });
  return orderId;
}

export async function upsertOrderWithExecutor(tx: SqlExecutor, workspaceId: string, value: unknown, options: { replaceLines?: boolean } = {}): Promise<string> {
  const node = record(value, 'order');
  const id = requiredString(node.id, 'order.id');
  const customer = optionalRecord(node.customer);
  const lineItems = connectionNodes(node.lineItems);
  const totalUnits = optionalInteger(node.subtotalLineItemsQuantity ?? node.totalUnits) ?? lineItems.reduce((sum: number, item) => sum + (optionalInteger(record(item, 'order.line').quantity) ?? 0), 0);
  const orderNumber = optionalInteger(node.orderNumber ?? node.number);
  const financialStatus = optionalString(node.displayFinancialStatus ?? node.financialStatus);
  const fulfillmentStatus = optionalString(node.displayFulfillmentStatus ?? node.fulfillmentStatus);
  const totalPriceSet = optionalRecord(node.totalPriceSet);
  const currencyCode = requiredString(node.currencyCode ?? optionalRecord(totalPriceSet?.shopMoney)?.currencyCode, 'order.currencyCode');
  const raw = JSON.stringify(node);
  await tx.execute(sql`
      insert into orders (workspace_id, id, name, order_number, customer_id, email, financial_status, fulfillment_status, currency_code, subtotal_price, total_discounts, total_tax, total_price, total_units, source_name, raw, processed_at, shopify_created_at, shopify_updated_at, cancelled_at)
      values (${workspaceId}, ${id}, ${optionalString(node.name)}, ${orderNumber ?? null}, ${optionalString(customer?.id)}, ${optionalString(node.email)}, ${financialStatus}, ${fulfillmentStatus}, ${currencyCode}, ${parseMoney(node.subtotalPriceSet ?? node.subtotalPrice, 'order.subtotalPriceSet')}, ${parseMoney(node.totalDiscountsSet ?? node.totalDiscounts, 'order.totalDiscountsSet')}, ${parseMoney(node.totalTaxSet ?? node.totalTax, 'order.totalTaxSet')}, ${parseMoney(node.totalPriceSet ?? node.totalPrice, 'order.totalPriceSet')}, ${totalUnits}, ${optionalString(node.sourceName)}, ${raw}::jsonb, ${optionalDate(node.processedAt)}, ${optionalDate(node.createdAt)}, ${optionalDate(node.updatedAt)}, ${optionalDate(node.cancelledAt)})
      on conflict (workspace_id, id) do update set
        name = excluded.name, order_number = excluded.order_number, customer_id = excluded.customer_id,
        email = excluded.email, financial_status = excluded.financial_status,
        fulfillment_status = excluded.fulfillment_status, currency_code = excluded.currency_code,
        subtotal_price = excluded.subtotal_price, total_discounts = excluded.total_discounts,
        total_tax = excluded.total_tax, total_price = excluded.total_price, total_units = excluded.total_units,
        source_name = excluded.source_name, raw = excluded.raw, processed_at = excluded.processed_at,
        shopify_created_at = excluded.shopify_created_at, shopify_updated_at = excluded.shopify_updated_at,
        cancelled_at = excluded.cancelled_at, updated_at = now()
    `);
    if (options.replaceLines) await tx.execute(sql`delete from order_lines where workspace_id = ${workspaceId} and order_id = ${id}`);
    for (const lineValue of lineItems) {
      const line = record(lineValue, 'order.line');
      const lineId = requiredString(line.id, 'order.line.id');
      const product = optionalRecord(line.product);
      const variant = optionalRecord(line.variant);
      const unitPrice = line.originalUnitPriceSet ?? line.originalUnitPrice ?? line.unitPrice;
      const totalPrice = line.discountedTotalSet ?? line.discountedTotalPriceSet ?? line.totalPrice;
      const totalDiscount = line.totalDiscountSet ?? line.totalDiscount ?? '0';
      await tx.execute(sql`
        insert into order_lines (workspace_id, order_id, id, product_id, variant_id, title, variant_title, sku, quantity, unit_price, total_discount, total_price, raw)
        values (${workspaceId}, ${id}, ${lineId}, ${optionalString(product?.id)}, ${optionalString(variant?.id)}, ${requiredString(line.title, 'order.line.title')}, ${optionalString(line.variantTitle)}, ${optionalString(line.sku)}, ${requiredInteger(line.quantity, 'order.line.quantity')}, ${parseMoney(unitPrice, 'order.line.unitPrice')}, ${parseMoney(totalDiscount, 'order.line.totalDiscount')}, ${parseMoney(totalPrice, 'order.line.totalPrice')}, ${JSON.stringify(line)}::jsonb)
        on conflict (workspace_id, order_id, id) do update set
          product_id = excluded.product_id, variant_id = excluded.variant_id, title = excluded.title,
          variant_title = excluded.variant_title, sku = excluded.sku, quantity = excluded.quantity,
          unit_price = excluded.unit_price, total_discount = excluded.total_discount,
          total_price = excluded.total_price, raw = excluded.raw, updated_at = now()
      `);
    }
  return id;
}

export async function upsertRefund(db: Database, workspaceId: string, value: unknown): Promise<string> {
  const node = record(value, 'refund');
  const id = requiredString(node.id, 'refund.id');
  const order = optionalRecord(node.order);
  const orderId = requiredString(order?.id ?? node.orderId, 'refund.orderId');
  const total = node.totalRefundedSet ?? node.totalAmount ?? node.amount;
  const totalRecord = optionalRecord(total);
  const shopMoney = optionalRecord(totalRecord?.shopMoney) ?? totalRecord;
  const amount = parseMoney(shopMoney?.amount ?? total, 'refund.totalRefundedSet');
  const currency = requiredString(node.currencyCode ?? shopMoney?.currencyCode ?? order?.currencyCode, 'refund.currencyCode');
  await db.execute(sql`
    insert into refunds (workspace_id, id, order_id, note, total_amount, currency_code, processed_at, shopify_created_at, shopify_updated_at, raw)
    values (${workspaceId}, ${id}, ${orderId}, ${optionalString(node.note)}, ${amount}, ${currency}, ${optionalDate(node.processedAt)}, ${optionalDate(node.createdAt)}, ${optionalDate(node.updatedAt)}, ${JSON.stringify(node)}::jsonb)
    on conflict (workspace_id, id) do update set
      order_id = excluded.order_id, note = excluded.note, total_amount = excluded.total_amount,
      currency_code = excluded.currency_code, processed_at = excluded.processed_at,
      shopify_created_at = excluded.shopify_created_at, shopify_updated_at = excluded.shopify_updated_at,
      raw = excluded.raw, updated_at = now()
  `);
  return id;
}

export async function upsertCheckoutWithExecutor(db: SqlExecutor, workspaceId: string, value: unknown): Promise<string> {
  const node = record(value, 'abandonedCheckout');
  const id = requiredString(node.id, 'abandonedCheckout.id');
  const cost = optionalRecord(node.cost);
  const totalSet = optionalRecord(node.totalPriceSet);
  const subtotalSet = optionalRecord(node.subtotalPriceSet);
  const totalMoney = optionalRecord(totalSet?.shopMoney) ?? totalSet ?? optionalRecord(cost?.totalAmount);
  const subtotalMoney = optionalRecord(subtotalSet?.shopMoney) ?? subtotalSet ?? optionalRecord(cost?.subtotalAmount);
  const customer = optionalRecord(node.customer);
  const customerEmail = optionalString(optionalRecord(customer?.defaultEmailAddress)?.emailAddress) ?? optionalString(customer?.email);
  const lines = connectionNodes(node.lineItems);
  const totalQuantity = lines.reduce((sum: number, lineValue) => sum + (optionalInteger(record(lineValue, 'abandonedCheckout.line').quantity) ?? 0), 0);
  const currency = requiredString(node.currencyCode ?? totalMoney?.currencyCode ?? subtotalMoney?.currencyCode, 'abandonedCheckout.currencyCode');
  await db.execute(sql`
    insert into checkouts (workspace_id, id, cart_id, customer_id, email, currency_code, total_price, subtotal_price, total_quantity, completed_at, raw, shopify_created_at, shopify_updated_at)
    values (${workspaceId}, ${id}, ${optionalString(optionalRecord(node.cart)?.id)}, ${optionalString(customer?.id)}, ${optionalString(node.email ?? customerEmail)}, ${currency}, ${parseMoney(totalMoney, 'abandonedCheckout.totalPrice')}, ${parseMoney(subtotalMoney, 'abandonedCheckout.subtotalPrice')}, ${totalQuantity}, ${optionalDate(node.completedAt)}, ${JSON.stringify(node)}::jsonb, ${optionalDate(node.createdAt)}, ${optionalDate(node.updatedAt)})
    on conflict (workspace_id, id) do update set
      cart_id = excluded.cart_id, customer_id = excluded.customer_id, email = excluded.email,
      currency_code = excluded.currency_code, total_price = excluded.total_price,
      subtotal_price = excluded.subtotal_price, total_quantity = excluded.total_quantity,
      completed_at = excluded.completed_at, raw = excluded.raw,
      shopify_created_at = excluded.shopify_created_at, shopify_updated_at = excluded.shopify_updated_at, updated_at = now()
  `);
  return id;
}

export async function upsertCustomEvent(db: Database, workspaceId: string, input: { id: string; eventType: string; customerId?: string | null; sessionId?: string | null; occurredAt: string; data: Record<string, unknown>; raw?: Record<string, unknown> }): Promise<void> {
  await db.execute(sql`
    insert into custom_events (workspace_id, id, event_type, customer_id, session_id, occurred_at, data, raw)
    values (${workspaceId}, ${input.id}, ${input.eventType}, ${input.customerId ?? null}, ${input.sessionId ?? null}, ${input.occurredAt}, ${JSON.stringify(input.data)}::jsonb, ${JSON.stringify(input.raw ?? input.data)}::jsonb)
    on conflict (workspace_id, id) do update set
      event_type = excluded.event_type, customer_id = excluded.customer_id, session_id = excluded.session_id,
      occurred_at = excluded.occurred_at, data = excluded.data, raw = excluded.raw
  `);
}

function sanitizePlainText(value: string | null): string | null {
  if (value === null) return null;
  const sanitized = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    exclusiveFilter: (frame) => frame.tag === 'script' || frame.tag === 'style' || frame.tag === 'noscript',
  }).replace(/\s+/g, ' ').trim();
  return sanitized === '' ? null : sanitized;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function requiredInteger(value: unknown, label: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) throw new Error(`${label} is required`);
  return parsed;
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return undefined;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function textArrayLiteral(value: unknown): string {
  const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return `{${values.map((item) => `"${item.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;
}

function selectedOptionValues(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const option = optionalRecord(item);
    const name = optionalString(option?.name);
    const optionValue = optionalString(option?.value);
    return name && optionValue ? [{ name, value: optionValue }] : [];
  });
}

function optionalDate(value: unknown): Date | string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid Shopify date');
  return date;
}

function nullableMoney(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : parseMoney(value, 'money');
}

function parseMoney(value: unknown, field: string): string {
  if (value === undefined || value === null || value === '') throw new Error(`${field} is required`);
  const recordValue = optionalRecord(value);
  const moneyValue = optionalRecord(recordValue?.shopMoney) ?? recordValue;
  return normalizeMoney(moneyValue?.amount ?? value, field);
}

function connectionNodes(value: unknown): unknown[] {
  const container = optionalRecord(value);
  if (!container) return [];
  if (Array.isArray(container.nodes)) return container.nodes;
  if (Array.isArray(container.edges)) return container.edges.map((edge) => optionalRecord(edge)?.node).filter((node): node is unknown => node !== undefined);
  return [];
}

function hasCompleteVariantConnection(value: unknown): boolean {
  const container = optionalRecord(value);
  const pageInfo = optionalRecord(container?.pageInfo);
  return pageInfo?.hasNextPage === false && (Array.isArray(container?.nodes) || Array.isArray(container?.edges));
}
