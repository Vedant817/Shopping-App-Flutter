import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { getInstallation, requireReauthorization, rotateInstallationTokens, type InstallationRecord } from '../db/operations.js';
import { decryptToken, encryptToken } from '../crypto/token-vault.js';
import { refreshOfflineAccessToken } from './oauth.js';

export class ShopifyReauthorizationRequiredError extends Error {
  constructor(readonly reason: string) {
    super('Shopify reauthorization is required');
    this.name = 'ShopifyReauthorizationRequiredError';
  }
}

export type ResolvedShopifyAccess = {
  accessToken: string;
  apiVersion: string;
  shopDomain: string;
  scopes: string[];
  refreshed: boolean;
};

export async function resolveShopifyAccess(input: {
  db: Database;
  config: AppConfig;
  workspaceId: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ResolvedShopifyAccess | undefined> {
  const now = input.now ?? new Date();
  const installation = await getInstallation(input.db, input.workspaceId);
  if (!installation) return undefined;
  return resolveFromInstallation({
    db: input.db,
    config: input.config,
    installation,
    workspaceId: input.workspaceId,
    fetchImpl: input.fetchImpl,
    now,
  });
}

async function resolveFromInstallation(input: {
  db: Database;
  config: AppConfig;
  installation: InstallationRecord;
  workspaceId: string;
  fetchImpl?: typeof fetch;
  now: Date;
}): Promise<ResolvedShopifyAccess> {
  const { config, installation } = input;
  if (installation.reauthorizeRequiredAt) throw new ShopifyReauthorizationRequiredError('refresh token is no longer valid');
  const accessToken = decryptToken(installation.encryptedOfflineToken, config.shopifyTokenEncryptionKey);
  const expiresAt = installation.accessTokenExpiresAt;
  if (!expiresAt) {
    return { accessToken, apiVersion: installation.apiVersion, shopDomain: installation.shopDomain, scopes: installation.scopes, refreshed: false };
  }
  const encryptedRefreshToken = installation.encryptedRefreshToken;
  const refreshToken = encryptedRefreshToken ? decryptToken(encryptedRefreshToken, config.shopifyTokenEncryptionKey) : null;
  const refreshTokenExpired = installation.refreshTokenExpiresAt !== null && installation.refreshTokenExpiresAt.getTime() <= input.now.getTime();
  if (!refreshToken || !encryptedRefreshToken || refreshTokenExpired) {
    await requireReauthorization(input.db, input.workspaceId, refreshTokenExpired ? 'refresh token expired' : 'no refresh token is stored for an expiring access token');
    throw new ShopifyReauthorizationRequiredError(refreshTokenExpired ? 'refresh token expired' : 'no refresh token is stored');
  }
  const leadMs = config.shopifyTokenRefreshLeadSeconds * 1000;
  if (expiresAt.getTime() - input.now.getTime() > leadMs) {
    return { accessToken, apiVersion: installation.apiVersion, shopDomain: installation.shopDomain, scopes: installation.scopes, refreshed: false };
  }
  return refreshInstallation({ ...input, installation, accessToken, refreshToken, expectedRefreshToken: encryptedRefreshToken });
}

async function refreshInstallation(input: {
  db: Database;
  config: AppConfig;
  installation: InstallationRecord;
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  expectedRefreshToken: string;
  fetchImpl?: typeof fetch;
  now: Date;
}): Promise<ResolvedShopifyAccess> {
  const outcome = await refreshOfflineAccessToken({
    shopDomain: input.installation.shopDomain,
    refreshToken: input.refreshToken,
    clientId: input.config.shopifyApiKey,
    clientSecret: input.config.shopifyApiSecret,
    fetchImpl: input.fetchImpl,
  });
  if (outcome.status === 'reauthorize') {
    await requireReauthorization(input.db, input.workspaceId, 'Shopify rejected the refresh token');
    throw new ShopifyReauthorizationRequiredError('Shopify rejected the refresh token');
  }
  if (outcome.status === 'retry') throw new Error('Shopify access token refresh could not reach Shopify');
  if (outcome.status === 'failed') throw new Error('Shopify rejected the access token refresh request');

  const token = outcome.token;
  const nextEncryptedRefreshToken = token.refreshToken
    ? encryptToken(token.refreshToken, input.config.shopifyTokenEncryptionKey)
    : input.expectedRefreshToken;
  const rotated = await rotateInstallationTokens(input.db, {
    workspaceId: input.workspaceId,
    expectedEncryptedRefreshToken: input.expectedRefreshToken,
    encryptedOfflineToken: encryptToken(token.accessToken, input.config.shopifyTokenEncryptionKey),
    encryptedRefreshToken: nextEncryptedRefreshToken,
    accessTokenExpiresAt: expiryFrom(token.expiresIn, input.now),
    refreshTokenExpiresAt: expiryFrom(token.refreshTokenExpiresIn, input.now),
    scopes: token.scopes.length > 0 ? token.scopes : undefined,
  });
  if (!rotated) {
    const current = await getInstallation(input.db, input.workspaceId);
    if (!current) throw new ShopifyReauthorizationRequiredError('installation was removed while refreshing');
    if (current.encryptedRefreshToken === input.expectedRefreshToken) throw new Error('Shopify access token refresh could not be stored');
    return resolveFromInstallation({ ...input, installation: current });
  }
  return {
    accessToken: token.accessToken,
    apiVersion: input.installation.apiVersion,
    shopDomain: input.installation.shopDomain,
    scopes: token.scopes.length > 0 ? token.scopes : input.installation.scopes,
    refreshed: true,
  };
}

function expiryFrom(seconds: number | undefined, now: Date): Date | null {
  return seconds === undefined ? null : new Date(now.getTime() + seconds * 1000);
}
