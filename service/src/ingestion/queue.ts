import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';

export type IngestionResource = 'product' | 'product_delete' | 'customer' | 'customer_delete' | 'order' | 'refund' | 'cart' | 'checkout' | 'custom_event' | 'compliance' | 'uninstall' | 'webhook' | 'full_sync';

export type IngestionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export type IngestionJob = {
  id: string;
  workspaceId: string;
  resource: IngestionResource | string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: IngestionJobStatus | string;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EnqueueInput = {
  workspaceId: string;
  resource: IngestionResource | string;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
  availableAt?: Date;
};

export type ClaimOptions = {
  workerId: string;
  staleLockSeconds: number;
};

export async function enqueueJob(db: Database, input: EnqueueInput): Promise<{ job: IngestionJob; inserted: boolean }> {
  if (!input.workspaceId || !input.resource || !input.idempotencyKey) throw new Error('Job identity is incomplete');
  const payload = JSON.stringify(input.payload ?? {});
  const maxAttempts = input.maxAttempts ?? 5;
  const availableAt = input.availableAt ?? new Date();
  const result = await db.execute(sql`
    insert into ingestion_jobs (workspace_id, resource, payload, idempotency_key, max_attempts, available_at)
    values (${input.workspaceId}, ${input.resource}, ${payload}::jsonb, ${input.idempotencyKey}, ${maxAttempts}, ${availableAt})
    on conflict (workspace_id, idempotency_key) do nothing
    returning id, workspace_id, resource, payload, idempotency_key, status, attempts, max_attempts,
      available_at, locked_at, locked_by, last_error, created_at, updated_at
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row) return { job: mapJob(row), inserted: true };
  const existing = await db.execute(sql`
    select id, workspace_id, resource, payload, idempotency_key, status, attempts, max_attempts,
      available_at, locked_at, locked_by, last_error, created_at, updated_at
    from ingestion_jobs
    where workspace_id = ${input.workspaceId} and idempotency_key = ${input.idempotencyKey}
    limit 1
  `);
  const existingRow = existing.rows[0] as Record<string, unknown> | undefined;
  if (!existingRow) throw new Error('Job could not be read after enqueue');
  return { job: mapJob(existingRow), inserted: false };
}

export async function recoverStaleJobs(db: Database, staleLockSeconds: number): Promise<number> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      update ingestion_jobs
      set status = 'queued', locked_at = null, locked_by = null,
        last_error = coalesce(last_error, 'stale worker lock recovered'), updated_at = now()
      where status = 'running' and locked_at < now() - (${staleLockSeconds} * interval '1 second')
    `);
    await tx.execute(sql`
      update ingestion_job_resources
      set status = 'queued', completed_at = null, updated_at = now()
      where status = 'running' and job_id in (
        select id from ingestion_jobs where status = 'queued' and updated_at >= now() - interval '1 minute'
      )
    `);
    return result.rowCount ?? 0;
  });
}

export async function claimNextJob(db: Database, options: ClaimOptions): Promise<IngestionJob | undefined> {
  if (!options.workerId) throw new Error('Worker identity is required');
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      with candidate as (
        select id
        from ingestion_jobs
        where (status in ('queued', 'failed') and available_at <= now())
           or (status = 'running' and locked_at < now() - (${options.staleLockSeconds} * interval '1 second'))
        order by available_at asc, created_at asc
        FOR UPDATE SKIP LOCKED
        limit 1
      )
      update ingestion_jobs as job
      set status = 'running', attempts = job.attempts + 1,
        locked_at = now(), locked_by = ${options.workerId}, updated_at = now()
      from candidate
      where job.id = candidate.id
      returning job.id, job.workspace_id, job.resource, job.payload, job.idempotency_key,
        job.status, job.attempts, job.max_attempts, job.available_at, job.locked_at,
        job.locked_by, job.last_error, job.created_at, job.updated_at
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapJob(row) : undefined;
  });
}

export async function completeJob(db: Database, jobId: string, workerId: string): Promise<void> {
  await db.execute(sql`
    update ingestion_jobs
    set status = 'succeeded', locked_at = null, locked_by = null, last_error = null, updated_at = now()
    where id = ${jobId} and status = 'running' and locked_by = ${workerId}
  `);
}

