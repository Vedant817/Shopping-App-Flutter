import { describe, expect, it } from 'vitest';
import { checkDatabase } from '../src/db/health.js';

describe('resource health', () => {
  it('reports up only after schema, marker, and privilege checks pass', async () => {
    const checkedAt = await checkDatabase({ execute: async () => ({ rows: [{ schema_present: true, marker_present: true, privileges_present: true }] }) } as never);
    expect(checkedAt.status).toBe('up');
    expect(checkedAt.latencyMs).toBeGreaterThanOrEqual(0);
    expect(new Date(checkedAt.checkedAt).toString()).not.toBe('Invalid Date');
  });

  it('reports down when the authoritative schema marker is missing', async () => {
    const checked = await checkDatabase({ execute: async () => ({ rows: [{ schema_present: true, marker_present: false, privileges_present: true }] }) } as never);
    expect(checked.status).toBe('down');
  });

  it('reports down when the database query fails', async () => {
    const checked = await checkDatabase({ execute: async () => { throw new Error('connection refused'); } } as never);
    expect(checked.status).toBe('down');
    expect(checked.error).toBe('connection refused');
  });
});
