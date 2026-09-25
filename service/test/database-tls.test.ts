import { describe, expect, it } from 'vitest';
import { databasePoolConfig } from '../src/db/client.js';
import { loadConfig } from '../src/config/env.js';

describe('database TLS policy', () => {
  it('rejects an insecure production configuration', () => {
    expect(() => databasePoolConfig('postgresql://localhost/threadline', false, 'production')).toThrow(/DATABASE_SSL/);
  });

  it('allows explicit local opt-out only outside production', () => {
    expect(databasePoolConfig('postgresql://localhost/threadline', false, 'test').ssl).toBeUndefined();
    expect(databasePoolConfig('postgresql://localhost/threadline', false, 'development').ssl).toBeUndefined();
  });

  it('validates certificates when TLS is enabled', () => {
    expect(databasePoolConfig('postgresql://localhost/threadline', true, 'production').ssl).toEqual({ rejectUnauthorized: true });
  });

  it('rejects production environment loading with TLS disabled', () => {
    const env = {
      NODE_ENV: 'production',
      PORT: '3000',
      HOST: '127.0.0.1',
      DATABASE_URL: 'postgresql://localhost/threadline',
      DATABASE_SSL: 'false',
      SUPABASE_JWT_ISSUER: 'https://issuer.example.test',
      SUPABASE_JWKS_URL: 'https://issuer.example.test/jwks',
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      SHOPIFY_API_KEY: 'key',
      SHOPIFY_API_SECRET: 'secret',
      SHOPIFY_WEBHOOK_SECRET: 'hook',
      SHOPIFY_API_VERSION: '2026-01',
      SHOPIFY_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      SHOPIFY_SCOPES: 'read_products',
      APP_BASE_URL: 'https://app.example.test',
      SHOPIFY_OAUTH_CALLBACK_URL: 'https://api.example.test/callback',
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
    expect(() => loadConfig(env)).toThrow(/DATABASE_SSL/);
  });
});
