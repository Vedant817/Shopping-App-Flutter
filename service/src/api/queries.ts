import { sql } from 'drizzle-orm';
import { capabilitiesForRole, parseWorkspaceRole } from '../auth/tenant.js';
import type { Database } from '../db/client.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';
import { parseMoney, divideMoney, ratio, subtractMoney } from '../utils/money.js';
import type { DateRange } from '../utils/time.js';
import type { CustomerDto, DataQualityDto, DecisionDto, OrderDto, OverviewDto, PeriodDemand, ProductDto, ProductVariantDto, WorkspaceDto } from './dtos.js';
import { getSyncStatus as getSyncJobStatus } from './jobs.js';

export async function listWorkspaces(db: Database, userId: string): Promise<WorkspaceDto[]> {
  const result = await db.execute(sql`
    select w.id, w.shop_domain, w.name, w.currency_code, w.time_zone, m.role
    from workspaces w
    join workspace_members m on m.workspace_id = w.id
    join shopify_installations si on si.workspace_id = w.id
    where m.user_id = ${userId} and w.uninstalled_at is null and si.uninstalled_at is null
    order by w.name asc, w.id asc
  `);
  return result.rows.map(mapWorkspace);
}

export async function getWorkspaceDto(db: Database, workspaceId: string, callerUserId: string): Promise<WorkspaceDto | undefined> {
  const result = await db.execute(sql`
    select w.id, w.shop_domain, w.name, w.currency_code, w.time_zone, m.role
    from workspaces w
    join workspace_members m on m.workspace_id = w.id
    join shopify_installations si on si.workspace_id = w.id
    where w.id = ${workspaceId} and m.user_id = ${callerUserId}
      and w.uninstalled_at is null and si.uninstalled_at is null limit 1
  `);
  const row = result.rows[0];
  return row ? mapWorkspace(row) : undefined;
}

export async function getOverview(db: Database, workspaceId: string, range: DateRange, now: Date, callerUserId: string): Promise<OverviewDto | undefined> {
  const workspace = await getWorkspaceDto(db, workspaceId, callerUserId);
  if (!workspace) return undefined;
  const occurred = sql`coalesce(processed_at, shopify_created_at, created_at)`;
  const metricsResult = await db.execute(sql`
    select
      coalesce(sum(total_price), 0)::text as revenue,
      coalesce(avg(total_price), 0)::text as average_order_value,
      count(*)::int as order_count,
      count(distinct customer_id)::int as customer_count,
      coalesce(sum(total_units), 0)::int as units,
      coalesce(sum(subtotal_price), 0)::text as subtotal,
      coalesce(sum(total_discounts), 0)::text as discounts
    from orders
    where workspace_id = ${workspaceId} and currency_code = ${workspace.currencyCode} and cancelled_at is null
      and ${occurred} >= ${range.from} and ${occurred} < ${range.to}
  `);
  const metrics = recordOrEmpty(metricsResult.rows[0]);
  const revenue = normalizeDbMoney(metrics.revenue);
  const orderCount = numberValue(metrics.order_count);
  const subtotal = normalizeDbMoney(metrics.subtotal);
  const discounts = normalizeDbMoney(metrics.discounts);
  const previousFrom = new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime()));
  const previousResult = await db.execute(sql`
    select coalesce(sum(total_price), 0)::text as revenue
    from orders
    where workspace_id = ${workspaceId} and currency_code = ${workspace.currencyCode} and cancelled_at is null
      and ${occurred} >= ${previousFrom} and ${occurred} < ${range.from}
  `);
  const previousRevenue = normalizeDbMoney(recordOrEmpty(previousResult.rows[0]).revenue);
  const trendResult = await db.execute(sql`
    with days as (
      select generate_series(
        (${range.from} at time zone ${workspace.timeZone})::date,
        ((${range.to} at time zone ${workspace.timeZone}) - interval '1 microsecond')::date,
        interval '1 day'
      )::date as day
    )
    select to_char(days.day, 'YYYY-MM-DD') as date,
      coalesce(sum(orders.total_price), 0)::text as revenue
    from days
    left join orders on orders.workspace_id = ${workspaceId}
      and orders.currency_code = ${workspace.currencyCode}
      and orders.cancelled_at is null
      and (coalesce(orders.processed_at, orders.shopify_created_at, orders.created_at) at time zone ${workspace.timeZone})::date = days.day
    group by days.day
    order by days.day asc
  `);
  const topResult = await db.execute(sql`
    select c.id, c.first_name, c.last_name, c.email, c.phone, c.avatar_url,
      c.default_address, c.raw, c.updated_at, coalesce(sum(o.total_price), 0)::text as spend,
      coalesce(sum(o.total_price), 0)::text as period_spend, count(o.id)::int as period_order_count,
      count(o.id)::int as order_count, coalesce(sum(o.total_units), 0)::int as units
    from orders o
    join customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
    where o.workspace_id = ${workspaceId} and o.currency_code = ${workspace.currencyCode} and o.cancelled_at is null and o.customer_id is not null
      and ${sql`coalesce(o.processed_at, o.shopify_created_at, o.created_at)`} >= ${range.from}
      and ${sql`coalesce(o.processed_at, o.shopify_created_at, o.created_at)`} < ${range.to}
    group by c.workspace_id, c.id, c.first_name, c.last_name, c.email, c.phone, c.avatar_url, c.default_address, c.raw, c.updated_at
    order by spend desc, c.id asc
    limit 10
  `);
  const quality = await getDataQuality(db, workspaceId, range, workspace.currencyCode);
  const sync = await getSyncJobStatus(db, workspaceId);
  const decisions = await getDecisions(db, workspaceId, range, revenue, previousRevenue, quality);
  return {
    workspace,
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset },
     generatedAt: now.toISOString(),
     currencyCode: workspace.currencyCode,
     metricBasis: 'gross_non_cancelled_order_value',
     metrics: {
      revenue,
      averageOrderValue: divideMoney(revenue, String(orderCount)),
      orderCount,
      customerCount: numberValue(metrics.customer_count),
      units: numberValue(metrics.units),
      discountRate: ratio(discounts, subtotal),
      currencyCode: workspace.currencyCode,
      metricBasis: 'gross_non_cancelled_order_value',
    },
    trend: trendResult.rows.map((row) => {
      const item = recordOrEmpty(row);
      return { date: String(item.date), revenue: normalizeDbMoney(item.revenue) };
    }),
    topCustomers: topResult.rows.map((row) => {
      const item = recordOrEmpty(row);
      return {
        customer: mapCustomerSummary(item),
        spend: normalizeDbMoney(item.spend),
        orderCount: numberValue(item.order_count),
        units: numberValue(item.units),
      };
    }),
    decisions,
    dataQuality: quality,
    sync,
  };
}

