import { describe, expect, it } from 'vitest';
import { getIngestionJob, getSyncStatus } from '../src/api/jobs.js';
import { failJob } from '../src/ingestion/queue.js';

function jobRow(status: string) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    workspace_id: 'workspace-1',
    resource: 'full_sync',
    status,
    attempts: 1,
    max_attempts: 3,
    available_at: '2026-01-02T03:04:05.000Z',
    last_error: status === 'failed' ? 'retryable failure' : null,
    created_at: '2026-01-02T03:04:05.000Z',
    updated_at: '2026-01-02T03:04:06.000Z',
  };
}

describe('ingestion job status', () => {
  it.each(['queued', 'running', 'succeeded', 'failed', 'dead'])('preserves the %s state', async (status) => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => {
        statements.push(query);
        if (statements.length === 1) return { rows: [jobRow(status)] };
        return { rows: [{ resource: 'products', status: status === 'dead' ? 'failed' : status, cursor_from: 'cursor-1', cursor_to: 'cursor-2', records_read: 10, records_written: 9, started_at: '2026-01-02T03:04:05.000Z', completed_at: status === 'queued' ? null : '2026-01-02T03:04:06.000Z', error: null }] };
      },
    };
    const job = await getIngestionJob(db as never, 'workspace-1', jobRow(status).id);
    expect(job?.status).toBe(status);
    expect(job?.resources[0]).toMatchObject({ resource: 'products', cursorTo: 'cursor-2', recordsRead: 10, recordsWritten: 9 });
    expect(JSON.stringify(statements[0])).toContain('workspace-1');
  });

  it('exposes job and per-resource state in sync status', async () => {
    const responses = [
      { rows: [jobRow('failed')] },
      { rows: [{ resource: 'orders', status: 'failed', cursor_from: 'cursor-1', cursor_to: 'cursor-2', records_read: 20, records_written: 18, started_at: '2026-01-02T03:04:05.000Z', completed_at: '2026-01-02T03:04:06.000Z', error: 'provider unavailable' }] },
      { rows: [{ last_synced_at: '2026-01-02T03:04:06.000Z' }] },
    ];
    const db = { execute: async () => responses.shift() ?? { rows: [] } };
    const status = await getSyncStatus(db as never, 'workspace-1');
    expect(status).toMatchObject({ jobId: jobRow('failed').id, status: 'failed', cursor: 'cursor-2' });
     expect(status.resources[0]).toMatchObject({ resource: 'orders', status: 'failed', recordsRead: 20, recordsWritten: 18, error: 'Ingestion operation failed' });
  });

  it('marks retryable failures as failed rather than succeeded', async () => {
    const db = {
      execute: async () => ({ rows: [{ ...jobRow('failed'), locked_by: null, locked_at: null }] }),
    };
    const result = await failJob(db as never, { id: jobRow('failed').id, attempts: 1, maxAttempts: 3 }, 'worker-1', new Error('failure'), { baseSeconds: 5, maxSeconds: 60 });
    expect(result?.status).toBe('failed');
  });
});
