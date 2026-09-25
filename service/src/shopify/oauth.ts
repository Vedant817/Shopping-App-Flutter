import { createHash, timingSafeEqual } from 'node:crypto';
import { hmacSha256 } from '../utils/hmac.js';
import { normalizeMyshopifyDomain } from './domain.js';

export type OAuthQuery = Record<string, string | string[] | undefined>;

const tokenRequestTimeoutMs = 30_000;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withoutSignature(query: OAuthQuery): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(query)) {
    if (key === 'hmac' || key === 'signature') continue;
    const value = firstValue(raw);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function oauthQueryHmac(query: OAuthQuery, secret: string): string {
  const canonical = Object.entries(withoutSignature(query))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return hmacSha256(canonical, secret).toString('hex');
}

export function verifyOAuthQueryHmac(query: OAuthQuery, secret: string): boolean {
  const provided = firstValue(query.hmac);
  if (!provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = Buffer.from(oauthQueryHmac(query, secret), 'hex');
  const actual = Buffer.from(provided, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyOAuthCallback(options: {
  query: OAuthQuery;
  secret: string;
  now?: Date;
  maxAgeSeconds: number;
}): { code: string; shopDomain: string; state: string; timestamp: number } {
  const now = options.now ?? new Date();
  const code = firstValue(options.query.code);
  const state = firstValue(options.query.state);
  const shop = firstValue(options.query.shop);
  const timestampValue = firstValue(options.query.timestamp);
  if (!code || !state || !shop || !timestampValue || !/^\d+$/.test(timestampValue)) {
    throw new Error('OAuth callback is missing required parameters');
  }
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > options.maxAgeSeconds) {
    throw new Error('OAuth callback timestamp is outside the allowed window');
  }
  const shopDomain = normalizeMyshopifyDomain(shop);
  if (!verifyOAuthQueryHmac(options.query, options.secret)) throw new Error('OAuth callback HMAC is invalid');
  return { code, shopDomain, state, timestamp };
}

export function pkceCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

export function buildShopifyAuthorizeUrl(options: {
  shopDomain: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: readonly string[];
  codeChallenge?: string;
}): string {
  const shopDomain = normalizeMyshopifyDomain(options.shopDomain);
  const url = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('scope', options.scopes.join(','));
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('state', options.state);
  if (options.codeChallenge) {
    url.searchParams.set('code_challenge', options.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

export type ShopifyTokenResponse = {
  accessToken: string;
  scopes: string[];
  shopDomain: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
};

export type ShopifyTokenRefreshOutcome =
  | { status: 'refreshed'; token: ShopifyTokenResponse }
  | { status: 'reauthorize' }
  | { status: 'retry' }
  | { status: 'failed' };

export async function exchangeAuthorizationCode(options: {
  shopDomain: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier?: string;
  fetchImpl?: typeof fetch;
}): Promise<ShopifyTokenResponse> {
  const shopDomain = normalizeMyshopifyDomain(options.shopDomain);
  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code,
    redirect_uri: options.redirectUri,
    grant_type: 'authorization_code',
    expiring: '1',
  });
  if (options.codeVerifier) body.set('code_verifier', options.codeVerifier);
  const response = await (options.fetchImpl ?? fetch)(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload) || typeof payload.access_token !== 'string') {
    // Shopify explains the rejection in the body; discarding it turns a precise
    // diagnosis into a generic "exchange failed".
    const detail = isRecord(payload)
      ? [optionalToken(payload.error), optionalToken(payload.error_description)].filter(Boolean).join(': ')
      : '';
    throw new Error(`Shopify OAuth token exchange failed (${response.status}${detail ? ` ${detail}` : ''})`);
  }
  if (typeof payload.shop !== 'string' || normalizeMyshopifyDomain(payload.shop) !== shopDomain) {
    throw new Error('Shopify OAuth returned an unexpected shop');
  }
  const rawScopes = typeof payload.scope === 'string' ? payload.scope : '';
  return {
    accessToken: payload.access_token,
    scopes: rawScopes.split(',').map((scope) => scope.trim()).filter(Boolean),
    shopDomain,
    refreshToken: optionalToken(payload.refresh_token),
    expiresIn: optionalPositiveSeconds(payload.expires_in),
    refreshTokenExpiresIn: optionalPositiveSeconds(payload.refresh_token_expires_in),
  };
}

export async function refreshOfflineAccessToken(options: {
  shopDomain: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<ShopifyTokenRefreshOutcome> {
  const shopDomain = normalizeMyshopifyDomain(options.shopDomain);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: options.refreshToken,
      }),
      signal: AbortSignal.timeout(tokenRequestTimeoutMs),
    });
  } catch {
    return { status: 'retry' };
  }
  if (response.status === 401) return { status: 'reauthorize' };
  if (response.status === 429 || response.status >= 500) return { status: 'retry' };
  const payload = await readJson(response);
  if (!response.ok || !isRecord(payload) || typeof payload.access_token !== 'string') {
    return { status: 'failed' };
  }
  return {
    status: 'refreshed',
    token: {
      accessToken: payload.access_token,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(',').map((scope) => scope.trim()).filter(Boolean) : [],
      shopDomain,
      refreshToken: optionalToken(payload.refresh_token),
      expiresIn: optionalPositiveSeconds(payload.expires_in),
      refreshTokenExpiresIn: optionalPositiveSeconds(payload.refresh_token_expires_in),
    },
  };
}

function optionalToken(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalPositiveSeconds(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
