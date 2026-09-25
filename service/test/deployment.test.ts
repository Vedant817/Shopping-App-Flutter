import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('deployment contract', () => {
  it('ships migration assets and runs them from the web pre-deploy hook only', () => {
    const dockerfile = readFileSync(resolve(root, 'service', 'Dockerfile'), 'utf8');
    const render = readFileSync(resolve(root, 'render.yaml'), 'utf8');
    expect(dockerfile).toContain('COPY drizzle ./drizzle');
    expect(render).toContain('preDeployCommand: npm run db:migrate:runtime');
    expect(render.match(/preDeployCommand:/g)).toHaveLength(1);
    expect(render).toContain('envVarGroups:');
    expect(render).toContain('name: threadline-shared');
    expect(render.match(/fromGroup: threadline-shared/g)).toHaveLength(2);
    expect(render).toContain('key: SHOPIFY_TOKEN_ENCRYPTION_KEY\n        sync: false');
    const workerSection = render.slice(render.indexOf('type: worker'));
    expect(workerSection).not.toContain('preDeployCommand');
    const worker = readFileSync(resolve(root, 'service', 'src', 'worker.ts'), 'utf8');
     expect(worker).toContain('SIGTERM');
     expect(worker).toContain('checkDatabase');
     expect(worker).not.toContain('db:migrate');
  });
});
