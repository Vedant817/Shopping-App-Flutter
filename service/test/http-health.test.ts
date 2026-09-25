import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/http/server.js';
import type { AppConfig } from '../src/config/env.js';

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
    shopifyApiKey: 'key',
    shopifyApiSecret: 'secret',
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

describe('HTTP health and webhook surface', () => {
  it('reports live without claiming dependency health', async () => {
    const app = await buildApp({ config: config(), db: { execute: async () => ({ rows: [] }) } as never });
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('alive');
    await app.close();
  });

  it('adopts a valid request id and exposes it through responses and CORS', async () => {
    const app = await buildApp({ config: config(), db: { execute: async () => ({ rows: [] }) } as never });
    const response = await app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'client-request-42' } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('client-request-42');
    const cors = await app.inject({ method: 'OPTIONS', url: '/health/live', headers: { origin: 'https://app.example.test', 'access-control-request-method': 'GET' } });
    expect(cors.headers['access-control-expose-headers']).toContain('x-request-id');
    await app.close();
  });

  it('rejects invalid request ids without reflecting them', async () => {
    const app = await buildApp({ config: config(), db: { execute: async () => ({ rows: [] }) } as never });
    const response = await app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'bad request id' } });
    expect(response.statusCode).toBe(400);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.body).not.toContain('bad request id');
    await app.close();
  });

  it('does not expose raw readiness errors publicly', async () => {
    const app = await buildApp({ config: config(), db: { execute: async () => { throw new Error('private database detail'); } } as never });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private database detail');
    await app.close();
  });

  it('rejects an invalid webhook HMAC as a client error', async () => {
    const app = await buildApp({ config: config(), db: { execute: async () => ({ rows: [] }) } as never });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/shopify',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': '0'.repeat(64),
        'x-shopify-webhook-id': 'webhook-1',
        'x-shopify-shop-domain': 'example-shop.myshopify.com',
        'x-shopify-topic': 'orders/create',
      },
      payload: '{}',
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });
});