export type ProductListFilters = { search?: string; category?: string };

export async function listProducts(
  db: Database,
  workspaceId: string,
  limit: number,
  cursor?: string,
  filters: ProductListFilters = {},
): Promise<{ items: ProductDto[]; nextCursor: string | null }> {
  const decoded = decodeCursor(cursor);
  const cursorPredicate = decoded
    ? sql`(p.updated_at < ${new Date(decoded.key)} or (p.updated_at = ${new Date(decoded.key)} and p.id < ${decoded.id}))`
    : sql`true`;
  const search = filters.search?.trim().toLowerCase();
  const category = filters.category?.trim().toLowerCase();
  const searchPredicate = search
    ? sql`(strpos(lower(coalesce(p.title, '')), ${search}) > 0
      or strpos(lower(coalesce(p.handle, '')), ${search}) > 0
      or strpos(lower(coalesce(p.vendor, '')), ${search}) > 0
      or strpos(lower(coalesce(p.product_type, '')), ${search}) > 0
      or strpos(lower(coalesce(p.category, '')), ${search}) > 0
      or strpos(lower(coalesce(p.description, '')), ${search}) > 0
      or exists (select 1 from product_variants search_variants
        where search_variants.workspace_id = p.workspace_id and search_variants.product_id = p.id
          and strpos(lower(coalesce(search_variants.sku, '')), ${search}) > 0))`
    : sql`true`;
  const categoryPredicate = category ? sql`lower(coalesce(p.category, p.product_type, '')) = ${category}` : sql`true`;
  const result = await db.execute(sql`
    select p.id, p.title, p.handle, p.description, p.category, p.variants_complete, p.vendor, p.product_type,
      p.status, p.tags, p.featured_image_url, p.total_inventory, p.updated_at,
      min(pv.price)::text as price_min, max(pv.price)::text as price_max,
      count(pv.id)::int as variant_count,
      coalesce(array_agg(pv.sku order by pv.position asc, pv.id asc) filter (where pv.sku is not null), '{}') as variant_skus
    from products p
    left join product_variants pv on pv.workspace_id = p.workspace_id and pv.product_id = p.id
    where p.workspace_id = ${workspaceId} and p.deleted_at is null
      and ${cursorPredicate} and ${searchPredicate} and ${categoryPredicate}
    group by p.workspace_id, p.id
    order by p.updated_at desc, p.id desc
    limit ${limit + 1}
  `);
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  const nextCursor = result.rows.length > limit && last ? encodeCursor({ key: dateValue(last.updated_at).toISOString(), id: String(last.id) }) : null;
  return { items: rows.map(mapProduct), nextCursor };
}

