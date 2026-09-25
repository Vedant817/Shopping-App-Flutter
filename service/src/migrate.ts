import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { databasePoolConfig } from './db/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') throw new Error('NODE_ENV must be development, test, or production');

const caPath = process.env.DATABASE_CA_CERT_PATH;
const caCertificate = caPath ? readFileSync(resolve(process.cwd(), caPath), 'utf8') : undefined;
const pool = new Pool(databasePoolConfig(databaseUrl, process.env.DATABASE_SSL === 'true', nodeEnv, caCertificate));

try {
  await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
} finally {
  await pool.end();
}
