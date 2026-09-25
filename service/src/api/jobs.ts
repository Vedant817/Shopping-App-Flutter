import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { IngestionJobDto, IngestionJobStatus, JobResourceDto, JobResourceStatus, SyncDto } from './dtos.js';

export async function getIngestionJob(db: Database, workspaceId: string, jobId: string): Promise<IngestionJobDto | undefined> {
  const result = await db.execute(sql`
    select id, workspace_id, resource, status, attempts, max_attempts, available_at,
      last_error, created_at, updated_at
    from ingestion_jobs
    where workspace_id = ${workspaceId} and id = ${jobId}
    limit 1
  `);
  const row = result.rows[0];
  if (!row) return undefined;
  return mapJob(db, row, workspaceId);
}

export async function getSyncStatus(db: Database, workspaceId: string): Promise<SyncDto> {
  const job = await getLatestSyncJob(db, workspaceId);
  const syncState = await lastSyncState(db, workspaceId);
  if (job) {
    const lastResource = job.resources.at(-1);
    return {
      jobId: job.jobId,
      status: job.status,
      resource: job.resource,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      startedAt: job.resources.find((item) => item.startedAt)?.startedAt ?? null,
      completedAt: job.resources.reduce<string | null>((latest, item) => laterDate(latest, item.completedAt), null),
      cursor: lastResource?.cursorTo ?? lastResource?.cursorFrom ?? null,
      watermark: syncState.watermark,
      lastSyncedAt: syncState.lastSyncedAt,
      error: publicError(job.error ?? lastResource?.error),
      resources: job.resources,
    };
  }
  const runResult = await db.execute(sql`
    select resource, status, started_at, completed_at, cursor_to, error
    from sync_runs
    where workspace_id = ${workspaceId}
    order by started_at desc
    limit 1
  `);
  const row = recordOrEmpty(runResult.rows[0]);
  const status = normalizeSyncStatus(row.status);
  return {
    jobId: null,
    status: status === 'dead' ? 'failed' : status,
    resource: nullableString(row.resource),
    attempts: 0,
    maxAttempts: 0,
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    cursor: nullableString(row.cursor_to),
    watermark: syncState.watermark,
    lastSyncedAt: syncState.lastSyncedAt,
    error: publicError(row.error),
    resources: [],
  };
}

export async function getLatestSyncJob(db: Database, workspaceId: string): Promise<IngestionJobDto | undefined> {
  const result = await db.execute(sql`
    select id, workspace_id, resource, status, attempts, max_attempts, available_at,
      last_error, created_at, updated_at
    from ingestion_jobs
    where workspace_id = ${workspaceId} and resource = 'full_sync'
    order by created_at desc
    limit 1
  `);
  const row = result.rows[0];
  return row ? mapJob(db, row, workspaceId) : undefined;
}

async function mapJob(db: Database, input: unknown, workspaceId: string): Promise<IngestionJobDto> {
  const row = recordOrEmpty(input);
  const resources = await db.execute(sql`
    select resource, status, cursor_from, cursor_to, records_read, records_written,
      started_at, completed_at, error, variants_complete
    from ingestion_job_resources
    where workspace_id = ${workspaceId} and job_id = ${String(row.id)}
    order by created_at asc, resource asc
  `);
  return {
    jobId: String(row.id),
    workspaceId: String(row.workspace_id),
    resource: String(row.resource),
    status: normalizeJobStatus(row.status),
    attempts: numberValue(row.attempts),
    maxAttempts: numberValue(row.max_attempts),
    availableAt: dateValue(row.available_at).toISOString(),
    createdAt: dateValue(row.created_at).toISOString(),
    updatedAt: dateValue(row.updated_at).toISOString(),
    error: publicError(row.last_error),
    resources: resources.rows.map(mapResource),
  };
}

function mapResource(input: unknown): JobResourceDto {
  const row = recordOrEmpty(input);
  return {
    resource: String(row.resource),
    status: normalizeResourceStatus(row.status),
    cursorFrom: nullableString(row.cursor_from),
    cursorTo: nullableString(row.cursor_to),
    recordsRead: numberValue(row.records_read),
    recordsWritten: numberValue(row.records_written),
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    error: publicError(row.error),
    variantsTruncated: String(row.resource) === 'products' && row.variants_complete !== true,
  };
}

async function lastSyncState(db: Database, workspaceId: string): Promise<{ lastSyncedAt: string | null; watermark: string | null }> {
  const result = await db.execute(sql`
    select max(last_synced_at) as last_synced_at, max(watermark_at) as watermark_at
    from sync_cursors
    where workspace_id = ${workspaceId}
  `);
  const row = recordOrEmpty(result.rows[0]);
  return { lastSyncedAt: nullableDate(row.last_synced_at), watermark: nullableDate(row.watermark_at) };
}

function normalizeJobStatus(value: unknown): IngestionJobStatus {
  const status = String(value ?? 'queued');
  return status === 'queued' || status === 'running' || status === 'succeeded' || status === 'failed' || status === 'dead' ? status : 'queued';
}

function normalizeResourceStatus(value: unknown): JobResourceStatus {
  return normalizeJobStatus(value);
}

function normalizeSyncStatus(value: unknown): 'idle' | IngestionJobStatus {
  if (value === undefined || value === null) return 'idle';
  return normalizeJobStatus(value);
}

function laterDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function publicError(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? 'Ingestion operation failed' : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return dateValue(value).toISOString();
}

function dateValue(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid timestamp');
  return date;
}