export async function getProductDetail(db: Database, workspaceId: string, productId: string, range: DateRange, callerUserId: string): Promise<{ product: ProductDto; periodDemand: PeriodDemand } | undefined> {
  const workspace = await getWorkspaceDto(db, workspaceId, callerUserId);
  if (!workspace) return undefined;
  const result = await db.execute(sql`
    select p.id, p.title, p.handle, p.description, p.category, p.variants_complete, p.vendor, p.product_type,
      p.status, p.tags, p.featured_image_url, p.total_inventory, p.updated_at,
      min(pv.price)::text as price_min, max(pv.price)::text as price_max,
      count(pv.id)::int as variant_count,
      coalesce(array_agg(pv.sku order by pv.position asc, pv.id asc) filter (where pv.sku is not null), '{}') as variant_skus
    from products p
    left join product_variants pv on pv.workspace_id = p.workspace_id and pv.product_id = p.id
    where p.workspace_id = ${workspaceId} and p.id = ${productId} and p.deleted_at is null
    group by p.workspace_id, p.id
    limit 1
  `);
  const row = result.rows[0];
  if (!row) return undefined;
  const [variants, demand] = await Promise.all([
    db.execute(sql`
      select id, title, position, sku, barcode, price, compare_at_price,
        inventory_quantity, inventory_policy, taxable, image_url, option_values
      from product_variants
      where workspace_id = ${workspaceId} and product_id = ${productId}
      order by position asc, id asc
    `),
    db.execute(sql`
      select coalesce(sum(ol.total_price), 0)::text as revenue,
        coalesce(sum(ol.quantity), 0)::int as units,
        count(distinct o.id)::int as order_count
      from order_lines ol
      join orders o on o.workspace_id = ol.workspace_id and o.id = ol.order_id
      where ol.workspace_id = ${workspaceId} and ol.product_id = ${productId}
        and o.cancelled_at is null
        and o.currency_code = ${workspace.currencyCode}
        and coalesce(o.processed_at, o.shopify_created_at, o.created_at) >= ${range.from}
        and coalesce(o.processed_at, o.shopify_created_at, o.created_at) < ${range.to}
    `),
  ]);
  const product = mapProduct(row);
  product.variants = variants.rows.map(mapVariant);
  const demandRow = recordOrEmpty(demand.rows[0]);
  return {
    product,
    periodDemand: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      revenue: normalizeDbMoney(demandRow.revenue),
      units: numberValue(demandRow.units),
      orderCount: numberValue(demandRow.order_count),
      currencyCode: workspace.currencyCode,
      metricBasis: 'gross_non_cancelled_order_value',
    },
  };
}

