import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { acceptWebhook, normalizeWebhook, processWebhookJob } from '../src/ingestion/webhooks.js';

const fixtures = [
  { topic: 'products/update', body: { id: 101, title: 'REST product title', descriptionHtml: '<b>not canonical</b>', variants: [] }, resource: 'product', id: '101' },
  { topic: 'customers/update', body: { id: 202, email: 'customer@example.test' }, resource: 'customer', id: '202' },
  { topic: 'orders/updated', body: { id: 303, order_number: 7, email: 'buyer@example.test' }, resource: 'order', id: '303' },
  { topic: 'refunds/create', body: { id: 404, order_id: 303, total_amount: '5.00' }, resource: 'refund', id: '404' },
];

describe('Shopify webhook normalization', () => {
  it('maps real REST payload shapes to stable canonical resources', () => {
    for (const fixture of fixtures) {
      const normalized = normalizeWebhook(fixture.topic, fixture.body, `hook-${fixture.id}`);
       expect(normalized).toMatchObject({ resource: fixture.resource, stableId: `gid://shopify/${fixture.resource[0]!.toUpperCase()}${fixture.resource.slice(1)}/${fixture.id}` });
    }
  });

  it('enqueues only a stable resource reference after authenticated acceptance', async () => {
    const statements: unknown[] = [];
    const body = Buffer.from(JSON.stringify({ id: 101, title: 'REST-only title' }));
    const hmac = createHmac('sha256', 'webhook-secret').update(body).digest('hex');
    const db = {
      execute: async (query: unknown) => { statements.push(query); return { rows: [{ id: 'workspace-1', shop_domain: 'example-shop.myshopify.com', name: 'Shop', currency_code: 'USD', time_zone: 'UTC', uninstalled_at: null }] }; },
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ execute: async (query: unknown) => { statements.push(query); return { rows: [{ id: 'event-1' }] }; } }),
    };
    await acceptWebhook(db as never, { rawBody: body, hmac, webhookId: 'hook-accept', shopDomain: 'example-shop.myshopify.com', topic: 'products/update', secret: 'webhook-secret' });
    const serialized = JSON.stringify(statements);
    expect(serialized).toContain('gid://shopify/Product/101');
    expect(serialized).not.toContain('REST-only title');
  });

  it('refetches canonical Admin API nodes before persistence', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => { statements.push(query); return { rows: [] }; },
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } }),
    };
    const refetched: string[] = [];
    for (const fixture of fixtures) {
      const id = fixture.id;
      const node = fixture.resource === 'product'
        ? { id, title: 'Canonical product', status: 'ACTIVE', tags: [], variants: { nodes: [] } }
        : fixture.resource === 'customer'
          ? { id, email: 'canonical@example.test' }
          : fixture.resource === 'order'
            ? { id, currencyCode: 'USD', subtotalPrice: '10', totalDiscounts: '0', totalTax: '0', totalPrice: '10', lineItems: { nodes: [] } }
            : { id, order: { id: '303', currencyCode: 'USD' }, totalRefundedSet: { shopMoney: { amount: '5', currencyCode: 'USD' } } };
      await processWebhookJob(db as never, 'workspace-1', {
        webhookId: `hook-${id}`,
        topic: fixture.topic,
        resource: fixture.resource,
        stableId: id,
        shopDomain: 'example-shop.myshopify.com',
      }, { refetch: async (resource, stableId) => { refetched.push(`${resource}:${stableId}`); return node as Record<string, unknown>; } });
    }
    expect(refetched).toHaveLength(fixtures.length);
    expect(statements.some((statement) => JSON.stringify(statement).includes('refunds'))).toBe(true);
  });

  it('rejects a refund payload without a stable refund id', () => {
    expect(() => normalizeWebhook('refunds/create', { order_id: 303 }, 'hook-1')).toThrow(/refund.id/);
  });

  it('rejects unsupported Admin cart and checkout topics', () => {
    expect(() => normalizeWebhook('carts/update', { id: 505 }, 'hook-cart')).toThrow(/not accepted/);
    expect(() => normalizeWebhook('checkouts/update', { id: 606 }, 'hook-checkout')).toThrow(/not accepted/);
  });
});
