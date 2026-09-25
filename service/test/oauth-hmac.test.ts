import { describe, expect, it } from 'vitest';
import { oauthQueryHmac, verifyOAuthCallback, verifyOAuthQueryHmac } from '../src/shopify/oauth.js';

const secret = 'oauth-secret';
const now = new Date('2026-01-02T03:04:05.000Z');
const timestamp = String(Math.floor(now.getTime() / 1000));

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
