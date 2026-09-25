import { describe, expect, it } from 'vitest';
import { exchangeAuthorizationCode, oauthQueryHmac, verifyOAuthCallback, verifyOAuthQueryHmac } from '../src/shopify/oauth.js';

const secret = 'oauth-secret';
const now = new Date('2026-01-02T03:04:05.000Z');
const timestamp = String(Math.floor(now.getTime() / 1000));

describe('Shopify token exchange shop verification', () => {
  const base = {
    shopDomain: 'example-shop.myshopify.com',
    code: 'code-1',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://api.example.test/v1/auth/shopify/callback',
  };
  const respondWith = (payload: Record<string, unknown>) =>
    (async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  it('accepts a bare hostname, a full URL, and an absent shop field', async () => {
    for (const shop of ['example-shop.myshopify.com', 'https://example-shop.myshopify.com', undefined]) {
      const token = await exchangeAuthorizationCode({
        ...base,
        fetchImpl: respondWith({ access_token: 'shpat_x', scope: 'read_products', ...(shop === undefined ? {} : { shop }) }),
      });
      expect(token.accessToken).toBe('shpat_x');
    }
  });

  it('still rejects a response for a different shop', async () => {
    await expect(exchangeAuthorizationCode({
      ...base,
      fetchImpl: respondWith({ access_token: 'shpat_x', shop: 'other-shop.myshopify.com' }),
    })).rejects.toThrow(/unexpected shop \(other-shop\.myshopify\.com\)/);
  });

  it('surfaces Shopify error codes instead of a generic message', async () => {
    const failing = (async () => new Response(
      JSON.stringify({ error: 'invalid_request', error_description: 'The authorization code was not found or was already used' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
    await expect(exchangeAuthorizationCode({ ...base, fetchImpl: failing }))
      .rejects.toThrow(/400 invalid_request: The authorization code was not found or was already used/);
  });
});

function query() {
  return {
    code: 'authorization-code',
    shop: 'example-shop.myshopify.com',
    state: 'state-value',
    timestamp,
  };
}

describe('Shopify OAuth query HMAC', () => {
  it('matches the sorted query algorithm and verifies the callback', () => {
    const value = query();
    const hmac = oauthQueryHmac(value, secret);
    expect(hmac).toHaveLength(64);
    expect(verifyOAuthQueryHmac({ ...value, hmac }, secret)).toBe(true);
    expect(verifyOAuthCallback({ query: { ...value, hmac }, secret, now, maxAgeSeconds: 300 })).toMatchObject({
      code: value.code,
      shopDomain: value.shop,
      state: value.state,
    });
  });

  it('rejects tampering and stale callbacks', () => {
    const value = query();
    const hmac = oauthQueryHmac(value, secret);
    expect(verifyOAuthQueryHmac({ ...value, code: 'changed', hmac }, secret)).toBe(false);
    expect(() => verifyOAuthCallback({ query: { ...value, hmac }, secret, now: new Date('2026-01-02T03:20:05.000Z'), maxAgeSeconds: 300 })).toThrow(/timestamp/);
  });
});
