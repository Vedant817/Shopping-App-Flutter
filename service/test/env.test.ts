import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORT: '3000',
    HOST: '127.0.0.1',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/threadline',
    DATABASE_SSL: 'false',
    SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
    SUPABASE_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    SHOPIFY_API_KEY: 'api-key',
    SHOPIFY_API_SECRET: 'api-secret',
    SHOPIFY_WEBHOOK_SECRET: 'webhook-secret',
    SHOPIFY_API_VERSION: '2026-01',
    SHOPIFY_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    SHOPIFY_SCOPES: 'read_products,read_orders',
    APP_BASE_URL: 'https://app.example.test',
    SHOPIFY_OAUTH_CALLBACK_URL: 'https://api.example.test/v1/auth/shopify/callback',
    SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL: 'threadline://shopify/install',
    CORS_ORIGIN: 'https://app.example.test',
    OAUTH_STATE_TTL_SECONDS: '600',
    OAUTH_CALLBACK_MAX_AGE_SECONDS: '300',
    INGESTION_POLL_INTERVAL_MS: '1000',
    INGESTION_STALE_LOCK_SECONDS: '300',
    INGESTION_MAX_ATTEMPTS: '5',
    INGESTION_BATCH_SIZE: '10',
    INGESTION_BACKOFF_BASE_SECONDS: '5',
    INGESTION_BACKOFF_MAX_SECONDS: '900',
    LOG_LEVEL: 'silent',
    TRUST_PROXY: 'false',
  };
}

describe('environment validation', () => {
  it('requires every security-sensitive value instead of applying defaults', () => {
    expect(() => loadConfig({})).toThrow(/Invalid environment configuration/);
    const env = validEnv();
    delete env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
    expect(() => loadConfig(env)).toThrow(/SHOPIFY_TOKEN_ENCRYPTION_KEY/);
  });

  it('parses a complete environment without secret defaults', () => {
    const config = loadConfig(validEnv());
    expect(config.shopifyApiVersion).toBe('2026-01');
    expect(config.corsOrigins).toEqual(['https://app.example.test']);
  });
});
