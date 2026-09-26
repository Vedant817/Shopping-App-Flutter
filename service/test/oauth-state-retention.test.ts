import { describe, expect, it } from 'vitest';
import { purgeExpiredOauthStates } from '../src/db/operations.js';

function recordingDb(rowCount: number) {
  const statements: unknown[] = [];
  return {
    statements,
    db: {
      execute: async (query: unknown) => {
        statements.push(query);
        return { rows: [], rowCount };
      },
    } as never,
  };
}

describe('OAuth state retention', () => {
  it('deletes states that expired or were already consumed', async () => {
    const { db, statements } = recordingDb(3);
    const deleted = await purgeExpiredOauthStates(db, new Date('2026-01-01T00:00:00Z'));

    expect(deleted).toBe(3);
    const sql = JSON.stringify(statements);
    expect(sql).toContain('delete from oauth_states');
    // Both terminal conditions must be present, otherwise a consumed replayable
    // state or an abandoned consent screen would keep its PKCE verifier forever.
    expect(sql).toContain('expires_at');
    expect(sql).toContain('consumed_at is not null');
  });

  it('reports zero when there is nothing to purge', async () => {
    const { db } = recordingDb(0);
    expect(await purgeExpiredOauthStates(db)).toBe(0);
  });

  it('tolerates a driver that does not report a row count', async () => {
    const db = { execute: async () => ({ rows: [] }) } as never;
    expect(await purgeExpiredOauthStates(db)).toBe(0);
  });
});
