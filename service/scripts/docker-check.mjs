import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const image = process.env.DOCKER_IMAGE ?? 'threadline-service:deployment-check';
const databaseName = `threadline-migration-check-${process.pid}`;
const port = 55441;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function removeContainer() {
  spawnSync('docker', ['rm', '-f', databaseName], { encoding: 'utf8' });
}

try {
  run('docker', ['build', '--file', 'service/Dockerfile', '--tag', image, 'service'], { cwd: root });
  const migrationFiles = run('docker', ['run', '--rm', image, 'sh', '-c', 'find /app/drizzle -maxdepth 1 -type f -name "*.sql" | sort']).split('\n').filter(Boolean);
  if (migrationFiles.length < 5) throw new Error('Migration files are missing from the image');
  removeContainer();
  run('docker', ['run', '--name', databaseName, '-p', `${port}:5432`, '-e', 'POSTGRES_PASSWORD=local-check', '-e', 'POSTGRES_DB=threadline', '-d', 'postgres:16-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const readyResult = spawnSync('docker', ['exec', databaseName, 'pg_isready', '-U', 'postgres', '-d', 'threadline'], { encoding: 'utf8' });
    if (readyResult.status === 0) {
      ready = true;
      break;
    }
    await sleep(1000);
  }
  if (!ready) throw new Error('Clean PostgreSQL did not become ready');
  const containerDatabaseUrl = 'postgresql://postgres:local-check@127.0.0.1:5432/threadline';
  const hostDatabaseUrl = `postgresql://postgres:local-check@127.0.0.1:${port}/threadline`;
  run('docker', ['run', '--rm', '--network', `container:${databaseName}`, '-e', `DATABASE_URL=${containerDatabaseUrl}`, '-e', 'DATABASE_SSL=false', '-e', 'NODE_ENV=test', image, 'npm', 'run', 'db:migrate:runtime']);
  run('docker', ['run', '--rm', '--network', `container:${databaseName}`, '-e', `DATABASE_URL=${containerDatabaseUrl}`, '-e', 'DATABASE_SSL=false', '-e', 'NODE_ENV=test', image, 'npm', 'run', 'db:migrate:runtime']);
  run(process.execPath, ['scripts/rls-role-check.mjs'], { cwd: resolve(root, 'service'), env: { ...process.env, RLS_DATABASE_URL: hostDatabaseUrl, RLS_DATABASE_SSL: 'false', NODE_ENV: 'test' } });
  run(process.execPath, ['scripts/clean-migrate-check.mjs'], { cwd: resolve(root, 'service'), env: { ...process.env, MIGRATION_DATABASE_URL: hostDatabaseUrl, MIGRATION_DATABASE_SSL: 'false', NODE_ENV: 'test' } });
  run(process.execPath, ['scripts/overview-integration.mjs'], { cwd: resolve(root, 'service'), env: { ...process.env, MIGRATION_DATABASE_URL: hostDatabaseUrl, MIGRATION_DATABASE_SSL: 'false', NODE_ENV: 'test' } });
  run(process.execPath, ['scripts/compliance-integration.mjs'], { cwd: resolve(root, 'service'), env: { ...process.env, MIGRATION_DATABASE_URL: hostDatabaseUrl, MIGRATION_DATABASE_SSL: 'false', NODE_ENV: 'test' } });
  console.log('docker-migration-check-valid');
} finally {
  removeContainer();
}
