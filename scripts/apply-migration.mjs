#!/usr/bin/env bun
// Apply a single .sql migration file to the database in DATABASE_URL.
// Usage: DATABASE_URL=... bun scripts/apply-migration.mjs src/db/migrations/0002_qb_estimates_pos_bills.sql
//
// Splits on Drizzle's `--> statement-breakpoint` marker, runs each statement
// in its own query so PG diagnostics point at the right line. Safe to re-run
// because the SQL files use IF NOT EXISTS / DO $$ blocks.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import postgres from 'postgres';

// Pick up DATABASE_URL from .env.local if not already in env
config({ path: resolve(process.cwd(), '.env.local') });

const file = process.argv[2];
if (!file) {
  console.error('Usage: bun scripts/apply-migration.mjs <path-to-sql-file>');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env.local or pass it inline.');
  process.exit(1);
}

const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
const statements = sql
  .split(/-->\s*statement-breakpoint/g)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${statements.length} statements from ${file}...`);

const client = postgres(url, { max: 1 });

let applied = 0;
try {
  for (const stmt of statements) {
    try {
      await client.unsafe(stmt);
      applied++;
    } catch (err) {
      console.error(`\nStatement #${applied + 1} failed:`);
      console.error(stmt.split('\n').slice(0, 6).join('\n') + (stmt.split('\n').length > 6 ? '\n  ...' : ''));
      console.error(`\nError: ${err.message}`);
      throw err;
    }
  }
  console.log(`\n✓ Applied ${applied}/${statements.length} statements successfully.`);
} finally {
  await client.end();
}
