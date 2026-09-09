import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Reuse the previously reviewed recovery operator, without applying tenant migrations.
// It verifies encrypted bytes, uses Keychain internally, and destroys its private
// socket-only temporary cluster on completion. No production connection is opened.
const helper = path.resolve('../HearthOS-dealer-readiness/scripts/testing/local-postgres.mjs');
const { withLocalPostgres, restoreEncryptedArchive, fingerprintTables } = await import(pathToFileURL(helper).href);
const archive = process.argv[2];
if (!archive?.endsWith('.dump.enc')) throw new Error('Pass the exact approved encrypted archive path.');
await withLocalPostgres(async cluster => {
  const digest = await restoreEncryptedArchive(cluster, archive);
  const before = await fingerprintTables(cluster.sql);
  let counts, financial, references;
  await cluster.sql.begin('read only', async sql => {
    [counts] = await sql`select
      (select count(*)::int from organizations) organizations,
      (select count(*)::int from customers) customers,
      (select count(*)::int from invoices) invoices,
      (select count(*)::int from payments) payments,
      (select count(*)::int from hearth_jobs_store) jobs`;
    [financial] = await sql`select
      (select coalesce(sum(total_amount),0)::text from invoices) invoice_total,
      (select coalesce(sum(balance),0)::text from invoices) invoice_balance,
      (select coalesce(sum(amount),0)::text from payments) payment_total`;
    [references] = await sql`select count(distinct a.id)::int as open_invoice_reference_collisions
      from invoices a join invoices b on a.org_id=b.org_id and a.id<>b.id
      and b.qb_invoice_id=regexp_replace(a.invoice_number, '^QB-', '', 'i')
      where a.balance>0`;
  });
  const after = await fingerprintTables(cluster.sql);
  assert.deepEqual(after, before, 'Restored original data changed during read-only checks');
  console.log(JSON.stringify({ archive: path.basename(archive), digest, tables: Object.keys(before).length,
    counts, financial, references, originalDataUnchanged: true, productionAccess: false,
    authenticatedAppAcceptance: false }, null, 2));
});
