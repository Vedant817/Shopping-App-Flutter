import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

function readEnv() {
  const entries = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    });
  return Object.fromEntries(entries);
}

const env = readEnv();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in service/.env');

const journal = JSON.parse(readFileSync(resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'));
const throughTag = process.argv[2];
if (!throughTag) throw new Error('Pass the tag to baseline through, for example 0004_role_constraint_snapshot');
const lastApplied = journal.entries.find((entry) => entry.tag === throughTag);
if (!lastApplied) throw new Error(`Journal has no entry tagged ${throughTag}`);
const nextPending = journal.entries.find((entry) => entry.when > lastApplied.when);

const baselineHash = createHash('sha256')
  .update(readFileSync(resolve(process.cwd(), `drizzle/${throughTag}.sql`)).toString())
  .digest('hex');

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();

  const tables = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  );
  if (tables.rows[0].n === 0) {
    throw new Error('Refusing to baseline: the public schema is empty, so there is nothing to baseline and the normal migrator should run instead');
  }

  const existing = await client.query('select to_regclass(\'drizzle.__drizzle_migrations\') as reg');
  if (existing.rows[0].reg !== null) {
    const applied = await client.query('select count(*)::int as n from drizzle.__drizzle_migrations');
    if (applied.rows[0].n > 0) {
      console.log(`drizzle journal already has ${applied.rows[0].n} applied migrations; nothing to baseline`);
      process.exit(0);
    }
  }

  await client.query('create schema if not exists drizzle');
  await client.query(`create table if not exists drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint
  )`);

  await client.query(
    'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
    [baselineHash, lastApplied.when],
  );

  console.log(`baselined drizzle journal through ${throughTag} (created_at=${lastApplied.when})`);
  console.log(nextPending
    ? `the next run will apply ${nextPending.tag} and everything after it`
    : 'no migrations remain to apply');
} catch (error) {
  console.error('baseline failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
