import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type SupabaseJwtConfig = {
  issuer: string;
  jwksUrl: string;
  audience: string;
};

export type SupabaseUser = {
  id: string;
  email?: string;
  claims: JWTPayload;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(url: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(url);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, jwks);
  return jwks;
}

export async function verifySupabaseJwt(token: string, config: SupabaseJwtConfig): Promise<SupabaseUser> {
  if (!config.issuer || !config.jwksUrl || !config.audience) {
    throw new Error('Supabase JWT verification configuration is incomplete');
  }
  const result = await jwtVerify(token, getJwks(config.jwksUrl), {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
    clockTolerance: 5,
  });
  const subject = result.payload.sub;
  if (typeof subject !== 'string' || subject.trim() === '') {
    throw new Error('Supabase JWT subject is missing');
  }
  const email = typeof result.payload.email === 'string' ? result.payload.email : undefined;
  return { id: subject, email, claims: result.payload };
}

export function extractBearerToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1];
}
