import { describe, expect, it } from 'vitest';
import { ShopifyApiError, ShopifyGraphqlClient } from '../src/shopify/graphql-client.js';

describe('Shopify GraphQL client', () => {
  it('follows cursor pagination and stops on the final page', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      const variables = body.variables as Record<string, unknown>;
      const second = variables.after === 'cursor-1';
      return new Response(JSON.stringify({ data: { products: { edges: [{ cursor: second ? 'cursor-2' : 'cursor-1', node: { id: second ? 'gid://2' : 'gid://1' } }], pageInfo: { hasNextPage: !second, endCursor: second ? 'cursor-2' : 'cursor-1' } } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new ShopifyGraphqlClient({ shopDomain: 'example-shop.myshopify.com', accessToken: 'offline-token', apiVersion: '2026-01', fetchImpl, minRequestIntervalMs: 0 });
    const result = await client.paginate<{ products: { edges: Array<{ cursor: string; node: unknown }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>('query', { first: 1 }, (data) => data.products);
    expect(result.map((entry) => entry.node)).toEqual([{ id: 'gid://1' }, { id: 'gid://2' }]);
    expect(result.at(-1)?.endCursor).toBe('cursor-2');
    expect(requests).toHaveLength(2);
  });

  it('exposes throttling and GraphQL error details', async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ errors: [{ message: 'throttled', extensions: { code: 'THROTTLED' } }], extensions: { cost: { throttleStatus: { currentlyAvailable: 10 } } } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
    const client = new ShopifyGraphqlClient({ shopDomain: 'example-shop.myshopify.com', accessToken: 'offline-token', apiVersion: '2026-01', fetchImpl, minRequestIntervalMs: 0, maxRetries: 0 });
    await expect(client.execute('query')).rejects.toMatchObject({ isThrottled: true, status: 429, retryAfterMs: 0 });
    try {
      await client.execute('query');
    } catch (error) {
      expect(error).toBeInstanceOf(ShopifyApiError);
      expect((error as ShopifyApiError).throttleStatus).toEqual({ currentlyAvailable: 10 });
    }
  });
});
