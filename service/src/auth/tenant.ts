import { and, eq, exists, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { workspaceMembers } from '../db/schema.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type WorkspaceCapabilities = {
  canEnqueueSync: boolean;
  canManageMembers: boolean;
  canChangeOwnerRoles?: true;
};

export function parseWorkspaceRole(value: unknown): WorkspaceRole {
  if (typeof value !== 'string' || !WORKSPACE_ROLES.includes(value as WorkspaceRole)) throw new Error('Invalid workspace role');
  return value as WorkspaceRole;
}

export function capabilitiesForRole(role: WorkspaceRole): WorkspaceCapabilities {
  const canManageMembers = role === 'owner' || role === 'admin';
  return {
    canEnqueueSync: canManageMembers,
    canManageMembers,
    ...(role === 'owner' ? { canChangeOwnerRoles: true as const } : {}),
  };
}

export type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

export function requireUserId(userId: string | undefined): string {
  if (!userId) throw unauthorized();
  return userId;
}

export async function requireWorkspaceMembership(
  db: Pick<Database, 'select'>,
  userId: string | undefined,
  workspaceId: string,
  allowedRoles?: readonly WorkspaceRole[],
): Promise<WorkspaceMembership> {
  const authenticatedUserId = requireUserId(userId);
  if (!workspaceId) throw forbidden('Workspace membership could not be established');
  const result = await db
    .select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId, role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, authenticatedUserId),
      exists(sql`
        (select 1
         from workspaces w
         join shopify_installations i on i.workspace_id = w.id
         where w.id = ${workspaceId}
           and w.uninstalled_at is null
           and i.uninstalled_at is null)
      `),
    ))
    .limit(1);
  const membership = result[0] as WorkspaceMembership | undefined;
  if (!membership) throw forbidden('You are not a member of this workspace');
  const role = parseWorkspaceRole(membership.role);
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw forbidden('Your workspace role cannot perform this operation');
  }
  return { ...membership, role };
}

export async function ensureAppUser(db: Pick<Database, 'execute'>, userId: string, email?: string): Promise<void> {
  await db.execute(sql`
    insert into app_users (id, email)
    values (${userId}, ${email ?? null})
    on conflict (id) do update set email = excluded.email, updated_at = now()
  `);
}
