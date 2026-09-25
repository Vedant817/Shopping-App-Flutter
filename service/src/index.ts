import { loadConfig } from './config/env.js';
import { createDatabase, closeDatabase } from './db/client.js';
import { buildApp } from './http/server.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl, config.databaseSsl, config.nodeEnv);
const app = await buildApp({ config, db: database.db });

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
  } finally {
    await closeDatabase(database);
  }
};

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error({ errorMessage: error instanceof Error ? error.message : 'listen failed' }, 'server failed');
  await closeDatabase(database);
  process.exitCode = 1;
}