export async function listCustomers(
  db: Database,
  workspaceId: string,
  range: DateRange,
  limit: number,
  cursor?: string,
  search?: string,
): Promise<{ items: CustomerDto[]; nextCursor: string | null }> {
  const decoded = decodeCursor(cursor);
  const cursorPredicate = decoded
    ? sql`(c.updated_at < ${new Date(decoded.key)} or (c.updated_at = ${new Date(decoded.key)} and c.id < ${decoded.id}))`
    : sql`true`;
  const term = search?.trim().toLowerCase();
  const searchPredicate = term
    ? sql`(strpos(lower(coalesce(c.first_name, '')), ${term}) > 0
      or strpos(lower(coalesce(c.last_name, '')), ${term}) > 0
      or strpos(lower(coalesce(c.email, '')), ${term}) > 0
      or strpos(lower(coalesce(c.phone, '')), ${term}) > 0
      or strpos(lower(coalesce(c.company, c.raw->>'company', '')), ${term}) > 0
      or strpos(lower(coalesce(c.city, c.default_address->>'city', '')), ${term}) > 0
      or strpos(lower(coalesce(c.province, c.default_address->>'province', c.state, '')), ${term}) > 0
      or strpos(lower(coalesce(c.country, c.default_address->>'country', '')), ${term}) > 0
      or strpos(lower(c.id), ${term}) > 0)`
    : sql`true`;
  const result = await db.execute(sql`
    select c.id, c.first_name, c.last_name, c.email, c.phone, c.company, c.city, c.province, c.country, c.state, c.avatar_url,
      c.default_address, c.raw, c.orders_count,
       coalesce((select sum(o.total_price) from orders scoped_total
         where scoped_total.workspace_id = c.workspace_id and scoped_total.customer_id = c.id
           and scoped_total.currency_code = (select currency_code from workspaces where id = c.workspace_id)
           and scoped_total.cancelled_at is null), 0)::text as total_spent,
       c.updated_at,
      coalesce(period_metrics.period_spend, '0')::text as period_spend,
      coalesce(period_metrics.period_order_count, 0)::int as period_order_count,
      coalesce(period_metrics.period_units, 0)::int as period_units
    from customers c
    left join lateral (
      select sum(o.total_price)::text as period_spend, count(o.id)::int as period_order_count,
        coalesce(sum(o.total_units), 0)::int as period_units
      from orders o
       where o.workspace_id = c.workspace_id and o.customer_id = c.id and o.currency_code = (select currency_code from workspaces where id = c.workspace_id) and o.cancelled_at is null
         and coalesce(o.processed_at, o.shopify_created_at, o.created_at) >= ${range.from}
        and coalesce(o.processed_at, o.shopify_created_at, o.created_at) < ${range.to}
    ) period_metrics on true
    where c.workspace_id = ${workspaceId} and c.deleted_at is null
      and ${cursorPredicate} and ${searchPredicate}
    order by c.updated_at desc, c.id desc
    limit ${limit + 1}
  `);
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  const nextCursor = result.rows.length > limit && last ? encodeCursor({ key: dateValue(last.updated_at).toISOString(), id: String(last.id) }) : null;
  return { items: rows.map(mapCustomer), nextCursor };
}

export async function getCustomerDetail(
  db: Database,
  workspaceId: string,
  customerId: string,
  range: DateRange,
  callerUserId: string,
  includeCancelled = false,
): Promise<{ customer: CustomerDto; periodDemand: PeriodDemand; recentOrders: OrderDto[] } | undefined> {
  const workspace = await getWorkspaceDto(db, workspaceId, callerUserId);
  if (!workspace) return undefined;
  const result = await db.execute(sql`
    select c.id, c.first_name, c.last_name, c.email, c.phone, c.company, c.city, c.province, c.country, c.state, c.avatar_url,
      c.default_address, c.raw, c.orders_count,
       coalesce((select sum(o.total_price) from orders scoped_total
         where scoped_total.workspace_id = c.workspace_id and scoped_total.customer_id = c.id
           and scoped_total.currency_code = (select currency_code from workspaces where id = c.workspace_id)
           and scoped_total.cancelled_at is null), 0)::text as total_spent,
       c.updated_at,
      coalesce(period_metrics.period_spend, '0')::text as period_spend,
      coalesce(period_metrics.period_order_count, 0)::int as period_order_count,
      coalesce(period_metrics.period_units, 0)::int as period_units
    from customers c
    left join lateral (
      select sum(o.total_price)::text as period_spend, count(o.id)::int as period_order_count,
        coalesce(sum(o.total_units), 0)::int as period_units
      from orders o
       where o.workspace_id = c.workspace_id and o.customer_id = c.id and o.currency_code = (select currency_code from workspaces where id = c.workspace_id) and o.cancelled_at is null
         and coalesce(o.processed_at, o.shopify_created_at, o.created_at) >= ${range.from}
        and coalesce(o.processed_at, o.shopify_created_at, o.created_at) < ${range.to}
    ) period_metrics on true
    where c.workspace_id = ${workspaceId} and c.id = ${customerId} and c.deleted_at is null
    limit 1
  `);
  const row = result.rows[0];
  if (!row) return undefined;
  const recent = await listOrders(db, workspaceId, range, 10, undefined, customerId, includeCancelled);
  return {
    customer: mapCustomer(row),
    periodDemand: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      revenue: normalizeDbMoney(row.period_spend),
      units: numberValue(row.period_units),
      orderCount: numberValue(row.period_order_count),
      currencyCode: workspace.currencyCode,
      metricBasis: 'gross_non_cancelled_order_value',
    },
    recentOrders: recent.items,
  };
}

