import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

export type ResourceHealth = {
  status: 'up' | 'down';
  checkedAt: string;
  latencyMs: number;
  error?: string;
};

export async function checkDatabase(db: Pick<Database, 'execute'>): Promise<ResourceHealth> {
  const startedAt = Date.now();
  try {
    const result = await db.execute(sql`
      select
        exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'service_metadata') as schema_present,
        exists (select 1 from service_metadata where key = 'schema_version') as marker_present,
        has_table_privilege(current_user, 'public.workspaces', 'SELECT')
          and has_table_privilege(current_user, 'public.products', 'SELECT')
          and has_table_privilege(current_user, 'public.orders', 'SELECT')
          and has_table_privilege(current_user, 'public.customers', 'SELECT')
          and         has_table_privilege(current_user, 'public.ingestion_jobs', 'SELECT')
          and has_table_privilege(current_user, 'public.shopify_installations', 'SELECT')
          and has_table_privilege(current_user, 'public.products', 'INSERT')
          and has_table_privilege(current_user, 'public.products', 'UPDATE')
          and has_table_privilege(current_user, 'public.orders', 'INSERT')
          and has_table_privilege(current_user, 'public.orders', 'UPDATE')
          and has_table_privilege(current_user, 'public.ingestion_jobs', 'INSERT')
          and has_table_privilege(current_user, 'public.ingestion_jobs', 'UPDATE')
          and has_table_privilege(current_user, 'public.ingestion_jobs', 'DELETE') as privileges_present
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row || !truthy(row.schema_present) || !truthy(row.marker_present) || !truthy(row.privileges_present)) throw new Error('Database schema or privileges are not ready');
    return { status: 'up', checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: 'down',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Database check failed',
    };
  }
}

function truthy(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}
