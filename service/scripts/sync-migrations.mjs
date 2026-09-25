import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(root, 'drizzle');
const targetDirectory = resolve(root, '..', 'supabase', 'migrations');
const targetNames = ['0000_threadline_schema.sql', '0001_threadline_rls.sql', '0002_mobile_contract.sql', '0003_compliance_and_hardening.sql', '0004_role_constraint_snapshot.sql', '0005_expiring_offline_tokens.sql'];
const sources = readdirSync(sourceDirectory).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
if (sources.length !== targetNames.length) throw new Error(`Expected ${targetNames.length} Drizzle migrations, found ${sources.length}`);
const check = process.argv.includes('--check');
for (const [index, source] of sources.entries()) {
  const sourcePath = join(sourceDirectory, source);
  const targetPath = join(targetDirectory, targetNames[index]);
  const content = readFileSync(sourcePath, 'utf8');
  if (check) {
    const current = readFileSync(targetPath, 'utf8');
    if (semanticSql(current) !== semanticSql(content)) throw new Error(`Supabase migration drift: ${targetNames[index]}`);
  } else {
    writeFileSync(targetPath, content);
  }
}
function semanticSql(value) {
  return value
    .replaceAll('--> statement-breakpoint', '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('--'))
    .join(' ')
    .replaceAll('"', '')
    .replace(/\s+/g, ' ')
    .replaceAll(' ,', ',')
    .replaceAll('( ', '(')
    .replaceAll(' )', ')')
    .toLowerCase();
}

console.log(`migration-mirrors-${check ? 'valid' : 'written'}`);
