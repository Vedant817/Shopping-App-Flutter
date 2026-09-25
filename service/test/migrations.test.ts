import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(root, 'drizzle');
const targetDirectory = resolve(root, '..', 'supabase', 'migrations');
const targetNames = ['0000_threadline_schema.sql', '0001_threadline_rls.sql', '0002_mobile_contract.sql', '0003_compliance_and_hardening.sql', '0004_role_constraint_snapshot.sql'];

describe('authoritative migration mirrors', () => {
  it('keeps Supabase migrations semantically identical to the Drizzle chain', () => {
    const sources = readdirSync(sourceDirectory).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
    expect(sources).toHaveLength(targetNames.length);
    for (const [index, source] of sources.entries()) {
      const sourceSql = readFileSync(join(sourceDirectory, source), 'utf8');
      const targetSql = readFileSync(join(targetDirectory, targetNames[index]!), 'utf8');
      expect(semanticSql(targetSql)).toBe(semanticSql(sourceSql));
    }
  });

  it('contains the runtime schema and security SQL in the authoritative chain', () => {
    const sql = readdirSync(sourceDirectory).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort().map((name) => readFileSync(join(sourceDirectory, name), 'utf8')).join('\n');
    for (const token of ['ingestion_jobs', 'updated_at', 'order_lines', 'product_variants', 'watermark_at', 'variants_complete', 'ROW LEVEL SECURITY', 'REVOKE ALL', 'service_metadata', 'refunds']) {
      expect(sql).toContain(token);
    }
  });
});

function semanticSql(value: string): string {
  return value.replaceAll('--> statement-breakpoint', '').split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('--')).join(' ').replaceAll('"', '').replace(/\s+/g, ' ').toLowerCase();
}
