import 'dotenv/config';
import { z } from 'zod';

const requiredText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1),
);

const requiredInt = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().min(minimum).max(maximum),
  );

const optionalInt = (minimum: number, maximum: number, fallback: number) =>
  z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? fallback : value),
    z.coerce.number().int().min(minimum).max(maximum),
  );

const optionalBoolean = (fallback: boolean) => z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },
  z.boolean(),
);

const requiredBoolean = z.preprocess(
  (value) => {
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },
  z.boolean(),
);

const databaseUrl = requiredText.refine((value) => {
  try {
    return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'DATABASE_URL must be a PostgreSQL URL');

const encryptionKey = requiredText.refine((value) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64').length === 32;
}, 'SHOPIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');

const corsOrigin = requiredText.refine((value) => value.split(',').every((origin) => {
  try {
    return ['http:', 'https:'].includes(new URL(origin.trim()).protocol);
  } catch {
    return false;
  }
}), 'CORS_ORIGIN must contain valid HTTP origins');

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

const oauthCallbackUrl = (nodeEnv: string) => z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().refine((value) => {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === 'https:') return true;
    return nodeEnv !== 'production' && url.protocol === 'http:' && loopbackHosts.has(url.hostname);
  }, 'SHOPIFY_OAUTH_CALLBACK_URL must be an HTTPS URL without credentials or a fragment, and may only use plain HTTP on loopback outside production'),
);

const mobileReturnUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().refine((value) => {
    const url = new URL(value);
    return !['javascript:', 'data:', 'file:'].includes(url.protocol) && !url.username && !url.password && !url.hash;
  }, 'SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL must be a safe absolute URL'),
);

const configSchema = (nodeEnv: string) => z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: requiredInt(1, 65535),
  HOST: requiredText,
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: requiredBoolean,
  SUPABASE_JWT_ISSUER: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().url(),
  ),
  SUPABASE_JWKS_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().url(),
  ),
  SUPABASE_JWT_AUDIENCE: requiredText,
  SHOPIFY_API_KEY: requiredText,
  SHOPIFY_API_SECRET: requiredText,
  SHOPIFY_WEBHOOK_SECRET: requiredText,
  SHOPIFY_API_VERSION: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().regex(/^\d{4}-(01|04|07|10)$/),
  ),
  SHOPIFY_TOKEN_ENCRYPTION_KEY: encryptionKey,
  SHOPIFY_TOKEN_REFRESH_LEAD_SECONDS: optionalInt(60, 3600, 300),
  SHOPIFY_SCOPES: requiredText,
  APP_BASE_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().url(),
  ),
  SHOPIFY_OAUTH_CALLBACK_URL: oauthCallbackUrl(nodeEnv),
  SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL: mobileReturnUrl,
  CORS_ORIGIN: corsOrigin,
  OAUTH_STATE_TTL_SECONDS: optionalInt(60, 3600, 600),
  OAUTH_CALLBACK_MAX_AGE_SECONDS: optionalInt(60, 600, 300),
  INGESTION_POLL_INTERVAL_MS: optionalInt(100, 60000, 1000),
  INGESTION_STALE_LOCK_SECONDS: optionalInt(30, 86400, 300),
  INGESTION_MAX_ATTEMPTS: optionalInt(1, 20, 5),
  INGESTION_BATCH_SIZE: optionalInt(1, 100, 10),
  INGESTION_BACKOFF_BASE_SECONDS: optionalInt(1, 3600, 5),
  INGESTION_BACKOFF_MAX_SECONDS: optionalInt(1, 86400, 900),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: optionalBoolean(false),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string;
  databaseSsl: boolean;
  supabaseJwtIssuer: string;
  supabaseJwksUrl: string;
  supabaseJwtAudience: string;
  shopifyApiKey: string;
  shopifyApiSecret: string;
  shopifyWebhookSecret: string;
  shopifyApiVersion: string;
  shopifyTokenEncryptionKey: string;
  shopifyTokenRefreshLeadSeconds: number;
  shopifyScopes: string[];
  appBaseUrl: string;
  shopifyOauthCallbackUrl: string;
  shopifyMobilePostInstallReturnUrl: string;
  corsOrigins: string[];
  oauthStateTtlSeconds: number;
  oauthCallbackMaxAgeSeconds: number;
  ingestionPollIntervalMs: number;
  ingestionStaleLockSeconds: number;
  ingestionMaxAttempts: number;
  ingestionBatchSize: number;
  ingestionBackoffBaseSeconds: number;
  ingestionBackoffMaxSeconds: number;
  logLevel: string;
  trustProxy: boolean;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema(String(source.NODE_ENV ?? '')).safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV === 'production' && !value.DATABASE_SSL) throw new Error('Invalid environment configuration: DATABASE_SSL must be enabled in production');
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    host: value.HOST,
    databaseUrl: value.DATABASE_URL,
    databaseSsl: value.DATABASE_SSL,
    supabaseJwtIssuer: value.SUPABASE_JWT_ISSUER,
    supabaseJwksUrl: value.SUPABASE_JWKS_URL,
    supabaseJwtAudience: value.SUPABASE_JWT_AUDIENCE,
    shopifyApiKey: value.SHOPIFY_API_KEY,
    shopifyApiSecret: value.SHOPIFY_API_SECRET,
    shopifyWebhookSecret: value.SHOPIFY_WEBHOOK_SECRET,
    shopifyApiVersion: value.SHOPIFY_API_VERSION,
    shopifyTokenEncryptionKey: value.SHOPIFY_TOKEN_ENCRYPTION_KEY,
    shopifyTokenRefreshLeadSeconds: value.SHOPIFY_TOKEN_REFRESH_LEAD_SECONDS,
    shopifyScopes: value.SHOPIFY_SCOPES.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean),
    appBaseUrl: value.APP_BASE_URL.replace(/\/$/, ''),
    shopifyOauthCallbackUrl: value.SHOPIFY_OAUTH_CALLBACK_URL,
    shopifyMobilePostInstallReturnUrl: value.SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL,
    corsOrigins: value.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
    oauthStateTtlSeconds: value.OAUTH_STATE_TTL_SECONDS,
    oauthCallbackMaxAgeSeconds: value.OAUTH_CALLBACK_MAX_AGE_SECONDS,
    ingestionPollIntervalMs: value.INGESTION_POLL_INTERVAL_MS,
    ingestionStaleLockSeconds: value.INGESTION_STALE_LOCK_SECONDS,
    ingestionMaxAttempts: value.INGESTION_MAX_ATTEMPTS,
    ingestionBatchSize: value.INGESTION_BATCH_SIZE,
    ingestionBackoffBaseSeconds: value.INGESTION_BACKOFF_BASE_SECONDS,
    ingestionBackoffMaxSeconds: value.INGESTION_BACKOFF_MAX_SECONDS,
    logLevel: value.LOG_LEVEL,
    trustProxy: value.TRUST_PROXY,
  };
}
