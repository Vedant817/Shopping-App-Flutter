import { describe, expect, it } from 'vitest';
import { addWorkspaceMember, countWorkspaceOwners, removeWorkspaceMember, updateWorkspaceMemberRole } from '../src/db/operations.js';

describe('workspace membership mutations', () => {
  it('does not promote an existing member during reinstallation', async () => {
    const statements: unknown[] = [];
    const db = { execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } };
    const inserted = await addWorkspaceMember(db as never, 'workspace-1', 'user-1', 'owner');
    expect(inserted).toBe(false);
    expect(JSON.stringify(statements)).toContain('on conflict (workspace_id, user_id) do nothing');
    expect(JSON.stringify(statements)).not.toContain('do update set role');
  });

  it('provides auditable role and removal primitives', async () => {
    const statements: unknown[] = [];
    let updateCalls = 0;
    const updateDb = {
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ execute: async (query: unknown) => { statements.push(query); updateCalls += 1; return { rows: updateCalls === 1 ? [{ role: 'member' }] : updateCalls === 2 ? [{ count: 1 }] : [] }; } }),
    };
    expect(await updateWorkspaceMemberRole(updateDb as never, 'workspace-1', 'user-1', 'admin')).toBe('updated');
    let removeCalls = 0;
    const removeDb = {
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ execute: async (query: unknown) => { statements.push(query); removeCalls += 1; return { rows: removeCalls === 1 ? [{ role: 'member' }] : [] }; } }),
    };
    expect(await removeWorkspaceMember(removeDb as never, 'workspace-1', 'user-1')).toBe('removed');
    expect(await countWorkspaceOwners({ execute: async () => ({ rows: [{ count: 1 }] }) } as never, 'workspace-1')).toBe(1);
    expect(JSON.stringify(statements)).toContain('update workspace_members');
     expect(JSON.stringify(statements)).toContain('delete from workspace_members');
   });

   it('rejects removal of the last owner atomically', async () => {
    let calls = 0;
    const db = { transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ execute: async () => { calls += 1; return { rows: calls === 1 ? [{ role: 'owner' }] : [{ count: 1 }] }; } }) };
    expect(await removeWorkspaceMember(db as never, 'workspace-1', 'owner-1')).toBe('last_owner');
  });
});
