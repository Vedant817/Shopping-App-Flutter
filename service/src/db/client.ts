import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function readDatabaseCaCertificate(): string | undefined {
  // The inline form is checked first because it is the only one that works in the
  // deployed container. The image copies package files, drizzle and src, and
  // nothing else, so a certificate sitting on the host or in the repository can
  // never appear under the working directory. Pasting the PEM into an
  // environment variable sidesteps the image entirely.
  const inline = process.env.DATABASE_CA_CERT;
  if (inline && inline.trim().length > 0) {
    // Dashboards and .env parsers both mangle multi-line values, so accept a
    // certificate that arrived with its newlines escaped.
    return inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
  }
  const path = process.env.DATABASE_CA_CERT_PATH;
  if (!path) return undefined;
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseHandle = {
  db: Database;
  pool: Pool;
};

export type DatabaseEnvironment = 'development' | 'test' | 'production';

export function databasePoolConfig(connectionString: string, ssl: boolean, nodeEnv: DatabaseEnvironment, caCertificate?: string): { connectionString: string; max: number; idleTimeoutMillis: number; connectionTimeoutMillis: number; ssl?: { rejectUnauthorized: boolean; ca?: string } } {
  if (!ssl && nodeEnv !== 'development' && nodeEnv !== 'test') throw new Error('DATABASE_SSL must be enabled outside development and test');
  return {
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(ssl
      ? {
          // Supabase's proxies chain to a Supabase root CA that is not in the
          // public trust store, so verifying fails unless the root is supplied.
          // With a certificate this verifies the server. Without one this
          // matches sslmode=require, which Supabase documents as the default:
          // the connection is encrypted but the server is not authenticated.
          ssl: caCertificate ? { rejectUnauthorized: true, ca: caCertificate } : { rejectUnauthorized: false },
        }
      : {}),
  };
}

export function createDatabase(connectionString: string, ssl: boolean, nodeEnv: DatabaseEnvironment = 'production', caCertificate?: string): DatabaseHandle {
  const pool = new Pool(databasePoolConfig(connectionString, ssl, nodeEnv, caCertificate));
  return { db: drizzle(pool, { schema }), pool };
}

export async function closeDatabase(handle: DatabaseHandle): Promise<void> {
  await handle.pool.end();
}