export type OrderListResult = {
  items: OrderDto[];
  nextCursor: string | null;
  includeCancelled: boolean;
  cancellationPolicy: 'excluded' | 'included';
};

export async function listOrders(
  db: Database,
  workspaceId: string,
  range: DateRange,
  limit: number,
  cursor?: string,
  customerId?: string,
  includeCancelled = false,
): Promise<OrderListResult> {
  const decoded = decodeCursor(cursor);
  const occurred = sql`coalesce(o.processed_at, o.shopify_created_at, o.created_at)`;
  const cursorPredicate = decoded
    ? sql`(${occurred} < ${new Date(decoded.key)} or (${occurred} = ${new Date(decoded.key)} and o.id < ${decoded.id}))`
    : sql`true`;
  const customerPredicate = customerId ? sql`o.customer_id = ${customerId}` : sql`true`;
  const cancellationPredicate = includeCancelled ? sql`true` : sql`o.cancelled_at is null`;
  const result = await db.execute(sql`
    select o.id, o.name, o.order_number, o.customer_id, o.email,
      o.financial_status, o.fulfillment_status, o.currency_code,
      o.subtotal_price, o.total_discounts, o.total_tax, o.total_price, o.total_units,
      ${occurred} as ordered_at, o.cancelled_at, o.updated_at
    from orders o
    where o.workspace_id = ${workspaceId}
      and ${occurred} >= ${range.from} and ${occurred} < ${range.to}
      and ${cursorPredicate} and ${customerPredicate} and ${cancellationPredicate}
    order by ordered_at desc, o.id desc
    limit ${limit + 1}
  `);
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  const nextCursor = result.rows.length > limit && last ? encodeCursor({ key: dateValue(last.ordered_at).toISOString(), id: String(last.id) }) : null;
  return { items: rows.map(mapOrder), nextCursor, includeCancelled, cancellationPolicy: includeCancelled ? 'included' : 'excluded' };
}

async function getDataQuality(db: Database, workspaceId: string, range: DateRange, currencyCode: string): Promise<DataQualityDto> {
  const result = await db.execute(sql`
    select
      (select count(*)::int from products where workspace_id = ${workspaceId} and deleted_at is null) as product_count,
      (select count(*)::int from products where workspace_id = ${workspaceId} and deleted_at is null and featured_image_url is not null) as product_media_count,
      (select count(*)::int from products where workspace_id = ${workspaceId} and deleted_at is null and total_inventory is not null) as stock_count,
      (select count(*)::int from customers where workspace_id = ${workspaceId} and deleted_at is null) as customer_count,
      (select count(*)::int from customers where workspace_id = ${workspaceId} and deleted_at is null and avatar_url is not null) as customer_media_count,
      (select count(*)::int from customers where workspace_id = ${workspaceId} and deleted_at is null and email is not null) as customer_email_count,
       (select count(*)::int from orders where workspace_id = ${workspaceId} and currency_code = ${currencyCode} and cancelled_at is null
         and coalesce(processed_at, shopify_created_at, created_at) >= ${range.from}
        and coalesce(processed_at, shopify_created_at, created_at) < ${range.to}) as order_count,
       (select count(*)::int from orders o join customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
         where o.workspace_id = ${workspaceId} and o.currency_code = ${currencyCode} and o.cancelled_at is null and o.customer_id is not null
        and coalesce(o.processed_at, o.shopify_created_at, o.created_at) >= ${range.from}
        and coalesce(o.processed_at, o.shopify_created_at, o.created_at) < ${range.to}) as linked_order_count
  `);
  const row = recordOrEmpty(result.rows[0]);
  const productCount = numberValue(row.product_count);
  const customerCount = numberValue(row.customer_count);
  const orderCount = numberValue(row.order_count);
  return {
    productMediaCoverage: ratio(String(numberValue(row.product_media_count)), String(productCount)),
    customerMediaCoverage: ratio(String(numberValue(row.customer_media_count)), String(customerCount)),
    customerEmailCoverage: ratio(String(numberValue(row.customer_email_count)), String(customerCount)),
    stockCoverage: ratio(String(numberValue(row.stock_count)), String(productCount)),
    linkedOrderCustomerRate: ratio(String(numberValue(row.linked_order_count)), String(orderCount)),
    linkedOrderCustomers: numberValue(row.linked_order_count),
    orderCount,
  };
}

