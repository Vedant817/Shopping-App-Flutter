import { describe, expect, it } from 'vitest';
import { ShopifyGraphqlClient } from '../src/shopify/graphql-client.js';
import { fetchShopProfile } from '../src/shopify/profile.js';

function clientFor(shop: unknown, capture?: { query?: string }): ShopifyGraphqlClient {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    if (capture) capture.query = String(JSON.parse(String(init.body)).query);
    return new Response(JSON.stringify({ data: { shop } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return new ShopifyGraphqlClient({
    shopDomain: 'example-shop.myshopify.com',
    accessToken: 'shpat_token',
    apiVersion: '2026-07',
    minRequestIntervalMs: 0,
    fetchImpl,
  });
}

describe('shop profile', () => {
  it('requests ianaTimezone, not the removed timezone field', async () => {
    const capture: { query?: string } = {};
    await fetchShopProfile(clientFor({
      id: 'gid://shopify/Shop/1',
      name: 'Example',
      currencyCode: 'INR',
      ianaTimezone: 'Asia/Kolkata',
      primaryDomain: { url: 'https://example.com' },
    }, capture));

    expect(capture.query).toContain('ianaTimezone');
    expect(capture.query).not.toMatch(/\btimezone\b/);
  });

  it('maps the profile and keeps the primary domain', async () => {
    const profile = await fetchShopProfile(clientFor({
      id: 'gid://shopify/Shop/1',
      name: 'Example Store',
      currencyCode: 'USD',
      ianaTimezone: 'America/New_York',
      primaryDomain: { url: 'https://example-store.myshopify.com' },
    }));

    expect(profile).toEqual({
      id: 'gid://shopify/Shop/1',
      name: 'Example Store',
      currencyCode: 'USD',
      timeZone: 'America/New_York',
      primaryDomainUrl: 'https://example-store.myshopify.com',
    });
  });

  it('falls back to UTC when the store has no timezone configured', async () => {
    const profile = await fetchShopProfile(clientFor({
      id: 'gid://shopify/Shop/1',
      name: 'Example',
      currencyCode: 'USD',
      ianaTimezone: null,
    }));
    expect(profile.timeZone).toBe('UTC');
  });

  it('rejects a profile that is missing required fields', async () => {
    await expect(fetchShopProfile(clientFor({ id: 'gid://shopify/Shop/1' }))).rejects.toThrow(/incomplete/);
  });
});
