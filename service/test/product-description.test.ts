import { describe, expect, it } from 'vitest';
import { upsertProduct } from '../src/db/upserts.js';

describe('product description safety', () => {
  it('stores sanitized plain text instead of raw HTML or script content', async () => {
    const statements: unknown[] = [];
    const db = {
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({
        execute: async (query: unknown) => { statements.push(query); return { rows: [] }; },
      }),
    };
    await upsertProduct(db as never, 'workspace-1', {
      id: 'gid://shopify/Product/1',
      title: 'Safe product',
      status: 'ACTIVE',
      tags: [],
      descriptionHtml: '<p>Hello <strong>world</strong></p><script>alert(1)</script><img src=x onerror=alert(2)>',
    });
    const serialized = JSON.stringify(statements);
    expect(serialized).toContain('Hello world');
    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('onerror');
  });
});