async function getDecisions(db: Database, workspaceId: string, range: DateRange, revenue: string, previousRevenue: string, quality: DataQualityDto): Promise<DecisionDto[]> {
  const decisions: DecisionDto[] = [];
  const change = previousRevenue === '0' ? null : divideMoney(subtractMoney(revenue, previousRevenue), previousRevenue);
  const positiveChange = change !== null && !change.startsWith('-');
  decisions.push({
    code: 'revenue_momentum',
    title: change === null ? 'Revenue history is limited' : positiveChange ? 'Revenue momentum is positive' : 'Revenue softened',
    description: change === null ? 'A prior comparable period has no recorded revenue.' : `Revenue changed by ${change} versus the prior comparable period.`,
    priority: change === null ? 'information' : positiveChange ? 'positive' : 'attention',
    evidence: { currentRevenue: revenue, previousRevenue, change },
  });
  const lowStock = await db.execute(sql`
    select count(*)::int as count from products
     where workspace_id = ${workspaceId} and deleted_at is null and total_inventory <= 0
  `);
  const lowStockCount = numberValue(recordOrEmpty(lowStock.rows[0]).count);
  decisions.push({
    code: 'inventory_attention',
       title: lowStockCount === 0 ? 'No out-of-stock products detected' : `${lowStockCount} products are out of stock`,
       description: lowStockCount === 0 ? 'No active product has zero recorded inventory.' : 'Active products with zero recorded inventory were found.',
       priority: lowStockCount === 0 ? 'positive' : 'attention',
       evidence: { threshold: 0, productCount: lowStockCount },
  });
  const topProduct = await db.execute(sql`
    select p.id, p.title, coalesce(sum(ol.quantity), 0)::int as units,
      coalesce(sum(ol.total_price), 0)::text as revenue
    from order_lines ol
    join orders o on o.workspace_id = ol.workspace_id and o.id = ol.order_id
    join products p on p.workspace_id = ol.workspace_id and p.id = ol.product_id
    where ol.workspace_id = ${workspaceId} and o.currency_code = (select currency_code from workspaces where id = ${workspaceId}) and p.deleted_at is null and o.cancelled_at is null
      and coalesce(o.processed_at, o.shopify_created_at, o.created_at) >= ${range.from}
      and coalesce(o.processed_at, o.shopify_created_at, o.created_at) < ${range.to}
    group by p.workspace_id, p.id, p.title
    order by units desc, p.id asc
    limit 1
  `);
  const top = recordOrEmpty(topProduct.rows[0]);
  if (top.id !== undefined) {
    decisions.push({
      code: 'product_demand',
      title: `${String(top.title)} leads unit demand`,
      description: `${numberValue(top.units)} units were recorded in the selected period.`,
      priority: 'information',
      evidence: { productId: String(top.id), units: numberValue(top.units), revenue: normalizeDbMoney(top.revenue) },
    });
  }
  decisions.push({
    code: 'customer_linkage',
    title: quality.linkedOrderCustomerRate === '1' ? 'Customer linkage is complete' : 'Some order customer links need review',
    description: 'Linked order customer coverage is calculated from stored Shopify identifiers.',
    priority: quality.linkedOrderCustomerRate === '1' ? 'positive' : 'attention',
    evidence: { linkedOrderCustomerRate: quality.linkedOrderCustomerRate, orderCount: quality.orderCount },
  });
  return decisions;
}

function mapWorkspace(row: unknown): WorkspaceDto {
  const value = recordOrEmpty(row);
  const role = parseWorkspaceRole(value.role);
  return {
    id: String(value.id),
    shopDomain: String(value.shop_domain),
    name: String(value.name),
    currencyCode: String(value.currency_code),
    timeZone: String(value.time_zone),
    role,
    capabilities: capabilitiesForRole(role),
  };
}

