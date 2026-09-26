import { describe, expect, it } from 'vitest';
import { listCheckouts } from '../src/api/queries.js';

type Row = Record<string, unknown>;

function dbReturning(rows: Row[]) {
  const statements: string[] = [];
  return {
    statements,
    db: {
      execute: async (query: { queryChunks?: unknown[] } | string) => {
        statements.push(JSON.stringify(query));
        return { rows, rowCount: rows.length };
      },
    } as never,
  };
}

const checkoutRow = (overrides: Row = {}): Row => ({
  id: 'gid://shopify/Checkout/1',
  cart_id: 'gid://shopify/Cart/1',
  customer_id: null,
  email: 'buyer@example.com',
  currency_code: 'INR',
  subtotal_price: '1000.0000',
  total_price: '1180.0000',
  total_quantity: 2,
  created_at: new Date('2026-09-01T10:00:00Z'),
  updated_at: new Date('2026-09-02T10:00:00Z'),
  completed_at: null,
  ...overrides,
});

const range = { preset: 'thirty_days', from: new Date('2026-08-27T00:00:00Z'), to: new Date('2026-09-26T00:00:00Z') } as const;

describe('abandoned checkout recovery', () => {
  it('reads the checkouts the sync already ingests', async () => {
    // This is the read path the feature was missing: the sync wrote these rows
    // on every full sync and nothing could ever return them.
    const { db, statements } = dbReturning([checkoutRow()]);
    const page = await listCheckouts(db, 'workspace-1', range, 20);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.email).toBe('buyer@example.com');
    expect(page.items[0]?.totalPrice).toBe('1180');
    expect(page.currencyCode).toBe('INR');
    expect(JSON.stringify(statements)).toContain('from checkouts c');
  });

  it('excludes checkouts that later completed, so recovered value is not overstated', async () => {
    const { db, statements } = dbReturning([]);
    await listCheckouts(db, 'workspace-1', range, 20);
    const sql = JSON.stringify(statements);
    expect(sql).toContain('completed_at is null');
  });

  it('scopes to the workspace and the requested window', async () => {
    const { db, statements } = dbReturning([]);
    await listCheckouts(db, 'workspace-1', range, 20);
    const sql = JSON.stringify(statements);
    expect(sql).toContain('workspace_id');
    expect(sql).toContain('shopify_created_at');
  });

  it('sums the recoverable value across the page', async () => {
    const { db } = dbReturning([
      checkoutRow({ id: 'a', total_price: '100.0000' }),
      checkoutRow({ id: 'b', total_price: '250.5000' }),
    ]);
    const page = await listCheckouts(db, 'workspace-1', range, 20);
    // Decimal arithmetic, not float addition, so the figure is exact money.
    expect(page.recoveredValue).toBe('350.50');
  });

  it('reports zero rather than an empty currency for a store with no abandoned checkouts', async () => {
    const { db } = dbReturning([]);
    const page = await listCheckouts(db, 'workspace-1', range, 20);
    expect(page.items).toEqual([]);
    expect(page.recoveredValue).toBe('0.00');
    expect(page.currencyCode).toBe('');
    expect(page.nextCursor).toBeNull();
  });

  it('pages with a cursor when the database returned a full extra row', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => checkoutRow({ id: `c${index}` }));
    const { db } = dbReturning(rows);
    const page = await listCheckouts(db, 'workspace-1', range, 3);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toEqual(expect.any(String));
  });
});
