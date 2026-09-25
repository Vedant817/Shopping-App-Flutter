import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseHandle = {
  db: Database;
  pool: Pool;
};

export type DatabaseEnvironment = 'development' | 'test' | 'production';

export function databasePoolConfig(connectionString: string, ssl: boolean, nodeEnv: DatabaseEnvironment): { connectionString: string; max: number; idleTimeoutMillis: number; connectionTimeoutMillis: number; ssl?: { rejectUnauthorized: true } } {
  if (!ssl && nodeEnv !== 'development' && nodeEnv !== 'test') throw new Error('DATABASE_SSL must be enabled outside development and test');
  return {
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(ssl ? { ssl: { rejectUnauthorized: true as const } } : {}),
  };
}

export function createDatabase(connectionString: string, ssl: boolean, nodeEnv: DatabaseEnvironment = 'production'): DatabaseHandle {
  const pool = new Pool(databasePoolConfig(connectionString, ssl, nodeEnv));
  return { db: drizzle(pool, { schema }), pool };
}

export async function closeDatabase(handle: DatabaseHandle): Promise<void> {
  await handle.pool.end();
}
