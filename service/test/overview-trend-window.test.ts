import { describe, expect, it } from 'vitest';
import { getOverview } from '../src/api/queries.js';

type Row = Record<string, unknown>;

/**
 * Routes each statement to the shape it expects, because getOverview issues
 * several different queries and a stub that returns one row for all of them
 * fails on the workspace lookup before it ever reaches the trend.
 */
function routedDb(overrides: { trend?: Row[] } = {}) {
  const statements: string[] = [];
  const db = {
    execute: async (query: unknown) => {
      const sql = JSON.stringify(query);
      statements.push(sql);
      const row = (value: Row) => ({ rows: [value], rowCount: 1 });
      if (sql.includes('from workspaces w')) {
        return row({ id: 'workspace-1', shop_domain: 'shop.myshopify.com', name: 'Shop', currency_code: 'INR', time_zone: 'America/New_York', role: 'owner' });
      }
      if (sql.includes('generate_series')) {
        return { rows: overrides.trend ?? [{ date: '2026-09-19', revenue: '1000' }], rowCount: 1 };
      }
      if (sql.includes('sum(total_price)')) {
        return row({ revenue: '7126.54' });
      }
      if (sql.includes('sum(total_price), 0)::text as revenue')) {
        return row({ revenue: '5000' });
      }
      if (sql.includes('avg(total_price)')) {
        return row({ revenue: '7126.54', average_order_value: '1781.635', order_count: '4', customer_count: '4', units: '10', subtotal: '6000', discounts: '0' });
      }
      if (sql.includes('linked_order_customer_rate')) {
        return row({ product_count: '2', product_media_count: '0', stock_count: '2', customer_count: '6', customer_media_count: '0', customer_email_count: '6', order_count: '4', linked_order_count: '4' });
      }
      return { rows: [], rowCount: 0 };
    },
  } as never;
  return { db, statements };
}

const range = {
  preset: '7d',
  from: new Date('2026-09-19T06:30:00Z'),
  to: new Date('2026-09-26T06:30:00Z'),
};

describe('overview trend window', () => {
  it('clips trend buckets to the same instants the headline metric uses', async () => {
    // Days are bucketed in the workspace timezone, so the first bucket begins at
    // New York midnight, which can be nearly 24 hours BEFORE range.from. Without
    // an explicit clip, an order in that sliver counts in the chart but not in
    // the revenue figure printed directly above it, so the app shows two
    // disagreeing numbers that each look right. The store's timezone is New
    // York, so this is not a theoretical edge case: seeding real orders made the
    // 7 day chart sum to 9498.17 against a stated revenue of 7126.54.
    const { db, statements } = routedDb();
    await getOverview(db, 'workspace-1', range, new Date('2026-09-26T06:30:00Z'), 'user-1');

    const trend = statements.find((statement) => statement.includes('generate_series'));
    expect(trend).toBeDefined();
    expect(trend).toContain('at time zone');

    const dayEquality = trend?.indexOf('::date = days.day') ?? -1;
    const windowClip = trend?.indexOf('>=') ?? -1;
    expect(dayEquality).toBeGreaterThan(-1);
    // The window predicate has to come after the day equality, inside the join,
    // or the clip is not applied to the orders being summed.
    expect(windowClip).toBeGreaterThan(dayEquality);
  });

  it('passes the same range bounds to the metric and the trend', async () => {
    const { db, statements } = routedDb();
    await getOverview(db, 'workspace-1', range, new Date('2026-09-26T06:30:00Z'), 'user-1');
    const metric = statements.find((statement) => statement.includes('avg(total_price)'));
    const trend = statements.find((statement) => statement.includes('generate_series'));
    expect(metric).toBeDefined();
    expect(trend).toBeDefined();
    // Both queries embed the same two instants, so neither can drift.
    for (const statement of [metric, trend]) {
      expect(statement).toContain('2026-09-19T06:30:00.000Z');
      expect(statement).toContain('2026-09-26T06:30:00.000Z');
    }
  });
});
