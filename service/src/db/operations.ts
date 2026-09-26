import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

export type WorkspaceInput = {
  id: string;
  shopDomain: string;
  name: string;
  currencyCode: string;
  timeZone: string;
  shopifyShopId?: string | null;
};

export type InstallationInput = {
  workspaceId: string;
  encryptedOfflineToken: string;
  encryptedRefreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scopes: string[];
  apiVersion: string;
};

export type InstallationRecord = {
  encryptedOfflineToken: string;
  encryptedRefreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  reauthorizeRequiredAt: Date | null;
  scopes: string[];
  apiVersion: string;
  shopDomain: string;
};

export async function upsertWorkspace(db: Database, input: WorkspaceInput): Promise<string> {
  const result = await db.execute(sql`
    insert into workspaces (id, shop_domain, name, currency_code, time_zone, shopify_shop_id)
    values (${input.id}, ${input.shopDomain}, ${input.name}, ${input.currencyCode}, ${input.timeZone}, ${input.shopifyShopId ?? null})
    on conflict (shop_domain) do update set
      name = excluded.name,
      currency_code = excluded.currency_code,
      time_zone = excluded.time_zone,
      shopify_shop_id = excluded.shopify_shop_id,
      updated_at = now()
    returning id
  `);
  const row = result.rows[0] as { id?: unknown } | undefined;
  if (row?.id === undefined) throw new Error('Workspace could not be persisted');
  return String(row.id);
}

export async function addWorkspaceMember(db: Database, workspaceId: string, userId: string, role = 'owner'): Promise<boolean> {
  assertWorkspaceRole(role);
  const result = await db.execute(sql`
    insert into workspace_members (workspace_id, user_id, role)
    values (${workspaceId}, ${userId}, ${role})
    on conflict (workspace_id, user_id) do nothing
    returning user_id
  `);
  return result.rows.length > 0;
}

export async function getWorkspaceMemberRole(db: Database, workspaceId: string, userId: string): Promise<string | undefined> {
  const result = await db.execute(sql`
    select role from workspace_members where workspace_id = ${workspaceId} and user_id = ${userId} limit 1
  `);
  const role = result.rows[0] as { role?: unknown } | undefined;
  return role?.role === null || role?.role === undefined ? undefined : String(role.role);
}

