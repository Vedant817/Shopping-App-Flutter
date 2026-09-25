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
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const server = await client.query('select version()');
  console.log('connected:', server.rows[0].version.split(',')[0]);

  const tables = await client.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  console.log('public tables:', tables.rows[0].n);

  const journal = await client.query("select to_regclass('drizzle.__drizzle_migrations') as reg");
  if (journal.rows[0].reg === null) {
    console.log('drizzle journal: ABSENT');
  } else {
    const rows = await client.query('select id, hash, created_at from drizzle.__drizzle_migrations order by created_at');
    console.log(`drizzle journal rows: ${rows.rows.length}`);
    for (const row of rows.rows) console.log('  ', row.created_at, row.hash?.slice(0, 12));
  }

  const installationCols = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='shopify_installations' order by ordinal_position",
  );
  console.log('shopify_installations columns:', installationCols.rows.map((r) => r.column_name).join(','));

  const rowCounts = {};
  for (const table of ['workspaces', 'app_users', 'shopify_installations', 'products', 'orders', 'customers', 'checkouts', 'webhook_events']) {
    const result = await client.query(`select count(*)::int as n from ${table}`);
    rowCounts[table] = result.rows[0].n;
  }
  console.log('row counts:', JSON.stringify(rowCounts));
} catch (error) {
  console.log('FAILED:', error.message);
  if (error.code) console.log('code:', error.code);
} finally {
  await client.end().catch(() => {});
}
