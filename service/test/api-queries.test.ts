import { describe, expect, it } from 'vitest';
import { getCustomerDetail, getOverview, getProductDetail, listCustomers, listOrders, listProducts } from '../src/api/queries.js';
import { encodeCursor } from '../src/utils/cursor.js';

const range = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-02-01T00:00:00.000Z'), preset: 'custom' };

function productRow(id: string, updatedAt: string) {
  return {
    id,
    title: `Product ${id}`,
    handle: `product-${id}`,
    description: 'Description',
    category: 'Shoes',
    variants_complete: true,
    vendor: 'Vendor',
    product_type: 'Shoes',
    status: 'ACTIVE',
    tags: ['new'],
    featured_image_url: 'https://cdn.example.test/product.png',
    total_inventory: 4,
    updated_at: updatedAt,
    price_min: '10.0000',
    price_max: '20.0000',
    variant_count: 1,
    variant_skus: ['SKU-1'],
  };
}

function customerRow() {
  return {
    id: 'gid://shopify/Customer/1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.test',
    phone: null,
    state: 'CA',
    avatar_url: null,
    default_address: { city: 'London', province: 'England', country: 'United Kingdom' },
    raw: {},
    orders_count: 3,
    total_spent: '100.0000',
    period_spend: '40.0000',
    period_order_count: 2,
    period_units: 5,
    updated_at: '2026-01-20T00:00:00.000Z',
  };
}

function orderRow(id: string, orderedAt: string) {
  return {
    id,
    name: `#${id}`,
    order_number: Number(id),
    customer_id: 'gid://shopify/Customer/1',
    email: 'ada@example.test',
    financial_status: 'PAID',
    fulfillment_status: 'FULFILLED',
    currency_code: 'USD',
    subtotal_price: '30.0000',
    total_discounts: '0.0000',
    total_tax: '0.0000',
    total_price: '30.0000',
    total_units: 2,
    ordered_at: orderedAt,
    cancelled_at: null,
    updated_at: orderedAt,
  };
}