export type WorkspaceMemberRecord = {
  userId: string;
  role: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listWorkspaceMembers(db: Database, workspaceId: string): Promise<WorkspaceMemberRecord[]> {
  const result = await db.execute(sql`
    select m.user_id, m.role, u.email, m.created_at, m.updated_at
    from workspace_members m
    left join app_users u on u.id = m.user_id
    where m.workspace_id = ${workspaceId}
    order by m.created_at asc, m.user_id asc
  `);
  return result.rows.map((row) => {
    const value = row as Record<string, unknown>;
    return {
      userId: String(value.user_id),
      role: String(value.role),
      email: value.email === null || value.email === undefined ? null : String(value.email),
      createdAt: new Date(String(value.created_at)).toISOString(),
      updatedAt: new Date(String(value.updated_at)).toISOString(),
    };
  });
}

export type MembershipMutationResult = 'updated' | 'removed' | 'missing' | 'last_owner';

export async function updateWorkspaceMemberRole(db: Database, workspaceId: string, userId: string, role: string): Promise<MembershipMutationResult> {
  assertWorkspaceRole(role);
  return db.transaction(async (tx) => {
    const current = await tx.execute(sql`
      select role from workspace_members where workspace_id = ${workspaceId} and user_id = ${userId} for update
    `);
    const currentRole = current.rows[0] as { role?: unknown } | undefined;
    if (!currentRole) return 'missing';
    if (currentRole.role === 'owner' && role !== 'owner' && await countOwnersWithExecutor(tx, workspaceId) <= 1) return 'last_owner';
    await tx.execute(sql`
      update workspace_members set role = ${role}, updated_at = now()
      where workspace_id = ${workspaceId} and user_id = ${userId}
    `);
    return 'updated';
  });
}

export async function removeWorkspaceMember(db: Database, workspaceId: string, userId: string): Promise<MembershipMutationResult> {
  return db.transaction(async (tx) => {
    const current = await tx.execute(sql`
      select role from workspace_members where workspace_id = ${workspaceId} and user_id = ${userId} for update
    `);
    const currentRole = current.rows[0] as { role?: unknown } | undefined;
    if (!currentRole) return 'missing';
    if (currentRole.role === 'owner' && await countOwnersWithExecutor(tx, workspaceId) <= 1) return 'last_owner';
    await tx.execute(sql`delete from workspace_members where workspace_id = ${workspaceId} and user_id = ${userId}`);
    return 'removed';
  });
}

export async function countWorkspaceOwners(db: Database, workspaceId: string): Promise<number> {
  return countOwnersWithExecutor(db, workspaceId);
}

async function countOwnersWithExecutor(db: Pick<Database, 'execute'>, workspaceId: string): Promise<number> {
  const result = await db.execute(sql`
    select user_id from workspace_members where workspace_id = ${workspaceId} and role = 'owner' for update
  `);
  return result.rows.length;
}

export async function upsertInstallation(db: Database, input: InstallationInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into shopify_installations (workspace_id, encrypted_offline_token, encrypted_refresh_token, access_token_expires_at, refresh_token_expires_at, reauthorize_required_at, scopes, api_version)
      values (${input.workspaceId}, ${input.encryptedOfflineToken}, ${input.encryptedRefreshToken ?? null}, ${input.accessTokenExpiresAt ?? null}, ${input.refreshTokenExpiresAt ?? null}, null, ${textArrayLiteral(input.scopes)}::text[], ${input.apiVersion})
      on conflict (workspace_id) do update set
        encrypted_offline_token = excluded.encrypted_offline_token,
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        access_token_expires_at = excluded.access_token_expires_at,
        refresh_token_expires_at = excluded.refresh_token_expires_at,
        reauthorize_required_at = null,
        scopes = excluded.scopes,
        api_version = excluded.api_version,
        installed_at = now(), uninstalled_at = null, updated_at = now()
    `);
    await tx.execute(sql`update workspaces set uninstalled_at = null, updated_at = now() where id = ${input.workspaceId}`);
  });
}

export async function rotateInstallationTokens(db: Database, input: {
  workspaceId: string;
  expectedEncryptedRefreshToken: string;
  encryptedOfflineToken: string;
  encryptedRefreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scopes?: string[];
}): Promise<boolean> {
  const result = await db.execute(sql`
    update shopify_installations
    set encrypted_offline_token = ${input.encryptedOfflineToken},
        encrypted_refresh_token = ${input.encryptedRefreshToken},
        access_token_expires_at = ${input.accessTokenExpiresAt},
        refresh_token_expires_at = ${input.refreshTokenExpiresAt},
        reauthorize_required_at = null,
        scopes = coalesce(${input.scopes ? textArrayLiteral(input.scopes) : null}::text[], scopes),
        updated_at = now()
    where workspace_id = ${input.workspaceId}
      and encrypted_refresh_token = ${input.expectedEncryptedRefreshToken}
  `);
  return (result.rowCount ?? 0) > 0;
}

export async function requireReauthorization(db: Database, workspaceId: string, reason: string): Promise<void> {
  await db.execute(sql`
    update shopify_installations
    set encrypted_refresh_token = null, refresh_token_expires_at = null, reauthorize_required_at = now(), updated_at = now()
    where workspace_id = ${workspaceId}
  `);
  await recordAuditEvent(db, { workspaceId, action: 'shopify.reauthorization_required', resourceType: 'workspace', resourceId: workspaceId, metadata: { reason } });
}

export async function markWorkspaceUninstalled(db: Database, workspaceId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`update workspaces set uninstalled_at = now(), updated_at = now() where id = ${workspaceId}`);
    await tx.execute(sql`delete from shopify_installations where workspace_id = ${workspaceId}`);
    await tx.execute(sql`update ingestion_jobs set status = 'dead', last_error = 'shop uninstalled', locked_at = null, locked_by = null, updated_at = now() where workspace_id = ${workspaceId} and status in ('queued', 'running')`);
  });
}

/**
 * Removes OAuth state rows that can no longer be redeemed.
 *
 * A state row is only useful until it expires, and it holds the encrypted PKCE
 * verifier, so an abandoned install attempt would otherwise leave that secret
 * sitting in the table forever. Every install attempt writes one row, so a
 * merchant who abandons several consent screens grows the table without bound.
 * Consumed rows are removed on the same schedule once they can no longer be
 * replayed.
 *
 * Returns the number of rows deleted so callers can log when the sweep bites.
 */
export async function purgeExpiredOauthStates(db: Database, now: Date = new Date()): Promise<number> {
  const result = await db.execute(sql`
    delete from oauth_states
    where expires_at <= ${now}
       or (consumed_at is not null and consumed_at <= ${now})
  `);
  return result.rowCount ?? 0;
}

export async function purgeWorkspaceData(db: Database, workspaceId: string): Promise<void> {  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from cart_lines where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from carts where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from checkouts where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from order_lines where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from refunds where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from orders where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from product_variants where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from products where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from customers where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from custom_events where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from compliance_exports where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from ingestion_job_resources where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from ingestion_jobs where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from webhook_events where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from sync_runs where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from sync_cursors where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from oauth_states where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from workspace_members where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from shopify_installations where workspace_id = ${workspaceId}`);
    await tx.execute(sql`delete from workspaces where id = ${workspaceId}`);
  });
}