function mapProduct(row: unknown): ProductDto {
  const value = recordOrEmpty(row);
  const skus = Array.isArray(value.variant_skus) ? value.variant_skus.map(String) : [];
  return {
    id: String(value.id),
    title: String(value.title),
    handle: nullableString(value.handle),
    description: nullableString(value.description),
    category: nullableString(value.category),
    variantsTruncated: value.variants_complete !== true,
    vendor: nullableString(value.vendor),
    sku: skus[0] ?? null,
    skus,
    productType: nullableString(value.product_type),
    status: String(value.status),
    tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
    thumbnail: nullableString(value.featured_image_url),
    priceMin: nullableDbMoney(value.price_min),
    priceMax: nullableDbMoney(value.price_max),
    inventoryQuantity: nullableNumber(value.total_inventory),
    variantCount: numberValue(value.variant_count),
    variants: [],
    updatedAt: dateValue(value.updated_at).toISOString(),
  };
}

function mapVariant(row: unknown): ProductVariantDto {
  const value = recordOrEmpty(row);
  const options = Array.isArray(value.option_values) ? value.option_values.flatMap((item) => {
    const option = recordOrEmpty(item);
    const name = typeof option.name === 'string' ? option.name : '';
    const optionValue = typeof option.value === 'string' ? option.value : '';
    return name && optionValue ? [{ name, value: optionValue }] : [];
  }) : [];
  return {
    id: String(value.id),
    title: String(value.title),
    position: numberValue(value.position),
    sku: nullableString(value.sku),
    barcode: nullableString(value.barcode),
    price: normalizeDbMoney(value.price),
    compareAtPrice: nullableDbMoney(value.compare_at_price),
    inventoryQuantity: nullableNumber(value.inventory_quantity),
    inventoryPolicy: nullableString(value.inventory_policy),
    taxable: typeof value.taxable === 'boolean' ? value.taxable : null,
    imageUrl: nullableString(value.image_url),
    options,
  };
}

function mapCustomer(row: unknown): CustomerDto {
  const value = recordOrEmpty(row);
  const address = recordOrEmpty(value.default_address);
  const raw = recordOrEmpty(value.raw);
  return {
    id: String(value.id),
    firstName: nullableString(value.first_name),
    lastName: nullableString(value.last_name),
    email: nullableString(value.email),
    phone: nullableString(value.phone),
    city: nullableString(value.city) ?? nullableString(address.city),
    province: nullableString(value.province) ?? nullableString(value.state) ?? nullableString(address.province) ?? nullableString(address.provinceCode),
    country: nullableString(value.country) ?? nullableString(address.country),
    company: nullableString(value.company) ?? nullableString(address.company) ?? nullableString(raw.company),
    ordersCount: nullableNumber(value.orders_count),
    totalSpent: nullableDbMoney(value.total_spent),
    periodSpend: value.period_spend === undefined ? null : normalizeDbMoney(value.period_spend),
    periodOrderCount: value.period_order_count === undefined ? null : numberValue(value.period_order_count),
    avatarUrl: nullableString(value.avatar_url),
    updatedAt: dateValue(value.updated_at).toISOString(),
  };
}

function mapOrder(row: unknown): OrderDto {
  const value = recordOrEmpty(row);
  return {
    id: String(value.id),
    name: nullableString(value.name),
    orderNumber: nullableNumber(value.order_number),
    customerId: nullableString(value.customer_id),
    email: nullableString(value.email),
    financialStatus: nullableString(value.financial_status),
    fulfillmentStatus: nullableString(value.fulfillment_status),
    currencyCode: String(value.currency_code),
    subtotalPrice: normalizeDbMoney(value.subtotal_price),
    totalDiscounts: normalizeDbMoney(value.total_discounts),
    totalTax: normalizeDbMoney(value.total_tax),
    totalPrice: normalizeDbMoney(value.total_price),
    totalUnits: numberValue(value.total_units),
    orderedAt: dateValue(value.ordered_at).toISOString(),
    cancelledAt: nullableDate(value.cancelled_at),
    updatedAt: dateValue(value.updated_at).toISOString(),
  };
}

function mapCustomerSummary(row: Record<string, unknown>): CustomerDto {
  return mapCustomer(row);
}

function normalizeDbMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return '0';
  return parseMoney(String(value));
}

function nullableDbMoney(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return normalizeDbMoney(value);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = numberValue(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return dateValue(value).toISOString();
}

function dateValue(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid date');
  return date;
}
