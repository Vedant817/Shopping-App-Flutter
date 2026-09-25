import { describe, expect, it } from 'vitest';
import { ShopifyGraphqlClient } from '../src/shopify/graphql-client.js';
import { buildSyncVariables, commitSyncPage, completeSyncState, fetchCompleteProductVariants, nextSyncWatermark, runSyncResource, saveSyncCursor } from '../src/shopify/sync.js';

describe('Shopify cursor resume and advance', () => {
  it('starts Shopify pagination from the stored cursor', async () => {
    const requested: Array<string | null> = [];
    const committed: Array<string | null> = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { variables: { after?: string | null } };
      const after = body.variables.after ?? null;
      requested.push(after);
      const second = after === 'cursor-1';
      return new Response(JSON.stringify({ data: { products: { edges: [{ cursor: second ? 'edge-2' : 'edge-1', node: { id: second ? 'gid-2' : 'gid-1' } }], pageInfo: { hasNextPage: !second, endCursor: second ? 'cursor-2' : 'cursor-1' } } } }), { status: 200 });
    };
    const client = new ShopifyGraphqlClient({ shopDomain: 'example-shop.myshopify.com', accessToken: 'token', apiVersion: '2026-01', fetchImpl, minRequestIntervalMs: 0 });
    await client.forEachPage('query', { first: 1, after: 'stored-cursor' }, (data) => (data as { products: { edges: Array<{ cursor: string; node: unknown }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).products, async (page) => {
      committed.push(page.endCursor);
    });
    expect(requested).toEqual(['stored-cursor', 'cursor-1']);
    expect(committed).toEqual(['cursor-1', 'cursor-2']);
  });

  it('commits page upserts before the cursor in one transaction', async () => {
    const events: string[] = [];
    const statements: unknown[] = [];
    const db = {
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({
        execute: async (query: unknown) => { events.push('sql'); statements.push(query); return { rows: [] }; },
      }),
    };
    await commitSyncPage(db as never, {
      runId: 'run-1',
      workspaceId: 'workspace-1',
      resource: 'products',
      cursor: 'cursor-2',
      count: 2,
      nodes: [{ id: 'gid-1' }, { id: 'gid-2' }],
    }, async (_executor, _workspaceId, node) => { events.push(`upsert:${String((node as { id: string }).id)}`); return String((node as { id: string }).id); });
    expect(events.slice(0, 2)).toEqual(['upsert:gid-1', 'upsert:gid-2']);
    expect(events.slice(2)).toEqual(['sql', 'sql']);
    expect(JSON.stringify(statements)).toContain('cursor-2');
  });

  it('does not advance the cursor when a page upsert fails', async () => {
    const events: string[] = [];
    const db = {
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({
        execute: async () => { events.push('sql'); return { rows: [] }; },
      }),
    };
    await expect(commitSyncPage(db as never, {
      runId: 'run-1',
      workspaceId: 'workspace-1',
      resource: 'products',
      cursor: 'cursor-2',
      count: 1,
      nodes: [{ id: 'gid-1' }],
    }, async () => { events.push('upsert'); throw new Error('upsert failed'); })).rejects.toThrow('upsert failed');
    expect(events).toEqual(['upsert']);
  });

  it('resumes an interrupted initial pagination from its stored cursor', async () => {
    const requested: Array<Record<string, unknown>> = [];
    const statements: unknown[] = [];
    const db = lifecycleDb({ cursor: 'cursor-1', watermark_at: null }, statements);
    const client = lifecycleClient(requested, [{ id: 'gid://shopify/Customer/2', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }]);
    await runSyncResource(db as never, {} as never, 'workspace-1', 'customers', { client: client as never, now: () => new Date('2026-01-02T03:04:05Z') });
    expect(requested[0]).toMatchObject({ after: 'cursor-1', query: null });
    expect(JSON.stringify(statements)).toContain('cursor = null');
  });

  it('clears a terminal cursor and persists a safe watermark after a full sync', async () => {
    const requested: Array<Record<string, unknown>> = [];
    const statements: unknown[] = [];
    const db = lifecycleDb({ cursor: null, watermark_at: null }, statements);
    const client = lifecycleClient(requested, []);
    const result = await runSyncResource(db as never, {} as never, 'workspace-1', 'customers', { client: client as never, now: () => new Date('2026-01-02T03:04:05Z') });
    expect(requested[0]?.query).toBeNull();
    expect(result.cursor).toBeNull();
    expect(result.watermark.toISOString()).toBe('2026-01-02T02:59:05.000Z');
    expect(JSON.stringify(statements)).toContain('watermark_at');
  });

  it('discovers subsequent updates with the stored watermark', async () => {
    const requested: Array<Record<string, unknown>> = [];
    const statements: unknown[] = [];
    const db = lifecycleDb({ cursor: null, watermark_at: '2026-01-01T00:00:00.000Z' }, statements);
    const client = lifecycleClient(requested, []);
    await runSyncResource(db as never, {} as never, 'workspace-1', 'customers', { client: client as never, now: () => new Date('2026-01-02T03:04:05Z') });
    expect(requested[0]?.after).toBeNull();
    expect(requested[0]?.query).toBe('updated_at:>=2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(statements)).toContain('cursor = null');
  });

  it('handles an empty incremental result set', () => {
    expect(buildSyncVariables({ cursor: null, watermarkAt: new Date('2026-01-01T00:00:00.000Z') }).query).toContain('updated_at:>=');
    expect(nextSyncWatermark(new Date('2026-01-02T00:00:00.000Z'), null).toISOString()).toBe('2026-01-01T23:55:00.000Z');
  });

  it('does not advance last successful sync time for progress writes', async () => {
    const statements: unknown[] = [];
    await saveSyncCursor({ execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } } as never, 'workspace-1', 'orders', 'cursor-2');
    expect(JSON.stringify(statements)).not.toContain('last_synced_at');
  });

  it('does not advance last successful sync time when a resource fails', async () => {
    const statements: unknown[] = [];
    let reads = 0;
    const db = {
      execute: async (query: unknown) => {
        statements.push(query);
        reads += 1;
        if (reads === 1) return { rows: [{ cursor: null, watermark_at: null }] };
        if (reads === 2) return { rows: [{ id: 'run-1' }] };
        return { rows: [] };
      },
    };
    const client = { forEachPage: async () => { throw new Error('provider failed'); } };
    await expect(runSyncResource(db as never, {} as never, 'workspace-1', 'orders', { client: client as never })).rejects.toThrow('provider failed');
    expect(JSON.stringify(statements)).not.toContain('last_synced_at');
  });

  it('updates last successful sync time only in the terminal completion transaction', async () => {
    const statements: unknown[] = [];
    const db = { transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } }) };
    await completeSyncState(db as never, { workspaceId: 'workspace-1', resource: 'orders', runId: 'run-1', count: 1, watermark: new Date('2026-01-02T00:00:00Z') });
    expect(JSON.stringify(statements)).toContain('last_synced_at');
  });

  it('fetches all variant pages instead of treating the first page as complete', async () => {
    const requested: Array<Record<string, unknown>> = [];
    const client = {
      forEachPage: async (_query: string, variables: Record<string, unknown>, _select: unknown, onPage: (page: { nodes: unknown[]; endCursor: string | null; hasNextPage: boolean }) => Promise<void>) => {
        const first = variables.after === null;
        requested.push({ ...variables, after: first ? null : 'variant-cursor' });
        await onPage({ nodes: Array.from({ length: first ? 100 : 1 }, (_, index) => ({ id: `variant-${first ? index : 100}` })), endCursor: first ? 'variant-cursor' : null, hasNextPage: first });
        if (first) {
          requested.push({ ...variables, after: 'variant-cursor' });
          await onPage({ nodes: [{ id: 'variant-100' }], endCursor: null, hasNextPage: false });
        }
      },
    };
    const variants = await fetchCompleteProductVariants(client as never, 'gid://shopify/Product/1');
    expect(variants).toHaveLength(101);
    expect(requested[0]).toMatchObject({ productId: 'gid://shopify/Product/1', first: 100, after: null });
    expect(requested[1]).toMatchObject({ after: 'variant-cursor' });
  });
});

function lifecycleDb(state: Record<string, unknown>, statements: unknown[]) {
  let reads = 0;
  const execute = async (query: unknown) => {
    statements.push(query);
    reads += 1;
    if (reads === 1) return { rows: [state] };
    if (reads === 2) return { rows: [{ id: 'run-1' }] };
    return { rows: [] };
  };
  return { execute, transaction: async (callback: (tx: { execute: typeof execute }) => Promise<void>) => callback({ execute }) };
}

function lifecycleClient(requested: Array<Record<string, unknown>>, nodes: unknown[]) {
  return {
    forEachPage: async (_query: string, variables: Record<string, unknown>, _select: unknown, onPage: (page: { nodes: unknown[]; endCursor: string | null; hasNextPage: boolean }) => Promise<void>) => {
      requested.push(variables);
      await onPage({ nodes, endCursor: null, hasNextPage: false });
    },
  };
}