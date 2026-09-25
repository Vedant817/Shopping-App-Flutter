import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseUser } from '../auth/supabase.js';
import { ensureAppUser } from '../auth/tenant.js';
import type { AppConfig } from '../config/env.js';
import { encryptToken } from '../crypto/token-vault.js';
import type { Database } from '../db/client.js';
import { getWorkspaceByShopDomain } from '../db/operations.js';
import { createOAuthState } from '../db/oauth-state.js';
import { normalizeMyshopifyDomain } from './domain.js';
import { buildShopifyAuthorizeUrl } from './oauth.js';

export type ShopifyInstallInput = {
  db: Database;
  config: AppConfig;
  user: SupabaseUser;
  shop: string;
  returnUrl: string;
  expectedReturnUrl?: string;
  now?: Date;
};

export type ShopifyInstallAuthorization = {
  authorizationUrl: string;
  shopDomain: string;
  returnUrl: string;
};

export async function createShopifyAuthorization(input: ShopifyInstallInput): Promise<ShopifyInstallAuthorization> {
  if (input.shop !== input.shop.trim() || input.shop !== input.shop.toLowerCase()) throw new Error('Invalid Shopify shop domain');
  const shopDomain = normalizeMyshopifyDomain(input.shop);
  if (!input.user.id) throw new Error('Authenticated user is required');
  if (input.expectedReturnUrl !== undefined && input.returnUrl !== input.expectedReturnUrl) {
    throw new Error('Post-install return URL is not configured');
  }
  const workspace = await getWorkspaceByShopDomain(input.db, shopDomain);
  await ensureAppUser(input.db, input.user.id, input.user.email);
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const now = input.now ?? new Date();
  await createOAuthState(input.db, {
    stateHash: createHash('sha256').update(state).digest('hex'),
    workspaceId: workspace?.id ?? null,
    userId: input.user.id,
    shopDomain,
    codeVerifierEncrypted: encryptToken(codeVerifier, input.config.shopifyTokenEncryptionKey),
    redirectUri: input.config.shopifyOauthCallbackUrl,
    returnUrl: input.returnUrl,
    expiresAt: new Date(now.getTime() + input.config.oauthStateTtlSeconds * 1000),
  });
  return {
    authorizationUrl: buildShopifyAuthorizeUrl({
      shopDomain,
      clientId: input.config.shopifyApiKey,
      redirectUri: input.config.shopifyOauthCallbackUrl,
      state,
      scopes: input.config.shopifyScopes,
    }),
    shopDomain,
    returnUrl: input.returnUrl,
  };
}

export function postInstallReturnUrl(baseUrl: string, workspaceId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('workspace', workspaceId);
  url.searchParams.set('installed', '1');
  return url.toString();
}