export async function getInstallation(db: Database, workspaceId: string): Promise<InstallationRecord | undefined> {
  const result = await db.execute(sql`
    select i.encrypted_offline_token, i.encrypted_refresh_token, i.access_token_expires_at, i.refresh_token_expires_at, i.reauthorize_required_at, i.scopes, i.api_version, w.shop_domain
    from shopify_installations i
    join workspaces w on w.id = i.workspace_id
    where i.workspace_id = ${workspaceId} and i.uninstalled_at is null and w.uninstalled_at is null
    limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    encryptedOfflineToken: String(row.encrypted_offline_token),
    encryptedRefreshToken: row.encrypted_refresh_token === null || row.encrypted_refresh_token === undefined ? null : String(row.encrypted_refresh_token),
    accessTokenExpiresAt: optionalDate(row.access_token_expires_at),
    refreshTokenExpiresAt: optionalDate(row.refresh_token_expires_at),
    reauthorizeRequiredAt: optionalDate(row.reauthorize_required_at),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    apiVersion: String(row.api_version),
    shopDomain: String(row.shop_domain),
  };
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function recordAuditEvent(db: Database, input: {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}): Promise<void> {
  await db.execute(sql`
    insert into audit_events (workspace_id, actor_user_id, action, resource_type, resource_id, metadata, request_id)
    values (${input.workspaceId ?? null}, ${input.actorUserId ?? null}, ${input.action}, ${input.resourceType}, ${input.resourceId ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb, ${input.requestId ?? null})
  `);
}

function assertWorkspaceRole(role: string): void {
  if (!['owner', 'admin', 'member', 'viewer'].includes(role)) throw new Error('Invalid workspace role');
}

function textArrayLiteral(values: string[]): string {
  return `{${values.map((value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;
}

export async function getWorkspace(db: Database, workspaceId: string): Promise<WorkspaceInput & { uninstalledAt: Date | null } | undefined> {
  const result = await db.execute(sql`
    select id, shop_domain, name, currency_code, time_zone, shopify_shop_id, uninstalled_at
    from workspaces where id = ${workspaceId} limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    id: String(row.id),
    shopDomain: String(row.shop_domain),
    name: String(row.name),
    currencyCode: String(row.currency_code),
    timeZone: String(row.time_zone),
    shopifyShopId: row.shopify_shop_id === null || row.shopify_shop_id === undefined ? null : String(row.shopify_shop_id),
    uninstalledAt: row.uninstalled_at ? new Date(String(row.uninstalled_at)) : null,
  };
}

export async function getWorkspaceByShopDomain(db: Database, shopDomain: string): Promise<(WorkspaceInput & { uninstalledAt: Date | null }) | undefined> {
  const result = await db.execute(sql`
    select id, shop_domain, name, currency_code, time_zone, shopify_shop_id, uninstalled_at
    from workspaces where shop_domain = ${shopDomain} limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    id: String(row.id),
    shopDomain: String(row.shop_domain),
    name: String(row.name),
    currencyCode: String(row.currency_code),
    timeZone: String(row.time_zone),
    shopifyShopId: row.shopify_shop_id === null || row.shopify_shop_id === undefined ? null : String(row.shopify_shop_id),
    uninstalledAt: row.uninstalled_at ? new Date(String(row.uninstalled_at)) : null,
  };
}
