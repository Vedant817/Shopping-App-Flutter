import 'dotenv/config';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { databasePoolConfig } from './db/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') throw new Error('NODE_ENV must be development, test, or production');

const pool = new Pool(databasePoolConfig(databaseUrl, process.env.DATABASE_SSL === 'true', nodeEnv));

try {
  await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
} finally {
  await pool.end();
}