export async function failJob(
  db: Database,
  job: Pick<IngestionJob, 'id' | 'attempts' | 'maxAttempts'>,
  workerId: string,
  error: unknown,
  options: { baseSeconds: number; maxSeconds: number },
): Promise<IngestionJob | undefined> {
  const message = error instanceof Error ? error.message : 'Ingestion job failed';
  const terminal = job.attempts >= job.maxAttempts;
  const delaySeconds = terminal ? 0 : Math.min(options.maxSeconds, options.baseSeconds * 2 ** Math.max(0, job.attempts - 1));
  const nextStatus: IngestionJobStatus = terminal ? 'dead' : 'failed';
  const result = await db.execute(sql`
    update ingestion_jobs
    set status = ${nextStatus}, available_at = now() + (${delaySeconds} * interval '1 second'),
      locked_at = null, locked_by = null, last_error = ${message.slice(0, 4000)}, updated_at = now()
    where id = ${job.id} and status = 'running' and locked_by = ${workerId}
    returning id, workspace_id, resource, payload, idempotency_key, status, attempts, max_attempts,
      available_at, locked_at, locked_by, last_error, created_at, updated_at
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapJob(row) : undefined;
}

export async function initializeJobResources(db: Database, jobId: string, workspaceId: string, resources: string[]): Promise<void> {
  for (const resource of resources) {
    await db.execute(sql`
      insert into ingestion_job_resources (job_id, workspace_id, resource, status)
      values (${jobId}, ${workspaceId}, ${resource}, 'queued')
      on conflict (job_id, resource) do nothing
    `);
  }
}

export async function getJobResourceStates(db: Database, jobId: string, workspaceId: string): Promise<Map<string, string>> {
  const result = await db.execute(sql`
    select resource, status
    from ingestion_job_resources
    where job_id = ${jobId} and workspace_id = ${workspaceId}
  `);
  return new Map(result.rows.map((row) => [String(row.resource), String(row.status)]));
}

export async function startJobResource(db: Database, jobId: string, workspaceId: string, resource: string, cursorFrom: string | null): Promise<void> {
  await db.execute(sql`
    update ingestion_job_resources
    set status = 'running', cursor_from = ${cursorFrom}, error = null,
      variants_complete = false, started_at = coalesce(started_at, now()), completed_at = null, updated_at = now()
    where job_id = ${jobId} and workspace_id = ${workspaceId} and resource = ${resource}
  `);
}

export async function updateJobResourcePage(
  executor: Pick<Database, 'execute'>,
  input: { jobId: string; workspaceId: string; resource: string; cursor: string | null; recordsRead: number; recordsWritten: number; variantsComplete?: boolean },
): Promise<void> {
  await executor.execute(sql`
    update ingestion_job_resources
    set cursor_to = ${input.cursor}, records_read = records_read + ${input.recordsRead},
      records_written = records_written + ${input.recordsWritten},
      variants_complete = ${input.variantsComplete ?? true}, updated_at = now()
    where job_id = ${input.jobId} and workspace_id = ${input.workspaceId} and resource = ${input.resource}
  `);
}

export async function completeJobResource(db: Database, jobId: string, workspaceId: string, resource: string, cursor: string | null, variantsComplete = true): Promise<void> {
  await db.execute(sql`
    update ingestion_job_resources
    set status = 'succeeded', cursor_to = ${cursor}, variants_complete = ${variantsComplete}, completed_at = now(), error = null, updated_at = now()
    where job_id = ${jobId} and workspace_id = ${workspaceId} and resource = ${resource}
  `);
}

export async function failJobResource(db: Database, jobId: string, workspaceId: string, resource: string, error: unknown): Promise<void> {
  await db.execute(sql`
    update ingestion_job_resources
    set status = 'failed', completed_at = now(), error = ${error instanceof Error ? error.message : 'Ingestion resource failed'}, updated_at = now()
    where job_id = ${jobId} and workspace_id = ${workspaceId} and resource = ${resource}
  `);
}

export async function markJobResourcesDead(db: Database, jobId: string, workspaceId: string): Promise<void> {
  await db.execute(sql`
    update ingestion_job_resources
    set status = 'dead', completed_at = coalesce(completed_at, now()), updated_at = now()
    where job_id = ${jobId} and workspace_id = ${workspaceId} and status not in ('succeeded', 'dead')
  `);
}

export async function getJob(db: Database, jobId: string): Promise<IngestionJob | undefined> {
  const result = await db.execute(sql`
    select id, workspace_id, resource, payload, idempotency_key, status, attempts, max_attempts,
      available_at, locked_at, locked_by, last_error, created_at, updated_at
    from ingestion_jobs where id = ${jobId} limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapJob(row) : undefined;
}

function mapJob(row: Record<string, unknown>): IngestionJob {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    resource: String(row.resource),
    payload: isRecord(row.payload) ? row.payload : {},
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as IngestionJobStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    availableAt: asDate(row.available_at),
    lockedAt: row.locked_at ? asDate(row.locked_at) : null,
    lockedBy: row.locked_by === null || row.locked_by === undefined ? null : String(row.locked_by),
    lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid job timestamp');
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
