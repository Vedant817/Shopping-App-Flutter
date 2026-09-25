import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/env.js';
import { decryptToken } from '../src/crypto/token-vault.js';
import { createShopifyAuthorization, postInstallReturnUrl } from '../src/shopify/install.js';
import { pkceCodeChallenge } from '../src/shopify/oauth.js';

function config(): AppConfig {
  return {
    nodeEnv: 'test',
    port: 3000,
    host: '127.0.0.1',
    databaseUrl: 'postgresql://localhost/threadline',
    databaseSsl: false,
    supabaseJwtIssuer: 'https://issuer.example.test',
    supabaseJwksUrl: 'https://issuer.example.test/jwks',
    supabaseJwtAudience: 'authenticated',
    shopifyApiKey: 'client-key',
    shopifyApiSecret: 'client-secret',
    shopifyWebhookSecret: 'webhook-secret',
    shopifyApiVersion: '2026-01',
    shopifyTokenEncryptionKey: randomBytes(32).toString('base64'),
    shopifyTokenRefreshLeadSeconds: 300,
    shopifyScopes: ['read_products'],
    appBaseUrl: 'https://app.example.test',
    shopifyOauthCallbackUrl: 'https://api.example.test/v1/auth/shopify/callback',
    shopifyMobilePostInstallReturnUrl: 'threadline://shopify/install',
    corsOrigins: ['https://app.example.test'],
    oauthStateTtlSeconds: 600,
    oauthCallbackMaxAgeSeconds: 300,
    ingestionPollIntervalMs: 1000,
    ingestionStaleLockSeconds: 300,
    ingestionMaxAttempts: 5,
    ingestionBatchSize: 10,
    ingestionBackoffBaseSeconds: 5,
    ingestionBackoffMaxSeconds: 900,
    logLevel: 'silent',
    trustProxy: false,
  };
}

describe('mobile Shopify install', () => {
  it('binds OAuth state to the authenticated user and configured destinations', async () => {
    const statements: unknown[] = [];
    const db = { execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } };
    const result = await createShopifyAuthorization({
      db: db as never,
      config: config(),
      user: { id: 'user-1', claims: { sub: 'user-1' } },
      shop: 'example-shop.myshopify.com',
      returnUrl: 'threadline://shopify/install',
      expectedReturnUrl: 'threadline://shopify/install',
      now: new Date('2026-01-02T03:04:05.000Z'),
    });
    const serialized = JSON.stringify(statements);
    expect(serialized).toContain('user-1');
    expect(serialized).toContain('threadline://shopify/install');
    const url = new URL(result.authorizationUrl);
    expect(url.hostname).toBe('example-shop.myshopify.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.test/v1/auth/shopify/callback');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('registers a PKCE challenge that matches the stored verifier', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => { statements.push(query); return { rows: [] }; },
    };
    const cfg = config();
    const result = await createShopifyAuthorization({
      db: db as never,
      config: cfg,
      user: { id: 'user-1', claims: {} },
      shop: 'example-shop.myshopify.com',
      returnUrl: 'threadline://shopify/install',
    });

    const url = new URL(result.authorizationUrl);
    const challenge = url.searchParams.get('code_challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(challenge).toBeTruthy();

    const insert = statements.find((entry) => JSON.stringify(entry).includes('oauth_states'));
    const envelope = /v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.exec(JSON.stringify(insert))?.[0];
    expect(envelope).toBeTruthy();
    const verifier = decryptToken(envelope!, cfg.shopifyTokenEncryptionKey);
    expect(pkceCodeChallenge(verifier)).toBe(challenge);
  });

  it('rejects arbitrary return URLs and non-domain shop values', async () => {
    await expect(createShopifyAuthorization({
      db: { execute: async () => ({ rows: [] }) } as never,
      config: config(),
      user: { id: 'user-1', claims: { sub: 'user-1' } },
      shop: 'example-shop.myshopify.com',
      returnUrl: 'https://attacker.example/callback',
      expectedReturnUrl: 'threadline://shopify/install',
    })).rejects.toThrow(/return URL/);
    await expect(createShopifyAuthorization({
      db: { execute: async () => ({ rows: [] }) } as never,
      config: config(),
      user: { id: 'user-1', claims: { sub: 'user-1' } },
      shop: 'https://example-shop.myshopify.com',
      returnUrl: 'threadline://shopify/install',
      expectedReturnUrl: 'threadline://shopify/install',
    })).rejects.toThrow(/shop domain/i);
    await expect(createShopifyAuthorization({
      db: { execute: async () => ({ rows: [] }) } as never,
      config: config(),
      user: { id: 'user-1', claims: { sub: 'user-1' } },
      shop: 'EXAMPLE-SHOP.myshopify.com',
      returnUrl: 'threadline://shopify/install',
      expectedReturnUrl: 'threadline://shopify/install',
    })).rejects.toThrow(/shop domain/i);
  });

  it('adds install metadata only to the configured return destination', () => {
    expect(postInstallReturnUrl('threadline://shopify/install', 'workspace-1')).toBe('threadline://shopify/install?workspace=workspace-1&installed=1');
  });
});
