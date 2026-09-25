import { describe, expect, it } from 'vitest';
import { capabilitiesForRole, parseWorkspaceRole, type WorkspaceRole } from '../src/auth/tenant.js';
import { getOverview, getWorkspaceDto, listWorkspaces } from '../src/api/queries.js';

const roles: WorkspaceRole[] = ['owner', 'admin', 'member', 'viewer'];

function workspaceRow(role: WorkspaceRole) {
  return {
    id: 'workspace-1',
    shop_domain: 'example-shop.myshopify.com',
    name: 'Example shop',
    currency_code: 'USD',
    time_zone: 'UTC',
    role,
  };
}

function expectedCapabilities(role: WorkspaceRole) {
  return {
    canEnqueueSync: role === 'owner' || role === 'admin',
    canManageMembers: role === 'owner' || role === 'admin',
    ...(role === 'owner' ? { canChangeOwnerRoles: true } : {}),
  };
}

describe('workspace capability contract', () => {
  it.each(roles)('derives %s capabilities only from the verified membership row', async (role) => {
    const row = workspaceRow(role);
    const statements: unknown[] = [];
    const db = { execute: async (query: unknown) => { statements.push(query); return { rows: [row] }; } };
    const listed = await listWorkspaces(db as never, 'caller-1');
    const detail = await getWorkspaceDto(db as never, 'workspace-1', 'caller-1');
    expect(capabilitiesForRole(role)).toEqual(expectedCapabilities(role));
    expect(listed[0]).toMatchObject({ id: 'workspace-1', role, capabilities: expectedCapabilities(role) });
    expect(detail).toMatchObject({ id: 'workspace-1', role, capabilities: expectedCapabilities(role) });
    expect(JSON.stringify(statements)).toContain('shopify_installations');
    expect(JSON.stringify(statements)).toContain('m.user_id');
    expect(JSON.stringify(statements)).toContain('uninstalled_at');
  });

  it('preserves the verified caller role in overview workspace payloads', async () => {
    let first = true;
    const db = {
      execute: async () => {
        if (first) {
          first = false;
          return { rows: [workspaceRow('viewer')] };
        }
        return { rows: [] };
      },
    };
    const overview = await getOverview(db as never, 'workspace-1', { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-02-01T00:00:00Z'), preset: 'custom' }, new Date('2026-02-01T00:00:00Z'), 'caller-1');
    expect(overview?.workspace).toMatchObject({ role: 'viewer', capabilities: expectedCapabilities('viewer') });
  });

  it('rejects unknown roles instead of trusting a row or client value', () => {
    expect(() => parseWorkspaceRole('superadmin')).toThrow(/Invalid workspace role/);
    expect(() => parseWorkspaceRole({ role: 'owner' })).toThrow(/Invalid workspace role/);
  });
});
