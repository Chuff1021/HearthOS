#!/usr/bin/env bun
// Run a full QuickBooks → local DB sync from your laptop, bypassing the
// 60s Vercel function timeout. Uses the QB tokens stored on the default
// organization row.
//
// Usage:
//   bun scripts/run-qb-sync.ts            # full sync (everything)
//   bun scripts/run-qb-sync.ts customers  # only customers
//   bun scripts/run-qb-sync.ts vendors items
//
// Requires DATABASE_URL, QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET in .env.local

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env.local');
  process.exit(1);
}
if (!process.env.QUICKBOOKS_CLIENT_ID || !process.env.QUICKBOOKS_CLIENT_SECRET) {
  console.error('QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET not set in .env.local');
  process.exit(1);
}

const { db, organizations } = await import('@/db');
const { eq } = await import('drizzle-orm');
const { createQuickBooksClient } = await import('@/lib/quickbooks/client');
const sync = await import('@/lib/quickbooks/sync');
const { getOrCreateDefaultOrg } = await import('@/lib/org');

const args = process.argv.slice(2);
const allEntities = ['customers', 'items', 'vendors', 'invoices', 'payments', 'estimates', 'pos', 'bills'];
const wanted = args.length > 0 ? args : ['all'];

const org = await getOrCreateDefaultOrg();
if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
  console.error('Org has no QB tokens. Connect QuickBooks first.');
  process.exit(1);
}

const client = createQuickBooksClient();
client.setTokens({
  access_token: org.qbAccessToken,
  refresh_token: org.qbRefreshToken,
  expires_in: 3600,
  x_refresh_token_expires_in: 8726400,
  token_type: 'bearer',
});
client.setRealmId(org.qbRealmId);

// Refresh proactively so a long sync doesn't 401 mid-flight.
console.log('Refreshing QB access token...');
try {
  const fresh = await client.refreshAccessToken();
  await db.update(organizations).set({
    qbAccessToken: fresh.access_token,
    qbRefreshToken: fresh.refresh_token,
    qbTokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000),
    updatedAt: new Date(),
  }).where(eq(organizations.id, org.id));
  console.log('Token refreshed.');
} catch (e: any) {
  console.warn('Refresh failed; continuing with stored token.', e?.message || e);
}

function shouldRun(name: string) {
  return wanted.includes('all') || wanted.includes(name);
}

const t0 = Date.now();
const results: Record<string, { fetched: number; persisted: number; ms: number; error?: string }> = {};

async function runStep<T>(label: string, fetch: () => Promise<T[]>, persist: (rows: T[]) => Promise<number>) {
  if (!shouldRun(label)) return;
  const start = Date.now();
  try {
    process.stdout.write(`[${label}] fetching... `);
    const rows = await fetch();
    process.stdout.write(`${rows.length} fetched, persisting... `);
    const persisted = await persist(rows);
    const ms = Date.now() - start;
    results[label] = { fetched: rows.length, persisted, ms };
    console.log(`${persisted} persisted in ${(ms / 1000).toFixed(1)}s`);
  } catch (err: any) {
    const ms = Date.now() - start;
    results[label] = { fetched: 0, persisted: 0, ms, error: err?.message || String(err) };
    console.log(`FAILED in ${(ms / 1000).toFixed(1)}s: ${err?.message || err}`);
  }
}

await runStep('customers', () => client.getAllCustomers(), (rows) => sync.persistCustomersToDb(org.id, rows));
await runStep('items',     () => client.getAllItems(),     (rows) => sync.persistItemsToDb(org.id, rows));
await runStep('vendors',   () => client.getAllVendors() as any, (rows) => sync.persistVendorsToDb(org.id, rows as any));
await runStep('invoices',  () => client.getAllInvoices(),  (rows) => sync.persistInvoicesToDb(org.id, rows));
await runStep('estimates', () => client.getAllEstimates() as any, (rows) => sync.persistEstimatesToDb(org.id, rows as any));
await runStep('pos',       () => client.getAllPurchaseOrders() as any, (rows) => sync.persistPurchaseOrdersToDb(org.id, rows as any));
await runStep('bills',     () => client.getAllBills() as any, (rows) => sync.persistBillsToDb(org.id, rows as any));
await runStep('payments',  () => client.getAllPayments(),  (rows) => sync.persistPaymentsToDb(org.id, rows));

console.log('\n=== SUMMARY ===');
for (const [k, v] of Object.entries(results)) {
  console.log(`${k.padEnd(12)} fetched=${v.fetched.toString().padStart(6)}  persisted=${v.persisted.toString().padStart(6)}  ${(v.ms / 1000).toFixed(1)}s${v.error ? '  ERROR: ' + v.error : ''}`);
}
console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

process.exit(0);
