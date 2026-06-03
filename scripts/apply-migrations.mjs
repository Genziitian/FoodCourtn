#!/usr/bin/env node
// Apply all SQL migrations in supabase/migrations/ to the database
// pointed at by SUPABASE_DB_URL. Idempotent — already-applied bits will
// fail with "already exists" errors that we surface but continue past
// the run as a whole.
//
// Usage: node scripts/apply-migrations.mjs [--reset]
//   --reset   DROP and recreate the public schema before applying

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envPath = path.join(ROOT, '.env');
const envText = await fs.readFile(envPath, 'utf8').catch(() => '');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter(l => l && !l.trim().startsWith('#'))
    .map(l => l.split('=', 2))
    .filter(p => p.length === 2)
    .map(([k, v]) => [k.trim(), v.trim()]),
);

const DB_URL = env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('SUPABASE_DB_URL not set in .env');
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');

const client = new pg.Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

console.log('→ Connecting to', DB_URL.replace(/:[^:@]+@/, ':****@'));
await client.connect();
console.log('✓ Connected');

if (reset) {
  console.log('→ Resetting public schema (--reset)');
  await client.query(`drop schema if exists public cascade; create schema public; grant all on schema public to postgres, anon, authenticated, service_role;`);
  console.log('✓ Schema reset');
}

const dir = path.join(ROOT, 'supabase', 'migrations');
const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();

let okCount = 0;
let failCount = 0;
const failures = [];

for (const file of files) {
  const sql = await fs.readFile(path.join(dir, file), 'utf8');
  console.log(`\n→ Applying ${file} (${sql.length} bytes)`);
  try {
    await client.query(sql);
    console.log(`✓ ${file}`);
    okCount++;
  } catch (e) {
    failCount++;
    failures.push({ file, message: e.message });
    console.error(`✗ ${file}: ${e.message.split('\n')[0]}`);
  }
}

await client.end();

console.log(`\nDone: ${okCount} ok, ${failCount} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(` - ${f.file}: ${f.message.split('\n')[0]}`));
}
process.exit(failures.length === 0 ? 0 : 1);
