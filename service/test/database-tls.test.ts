import { describe, expect, it } from 'vitest';
import { databasePoolConfig, readDatabaseCaCertificate } from '../src/db/client.js';
import { loadConfig } from '../src/config/env.js';

describe('database TLS policy', () => {
  it('rejects an insecure production configuration', () => {
    expect(() => databasePoolConfig('postgresql://localhost/threadline', false, 'production')).toThrow(/DATABASE_SSL/);
  });

  it('allows explicit local opt-out only outside production', () => {
    expect(databasePoolConfig('postgresql://localhost/threadline', false, 'test').ssl).toBeUndefined();
    expect(databasePoolConfig('postgresql://localhost/threadline', false, 'development').ssl).toBeUndefined();
  });

  it('verifies the server when a CA certificate is supplied', () => {
    expect(databasePoolConfig('postgresql://localhost/threadline', true, 'production', 'PEM').ssl).toEqual({
      rejectUnauthorized: true,
      ca: 'PEM',
    });
  });

  it('encrypts without verifying when no CA certificate is available', () => {
    // Supabase's proxies chain to a Supabase root CA that is not in the public
    // trust store, so verification fails unless that root is downloaded from
    // the Supabase dashboard and supplied. This matches sslmode=require, which
    // is the mode Supabase documents: encrypted, but the server is not
    // authenticated. Set DATABASE_CA_CERT_PATH to close the gap.
    expect(databasePoolConfig('postgresql://localhost/threadline', true, 'production').ssl).toEqual({
      rejectUnauthorized: false,
    });
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

  it('prefers an inline certificate over a file path', () => {
    // The deployed image contains only package files, drizzle and src, so a
    // certificate on disk is unreachable there. The inline form is the only one
    // that can work in the container, so it has to win when both are set.
    const previous = { inline: process.env.DATABASE_CA_CERT, path: process.env.DATABASE_CA_CERT_PATH };
    try {
      process.env.DATABASE_CA_CERT = 'INLINE-PEM';
      process.env.DATABASE_CA_CERT_PATH = 'does-not-exist.pem';
      expect(readDatabaseCaCertificate()).toBe('INLINE-PEM');
    } finally {
      if (previous.inline === undefined) delete process.env.DATABASE_CA_CERT;
      else process.env.DATABASE_CA_CERT = previous.inline;
      if (previous.path === undefined) delete process.env.DATABASE_CA_CERT_PATH;
      else process.env.DATABASE_CA_CERT_PATH = previous.path;
    }
  });

  it('restores newlines that a dashboard escaped', () => {
    const previous = process.env.DATABASE_CA_CERT;
    const previousPath = process.env.DATABASE_CA_CERT_PATH;
    try {
      delete process.env.DATABASE_CA_CERT_PATH;
      process.env.DATABASE_CA_CERT = '-----BEGIN CERTIFICATE-----\\nQUJD\\n-----END CERTIFICATE-----';
      expect(readDatabaseCaCertificate()).toBe('-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----');
    } finally {
      if (previous === undefined) delete process.env.DATABASE_CA_CERT;
      else process.env.DATABASE_CA_CERT = previous;
      if (previousPath !== undefined) process.env.DATABASE_CA_CERT_PATH = previousPath;
    }
  });

  it('ignores an empty certificate and falls back to the file path', () => {
    const previous = process.env.DATABASE_CA_CERT;
    try {
      process.env.DATABASE_CA_CERT = '   ';
      expect(readDatabaseCaCertificate()).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.DATABASE_CA_CERT;
      else process.env.DATABASE_CA_CERT = previous;
    }
  });
});