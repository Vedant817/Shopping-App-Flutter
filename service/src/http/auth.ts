import type { FastifyRequest } from 'fastify';
import { extractBearerToken, verifySupabaseJwt, type SupabaseUser } from '../auth/supabase.js';
import type { AppConfig } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';

export type RequestWithAuth = FastifyRequest & { authUser?: SupabaseUser | null };

export async function authenticateOptional(request: FastifyRequest, config: AppConfig): Promise<SupabaseUser | undefined> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) return undefined;
  const user = await verifySupabaseJwt(token, {
    issuer: config.supabaseJwtIssuer,
    jwksUrl: config.supabaseJwksUrl,
    audience: config.supabaseJwtAudience,
  });
  (request as RequestWithAuth).authUser = user;
  return user;
}

export function requireAuth(request: FastifyRequest): SupabaseUser {
  const user = (request as RequestWithAuth).authUser;
  if (!user) throw unauthorized();
  return user;
}
