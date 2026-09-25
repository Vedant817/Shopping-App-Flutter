import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

export type OAuthState = {
  stateHash: string;
  workspaceId: string | null;
  userId: string | null;
  shopDomain: string;
  codeVerifierEncrypted: string;
  redirectUri: string;
  returnUrl: string;
  expiresAt: Date;
};

export async function createOAuthState(db: Database, input: Omit<OAuthState, 'stateHash'> & { stateHash: string }): Promise<void> {
  await db.execute(sql`
    insert into oauth_states (state_hash, workspace_id, user_id, shop_domain, code_verifier_encrypted, redirect_uri, return_url, expires_at)
    values (${input.stateHash}, ${input.workspaceId}, ${input.userId}, ${input.shopDomain}, ${input.codeVerifierEncrypted}, ${input.redirectUri}, ${input.returnUrl}, ${input.expiresAt})
  `);
}

export async function consumeOAuthState(db: Database, stateHash: string, now: Date): Promise<OAuthState | undefined> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      select state_hash, workspace_id, user_id, shop_domain, code_verifier_encrypted, redirect_uri, return_url, expires_at
      from oauth_states
      where state_hash = ${stateHash} and consumed_at is null and expires_at > ${now}
      for update
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return undefined;
    await tx.execute(sql`update oauth_states set consumed_at = ${now} where state_hash = ${stateHash}`);
    return {
      stateHash: String(row.state_hash),
      workspaceId: row.workspace_id === null || row.workspace_id === undefined ? null : String(row.workspace_id),
      userId: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
      shopDomain: String(row.shop_domain),
      codeVerifierEncrypted: String(row.code_verifier_encrypted),
      redirectUri: String(row.redirect_uri),
      returnUrl: String(row.return_url),
      expiresAt: new Date(String(row.expires_at)),
    };
  });
}