describe('tenant API queries', () => {
  it('applies search, category, and cursor predicates before paginating products', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => {
        statements.push(query);
        return { rows: [productRow('1', '2026-01-20T00:00:00.000Z'), productRow('2', '2026-01-19T00:00:00.000Z')] };
      },
    };
    const cursor = encodeCursor({ key: '2026-01-21T00:00:00.000Z', id: 'gid://shopify/Product/3' });
    const result = await listProducts(db as never, 'workspace-1', 1, cursor, { search: 'vendor', category: 'Shoes' });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeTruthy();
    const sql = JSON.stringify(statements[0]);
    expect(sql).toContain('strpos');
    expect(sql).toContain('vendor');
    expect(sql).toContain('shoes');
    expect(sql).toContain('gid://shopify/Product/3');
  });

  it('marks products with unknown variant completeness explicitly', async () => {
    const db = { execute: async () => ({ rows: [{ ...productRow('1', '2026-01-20T00:00:00.000Z'), variants_complete: false }] }) };
    const result = await listProducts(db as never, 'workspace-1', 20);
    expect(result.items[0]?.variantsTruncated).toBe(true);
  });

  it('returns mobile product details with decimal variant summaries', async () => {
     const responses = [
       { rows: [{ id: 'workspace-1', shop_domain: 'workspace.myshopify.com', name: 'Workspace', currency_code: 'USD', time_zone: 'UTC', role: 'owner' }] },
       { rows: [productRow('1', '2026-01-20T00:00:00.000Z')] },
      { rows: [{ id: 'gid://shopify/ProductVariant/1', title: 'Blue', position: 1, sku: 'SKU-1', barcode: '123', price: '10.0000', compare_at_price: '12.0000', inventory_quantity: 4, inventory_policy: 'DENY', taxable: true, image_url: 'https://cdn.example.test/blue.png', option_values: [{ name: 'Color', value: 'Blue' }] }] },
      { rows: [{ revenue: '10.0000', units: 1, order_count: 1 }] },
    ];
    const db = { execute: async () => responses.shift() ?? { rows: [] } };
    const result = await getProductDetail(db as never, 'workspace-1', 'gid://shopify/Product/1', range, 'user-1');
    expect(result?.product.sku).toBe('SKU-1');
    expect(result?.product.variants[0]).toMatchObject({ id: 'gid://shopify/ProductVariant/1', price: '10', compareAtPrice: '12', options: [{ name: 'Color', value: 'Blue' }] });
    expect(result?.periodDemand.revenue).toBe('10');
  });

  it('returns selected-range customer metrics and recent authorized orders', async () => {
     const responses = [
       { rows: [{ id: 'workspace-1', shop_domain: 'workspace.myshopify.com', name: 'Workspace', currency_code: 'USD', time_zone: 'UTC', role: 'owner' }] },
       { rows: [customerRow()] },
      { rows: [orderRow('2', '2026-01-19T00:00:00.000Z')] },
    ];
    const db = { execute: async () => responses.shift() ?? { rows: [] } };
    const detail = await getCustomerDetail(db as never, 'workspace-1', 'gid://shopify/Customer/1', range, 'user-1');
    expect(detail?.customer.periodSpend).toBe('40');
    expect(detail?.customer.periodOrderCount).toBe(2);
    expect(detail?.recentOrders[0]).toMatchObject({ id: '2', totalPrice: '30', orderedAt: '2026-01-19T00:00:00.000Z' });
  });

  it('adds period customer metrics to list DTOs', async () => {
    const statements: unknown[] = [];
    const db = { execute: async (query: unknown) => { statements.push(query); return { rows: [customerRow()] }; } };
    const result = await listCustomers(db as never, 'workspace-1', range, 20, undefined, 'gid://shopify/Customer/1');
    expect(result.items[0]).toMatchObject({ periodSpend: '40', periodOrderCount: 2 });
    const sql = JSON.stringify(statements[0]);
     for (const field of ['company', 'city', 'province', 'country', 'c.id', 'scoped_total']) expect(sql).toContain(field);
  });

  it('paginates workspace orders with stable UTC cursors', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => {
        statements.push(query);
        return { rows: [orderRow('2', '2026-01-19T00:00:00.000Z'), orderRow('1', '2026-01-18T00:00:00.000Z')] };
      },
    };
    const result = await listOrders(db as never, 'workspace-1', range, 1, undefined, 'gid://shopify/Customer/1');
    expect(result.items[0]?.id).toBe('2');
    expect(result.nextCursor).toBeTruthy();
    expect(JSON.stringify(statements[0])).toContain('workspace-1');
    expect(JSON.stringify(statements[0])).toContain('gid://shopify/Customer/1');
    expect(JSON.stringify(statements[0])).toContain('o.cancelled_at is null');
    expect(result.includeCancelled).toBe(false);
  });

  it('includes cancelled orders only for explicit operational requests', async () => {
    const statements: unknown[] = [];
    const db = { execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } };
    const result = await listOrders(db as never, 'workspace-1', range, 20, undefined, undefined, true);
    expect(result.includeCancelled).toBe(true);
    expect(JSON.stringify(statements[0])).not.toContain('o.cancelled_at is null');
  });

   it('scopes monetary metrics to the workspace currency and labels the basis', async () => {
     const statements: unknown[] = [];
     let first = true;
     const db = { execute: async (query: unknown) => { statements.push(query); if (first) { first = false; return { rows: [{ id: 'workspace-1', shop_domain: 'workspace.myshopify.com', name: 'Workspace', currency_code: 'USD', time_zone: 'America/New_York', role: 'owner' }] }; } return { rows: [] }; } };
      const overview = await getOverview(db as never, 'workspace-1', range, new Date('2026-02-02T00:00:00Z'), 'user-1');
     expect(overview?.metrics).toMatchObject({ currencyCode: 'USD', metricBasis: 'gross_non_cancelled_order_value' });
     const orderQueries = statements.map((statement) => JSON.stringify(statement)).filter((sql) => sql.includes('from orders') && (sql.includes('sum(') || sql.includes('avg(')));
     expect(orderQueries.length).toBeGreaterThan(0);
     expect(orderQueries.every((sql) => sql.includes('currency_code'))).toBe(true);
     expect(JSON.stringify(statements).includes('generate_series')).toBe(true);
   });

   it('excludes cancelled orders from every period metric query', async () => {
    const statements: unknown[] = [];
    let first = true;
    const db = { execute: async (query: unknown) => { statements.push(query); if (first) { first = false; return { rows: [{ id: 'workspace-1', shop_domain: 'workspace.myshopify.com', name: 'Workspace', currency_code: 'USD', time_zone: 'UTC', role: 'owner' }] }; } return { rows: [] }; } };
     await getOverview(db as never, 'workspace-1', range, new Date('2026-02-02T00:00:00Z'), 'user-1');
    const orderQueries = statements.map((statement) => JSON.stringify(statement)).filter((sql) => sql.includes('from orders'));
    expect(orderQueries.length).toBeGreaterThan(0);
    expect(orderQueries.every((sql) => sql.includes('cancelled_at is null'))).toBe(true);
  });
});
