import { describe, expect, it } from 'vitest';
import { requireUserId, requireWorkspaceMembership } from '../src/auth/tenant.js';
import { extractBearerToken } from '../src/auth/supabase.js';
import { AppError } from '../src/utils/errors.js';

function membershipDb(role: string | undefined) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => role ? [{ workspaceId: 'workspace-1', userId: 'user-1', role }] : [],
        }),
      }),
    }),
  } as never;
}

describe('authentication and tenant helpers', () => {
  it('extracts only bearer credentials', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(extractBearerToken('Basic abc')).toBeUndefined();
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('requires a user and an allowed workspace role', async () => {
    expect(() => requireUserId(undefined)).toThrow(AppError);
    await expect(requireWorkspaceMembership(membershipDb('member'), 'user-1', 'workspace-1')).resolves.toMatchObject({ role: 'member' });
    await expect(requireWorkspaceMembership(membershipDb('viewer'), 'user-1', 'workspace-1', ['owner', 'admin'])).rejects.toThrow(AppError);
    await expect(requireWorkspaceMembership(membershipDb(undefined), 'user-1', 'workspace-1')).rejects.toThrow(AppError);
  });
});
