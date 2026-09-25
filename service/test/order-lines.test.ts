import { describe, expect, it } from 'vitest';
import { fetchCompleteCartLines, fetchCompleteOrderLines } from '../src/shopify/sync.js';
import { upsertOrderWithExecutor } from '../src/db/upserts.js';

describe('order line reconciliation', () => {
  it('fetches every order line page', async () => {
    const requested: Array<Record<string, unknown>> = [];
    const client = {
      forEachPage: async (_query: string, variables: Record<string, unknown>, _select: unknown, onPage: (page: { nodes: unknown[]; endCursor: string | null; hasNextPage: boolean }) => Promise<void>) => {
        const first = variables.after === null;
        requested.push({ ...variables, after: first ? null : 'line-cursor' });
        await onPage({ nodes: Array.from({ length: first ? 250 : 3 }, (_, index) => ({ id: `line-${first ? index : 250 + index}` })), endCursor: first ? 'line-cursor' : null, hasNextPage: first });
        if (first) {
          requested.push({ ...variables, after: 'line-cursor' });
          await onPage({ nodes: Array.from({ length: 3 }, (_, index) => ({ id: `line-${250 + index}` })), endCursor: null, hasNextPage: false });
        }
      },
    };
    const lines = await fetchCompleteOrderLines(client as never, 'gid://shopify/Order/1');
    expect(lines).toHaveLength(253);
    expect(requested[1]).toMatchObject({ orderId: 'gid://shopify/Order/1', after: 'line-cursor' });
  });

  it('fetches cart lines without a nested first-page truncation', async () => {
    const requested: Array<Record<string, unknown>> = [];
    const client = {
      forEachPage: async (_query: string, variables: Record<string, unknown>, _select: unknown, onPage: (page: { nodes: unknown[]; endCursor: string | null; hasNextPage: boolean }) => Promise<void>) => {
        const first = variables.after === null;
        requested.push({ ...variables, after: first ? null : 'cart-cursor' });
        await onPage({ nodes: [{ id: first ? 'cart-line-1' : 'cart-line-2' }], endCursor: first ? 'cart-cursor' : null, hasNextPage: first });
        if (first) {
          requested.push({ ...variables, after: 'cart-cursor' });
          await onPage({ nodes: [{ id: 'cart-line-2' }], endCursor: null, hasNextPage: false });
        }
      },
    };
    await expect(fetchCompleteCartLines(client as never, 'gid://shopify/Cart/1')).resolves.toHaveLength(2);
    expect(requested[1]).toMatchObject({ cartId: 'gid://shopify/Cart/1', after: 'cart-cursor' });
  });

  it('reconciles changed orders by deleting removed lines before inserting the canonical set', async () => {
    const statements: unknown[] = [];
    const tx = { execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } };
    await upsertOrderWithExecutor(tx as never, 'workspace-1', {
      id: 'gid://shopify/Order/1',
      currencyCode: 'USD',
      subtotalPrice: '20',
      totalDiscounts: '0',
      totalTax: '0',
      totalPrice: '20',
      lineItems: { nodes: [{ id: 'new-line', title: 'New', quantity: 1, originalUnitPrice: '20', totalDiscount: '0', totalPrice: '20' }] },
    }, { replaceLines: true });
    const serialized = JSON.stringify(statements);
    expect(serialized).toContain('delete from order_lines');
    expect(serialized).toContain('new-line');
  });
});
