import { loadConfig } from './config/env.js';
import { checkDatabase } from './db/health.js';
import { createDatabase, closeDatabase, readDatabaseCaCertificate } from './db/client.js';
import { startWorker } from './ingestion/worker.js';

const config = loadConfig();
const caCertificate = readDatabaseCaCertificate();
const database = createDatabase(config.databaseUrl, config.databaseSsl, config.nodeEnv, caCertificate);
if (config.databaseSsl && !caCertificate) {
  console.warn('database TLS is encrypted but the server certificate is not verified; set DATABASE_CA_CERT_PATH to the Supabase root certificate to verify it');
}
const databaseHealth = await checkDatabase(database.db);
if (databaseHealth.status !== 'up') {
  await closeDatabase(database);
  throw new Error('Worker database readiness check failed');
}
const worker = startWorker(database.db, config);

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stderr.write(`received ${signal}, stopping worker\n`);
  worker.stop();
  try {
    await worker.done;
  } finally {
    await closeDatabase(database);
  }
};

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
