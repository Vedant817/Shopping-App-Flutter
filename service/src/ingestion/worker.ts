import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { upsertCustomer, upsertOrder, upsertProduct, upsertRefund } from '../db/upserts.js';
import { acceptCustomEvent, processWebhookJob } from './webhooks.js';
import { claimNextJob, completeJob, failJob, failJobResource, getJobResourceStates, initializeJobResources, markJobResourcesDead, startJobResource, completeJobResource, recoverStaleJobs, type IngestionJob } from './queue.js';
import { failStaleSyncRuns, readSyncCursor, runSyncResource, type SyncResource } from '../shopify/sync.js';
import { purgeExpiredOauthStates } from '../db/operations.js';


type WorkerMetrics = { processedJobs: number; failedJobs: number; retryCount: number };

/** How often the OAuth state sweep runs. The poll interval is far shorter. */
const OAUTH_STATE_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export type WorkerHandle = {
  stop: () => void;
  done: Promise<void>;
};

export function startWorker(db: Database, config: AppConfig): WorkerHandle {
  const workerId = randomUUID();
  let stopping = false;
  let wake: (() => void) | undefined;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const metrics: WorkerMetrics = { processedJobs: 0, failedJobs: 0, retryCount: 0 };
  let lastOauthSweep = 0;
  const sweepOauthStates = async (now: number): Promise<void> => {
    if (now - lastOauthSweep < OAUTH_STATE_SWEEP_INTERVAL_MS) return;
    lastOauthSweep = now;
    const deleted = await purgeExpiredOauthStates(db, new Date(now));
    if (deleted > 0) {
      process.stdout.write(`purged ${deleted} expired OAuth state row(s)\n`);
    }
  };
  const loop = async (): Promise<void> => {
    await heartbeat(db, workerId, metrics, config.ingestionPollIntervalMs);
    while (!stopping) {
      try {
        await recoverStaleJobs(db, config.ingestionStaleLockSeconds);
        await failStaleSyncRuns(db, Math.max(config.ingestionStaleLockSeconds * 10, 3600));
        await sweepOauthStates(Date.now());
        let processed = 0;
        while (!stopping && processed < config.ingestionBatchSize) {
          const job = await claimNextJob(db, { workerId, staleLockSeconds: config.ingestionStaleLockSeconds });
          if (!job) break;
           const result = await processJob(db, config, job);
           metrics.processedJobs += 1;
           if (result !== 'succeeded') metrics.failedJobs += 1;
           if (result === 'retry') metrics.retryCount += 1;
          processed += 1;
          await heartbeat(db, workerId, metrics, config.ingestionPollIntervalMs);
        }
        await heartbeat(db, workerId, metrics, config.ingestionPollIntervalMs);
        if (!stopping && processed === 0) await waitForPoll(config.ingestionPollIntervalMs, () => wake);
      } catch (error) {
        metrics.failedJobs += 1;
        await heartbeat(db, workerId, metrics, config.ingestionPollIntervalMs).catch(() => undefined);
        if (!stopping) await waitForPoll(config.ingestionPollIntervalMs, () => wake);
        process.stderr.write(`${error instanceof Error ? error.message : 'Worker loop failed'}\n`);
      }
    }
    await heartbeat(db, workerId, metrics, config.ingestionPollIntervalMs).catch(() => undefined);
    resolveDone();
  };
  void loop();
  return {
    stop: () => { stopping = true; wake?.(); },
    done,
  };
}

export async function processJob(db: Database, config: AppConfig, job: IngestionJob): Promise<'succeeded' | 'retry' | 'dead'> {
  try {
    await dispatchJob(db, config, job);
    await completeJob(db, job.id, job.lockedBy ?? '');
    return 'succeeded';
  } catch (error) {
    const failed = await failJob(db, job, job.lockedBy ?? '', error, {
      baseSeconds: config.ingestionBackoffBaseSeconds,
      maxSeconds: config.ingestionBackoffMaxSeconds,
    });
    if (failed?.status === 'dead') {
      await markJobResourcesDead(db, job.id, job.workspaceId);
      return 'dead';
    }
    return 'retry';
  }
}

async function dispatchJob(db: Database, config: AppConfig, job: IngestionJob): Promise<void> {
  if (
    job.resource === 'webhook' || job.resource === 'product' || job.resource === 'product_delete' ||
    job.resource === 'customer' || job.resource === 'customer_delete' || job.resource === 'order' ||
     job.resource === 'refund' ||
     job.resource === 'compliance' || job.resource === 'uninstall'
  ) {
    await processWebhookJob(db, job.workspaceId, job.payload, { config });
    return;
  }
  if (job.resource === 'full_sync') {
    const resources = Array.isArray(job.payload.resources) ? job.payload.resources.filter(isSyncResource) : [];
    await initializeJobResources(db, job.id, job.workspaceId, resources);
    const states = await getJobResourceStates(db, job.id, job.workspaceId);
    for (const resource of resources) {
      if (states.get(resource) === 'succeeded') continue;
      const cursorFrom = await readSyncCursor(db, job.workspaceId, resource);
      await startJobResource(db, job.id, job.workspaceId, resource, cursorFrom);
      try {
        const result = await runSyncResource(db, config, job.workspaceId, resource, { jobId: job.id });
        await completeJobResource(db, job.id, job.workspaceId, resource, result.cursor, result.variantsComplete);
      } catch (error) {
        await failJobResource(db, job.id, job.workspaceId, resource, error);
        throw error;
      }
    }
    return;
  }
  if (job.resource === 'custom_event') {
    await acceptCustomEvent(db, job.workspaceId, {
      id: requiredString(job.payload.id, 'custom event id'),
      eventType: requiredString(job.payload.eventType, 'custom event type'),
      customerId: optionalString(job.payload.customerId),
      sessionId: optionalString(job.payload.sessionId),
      occurredAt: requiredString(job.payload.occurredAt, 'custom event occurredAt'),
      data: isRecord(job.payload.data) ? job.payload.data : {},
    });
    return;
  }
  const node = isRecord(job.payload.node) ? job.payload.node : job.payload;
  if (job.resource === 'product') await upsertProduct(db, job.workspaceId, node);
  else if (job.resource === 'customer') await upsertCustomer(db, job.workspaceId, node);
  else if (job.resource === 'order') await upsertOrder(db, job.workspaceId, node);
  else if (job.resource === 'refund') await upsertRefund(db, job.workspaceId, node);
  else throw new Error(`Unsupported ingestion resource: ${job.resource}`);
}

function isSyncResource(value: unknown): value is SyncResource {
  return value === 'products' || value === 'customers' || value === 'orders' || value === 'abandoned_checkouts';
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function heartbeat(db: Database, workerId: string, metrics: WorkerMetrics, pollIntervalMs: number): Promise<void> {
  await db.execute(sql`
    insert into worker_heartbeats (worker_id, processed_jobs, failed_jobs, retry_count, metadata, last_heartbeat)
    values (${workerId}, ${metrics.processedJobs}, ${metrics.failedJobs}, ${metrics.retryCount}, ${JSON.stringify({ pollIntervalMs })}::jsonb, now())
    on conflict (worker_id) do update set
      processed_jobs = excluded.processed_jobs, failed_jobs = excluded.failed_jobs,
      retry_count = excluded.retry_count, metadata = excluded.metadata, last_heartbeat = now()
  `);
}

async function waitForPoll(milliseconds: number, setWake: (value: (() => void) | undefined) => void): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      setWake(undefined);
      resolve();
    }, milliseconds);
    setWake(() => {
      clearTimeout(timer);
      setWake(undefined);
      resolve();
    });
  });
}
