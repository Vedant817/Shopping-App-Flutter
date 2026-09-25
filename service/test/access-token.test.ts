import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/env.js';
import { encryptToken } from '../src/crypto/token-vault.js';
import { resolveShopifyAccess, ShopifyReauthorizationRequiredError } from '../src/shopify/access-token.js';
import { exchangeAuthorizationCode, refreshOfflineAccessToken } from '../src/shopify/oauth.js';

const encryptionKey = randomBytes(32).toString('base64');
const now = new Date('2026-05-01T00:00:00.000Z');

function config(): AppConfig {
  return {
    nodeEnv: 'test',
    port: 3000,
    host: '127.0.0.1',
    databaseUrl: 'postgresql://user:pass@localhost:5432/threadline',
    databaseSsl: false,
    supabaseJwtIssuer: 'https://project.supabase.co/auth/v1',
    supabaseJwksUrl: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
    supabaseJwtAudience: 'authenticated',
    shopifyApiKey: 'client-id',
    shopifyApiSecret: 'client-secret',
    shopifyWebhookSecret: 'client-secret',
    shopifyApiVersion: '2026-07',
    shopifyTokenEncryptionKey: encryptionKey,
    shopifyTokenRefreshLeadSeconds: 300,
    shopifyScopes: ['read_products'],
    appBaseUrl: 'https://app.example.test',
    shopifyOauthCallbackUrl: 'https://app.example.test/v1/auth/shopify/callback',
    shopifyMobilePostInstallReturnUrl: 'https://app.example.test/installed',
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

type InstallationOverrides = {
  encryptedOfflineToken?: string;
  encryptedRefreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  reauthorizeRequiredAt?: Date | null;
};

function installationDb(overrides: InstallationOverrides, options: { rotateRowCount?: number; rowsAfterRotate?: Record<string, unknown>[] } = {}) {
  const statements: string[] = [];
  let reads = 0;
  const execute = async (query: unknown): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
    statements.push(JSON.stringify(query));
    reads += 1;
    if (reads === 1) {
      return {
        rows: [{
          encrypted_offline_token: overrides.encryptedOfflineToken ?? encryptToken('shpat_current', encryptionKey),
          encrypted_refresh_token: overrides.encryptedRefreshToken === undefined ? encryptToken('shpref_current', encryptionKey) : overrides.encryptedRefreshToken,
          access_token_expires_at: overrides.accessTokenExpiresAt === undefined ? new Date('2026-05-01T00:01:00.000Z') : overrides.accessTokenExpiresAt,
          refresh_token_expires_at: overrides.refreshTokenExpiresAt === undefined ? new Date('2026-07-01T00:00:00.000Z') : overrides.refreshTokenExpiresAt,
          reauthorize_required_at: overrides.reauthorizeRequiredAt ?? null,
          scopes: ['read_products'],
          api_version: '2026-07',
          shop_domain: 'threadline-test.myshopify.com',
        }],
        rowCount: 1,
      };
    }
    if (options.rotateRowCount !== undefined) return { rows: options.rowsAfterRotate ?? [], rowCount: options.rotateRowCount };
    return { rows: [], rowCount: 1 };
  };
  const db = { execute, transaction: async (callback: (tx: { execute: typeof execute }) => Promise<void>) => callback({ execute }) };
  return { db: db as never, statements };
}

function tokenResponse(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

describe('expiring offline access tokens', () => {
  it('requests an expiring token and reads the expiry fields', async () => {
    let sent: string | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = String(init.body);
      return new Response(JSON.stringify({
        access_token: 'shpat_new',
        scope: 'read_products,read_orders',
        shop: 'threadline-test.myshopify.com',
        expires_in: 3600,
        refresh_token: 'shpref_new',
        refresh_token_expires_in: 7776000,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const token = await exchangeAuthorizationCode({
      shopDomain: 'threadline-test.myshopify.com',
      code: 'code-1',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://app.example.test/v1/auth/shopify/callback',
      fetchImpl,
    });

    expect(sent).toContain('expiring=1');
    expect(token.refreshToken).toBe('shpref_new');
    expect(token.expiresIn).toBe(3600);
    expect(token.refreshTokenExpiresIn).toBe(7776000);
    expect(token.scopes).toEqual(['read_products', 'read_orders']);
  });

  it('treats a missing expiry as a non-expiring token', async () => {
    const token = await exchangeAuthorizationCode({
      shopDomain: 'threadline-test.myshopify.com',
      code: 'code-1',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://app.example.test/v1/auth/shopify/callback',
      fetchImpl: tokenResponse({ access_token: 'shpat_legacy', scope: 'read_products', shop: 'threadline-test.myshopify.com' }),
    });
    expect(token.expiresIn).toBeUndefined();
    expect(token.refreshToken).toBeUndefined();
  });

  it('classifies refresh failures as terminal, transient, and rejected', async () => {
    const base = { shopDomain: 'threadline-test.myshopify.com', refreshToken: 'shpref_current', clientId: 'client-id', clientSecret: 'client-secret' };
    expect((await refreshOfflineAccessToken({ ...base, fetchImpl: tokenResponse({ error: 'invalid_request' }, 401) })).status).toBe('reauthorize');
    expect((await refreshOfflineAccessToken({ ...base, fetchImpl: tokenResponse({}, 500) })).status).toBe('retry');
    expect((await refreshOfflineAccessToken({ ...base, fetchImpl: tokenResponse({}, 429) })).status).toBe('retry');
    expect((await refreshOfflineAccessToken({ ...base, fetchImpl: (async () => { throw new Error('network down'); }) as typeof fetch })).status).toBe('retry');
    expect((await refreshOfflineAccessToken({ ...base, fetchImpl: tokenResponse({ error: 'invalid_client' }, 403) })).status).toBe('failed');
  });

  it('rotates both tokens before the access token expires', async () => {
    const { db, statements } = installationDb({});
    const access = await resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: tokenResponse({
        access_token: 'shpat_refreshed',
        scope: 'read_products',
        shop: 'threadline-test.myshopify.com',
        expires_in: 3600,
        refresh_token: 'shpref_rotated',
        refresh_token_expires_in: 7776000,
      }),
    });

    expect(access?.refreshed).toBe(true);
    expect(access?.accessToken).toBe('shpat_refreshed');
    const rotation = statements.at(-1) ?? '';
    expect(rotation).toContain('update shopify_installations');
    expect(statements.join('')).not.toContain('shpat_refreshed');
  });

  it('keeps a still-valid access token without contacting Shopify', async () => {
    const { db, statements } = installationDb({ accessTokenExpiresAt: new Date('2026-05-01T00:30:00.000Z') });
    const access = await resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: (async () => { throw new Error('should not be called'); }) as typeof fetch,
    });
    expect(access?.refreshed).toBe(false);
    expect(access?.accessToken).toBe('shpat_current');
    expect(statements).toHaveLength(1);
  });

  it('passes through a non-expiring installation without a refresh token', async () => {
    const { db } = installationDb({ encryptedRefreshToken: null, accessTokenExpiresAt: null });
    const access = await resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: (async () => { throw new Error('should not be called'); }) as typeof fetch,
    });
    expect(access?.refreshed).toBe(false);
    expect(access?.accessToken).toBe('shpat_current');
  });

  it('requires reauthorization when Shopify rejects the refresh token', async () => {
    const { db, statements } = installationDb({});
    await expect(resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: tokenResponse({ error: 'invalid_request' }, 401),
    })).rejects.toBeInstanceOf(ShopifyReauthorizationRequiredError);
    expect(statements.join('')).toContain('reauthorize_required_at');
  });

  it('requires reauthorization when the refresh token has expired', async () => {
    const { db, statements } = installationDb({ refreshTokenExpiresAt: new Date('2026-04-01T00:00:00.000Z') });
    await expect(resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: (async () => { throw new Error('should not be called'); }) as typeof fetch,
    })).rejects.toBeInstanceOf(ShopifyReauthorizationRequiredError);
    expect(statements.join('')).toContain('reauthorize_required_at');
  });

  it('stops refreshing once the installation is flagged for reauthorization', async () => {
    const { db } = installationDb({ reauthorizeRequiredAt: new Date('2026-04-30T00:00:00.000Z'), accessTokenExpiresAt: null });
    await expect(resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: (async () => { throw new Error('should not be called'); }) as typeof fetch,
    })).rejects.toBeInstanceOf(ShopifyReauthorizationRequiredError);
  });

  it('reuses the winner when a concurrent refresh already rotated the tokens', async () => {
    const { db } = installationDb({}, {
      rotateRowCount: 0,
      rowsAfterRotate: [{
        encrypted_offline_token: encryptToken('shpat_from_other_worker', encryptionKey),
        encrypted_refresh_token: encryptToken('shpref_from_other_worker', encryptionKey),
        access_token_expires_at: new Date('2026-05-01T00:59:00.000Z'),
        refresh_token_expires_at: new Date('2026-07-01T00:00:00.000Z'),
        reauthorize_required_at: null,
        scopes: ['read_products'],
        api_version: '2026-07',
        shop_domain: 'threadline-test.myshopify.com',
      }],
    });
    const access = await resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: tokenResponse({
        access_token: 'shpat_loser',
        scope: 'read_products',
        shop: 'threadline-test.myshopify.com',
        expires_in: 3600,
        refresh_token: 'shpref_loser',
        refresh_token_expires_in: 7776000,
      }),
    });
    expect(access?.accessToken).toBe('shpat_from_other_worker');
    expect(access?.refreshed).toBe(false);
  });

  it('surfaces a transient refresh failure as a retryable error', async () => {
    const { db } = installationDb({});
    await expect(resolveShopifyAccess({
      db,
      config: config(),
      workspaceId: 'workspace-1',
      now,
      fetchImpl: tokenResponse({}, 503),
    })).rejects.toThrow(/could not reach Shopify/);
  });

  it('returns undefined when the workspace has no active installation', async () => {
    const db = { execute: async () => ({ rows: [] }) } as never;
    expect(await resolveShopifyAccess({ db, config: config(), workspaceId: 'workspace-1', now })).toBeUndefined();
  });
});
