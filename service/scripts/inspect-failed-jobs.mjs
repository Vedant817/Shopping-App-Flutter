import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();
  const jobs = await client.query(
    `select j.id, j.resource, j.status, j.attempts, j.last_error, j.created_at, j.updated_at, w.shop_domain
     from ingestion_jobs j left join workspaces w on w.id = j.workspace_id
     where j.status in ('failed','dead') order by j.updated_at desc limit 15`,
  );
  console.log(`failed or dead jobs: ${jobs.rows.length}`);
  for (const row of jobs.rows) {
    console.log(`\n  ${row.id} resource=${row.resource} status=${row.status} attempts=${row.attempts} shop=${row.shop_domain ?? '(no workspace)'}`);
    console.log(`  created=${row.created_at?.toISOString?.()} updated=${row.updated_at?.toISOString?.()}`);
    console.log(`  last_error=${String(row.last_error).slice(0, 300)}`);
  }
  if (jobs.rows.length === 0) console.log('none');
} catch (error) {
  console.log('failed:', error.message);
} finally {
  await client.end().catch(() => {});
}
