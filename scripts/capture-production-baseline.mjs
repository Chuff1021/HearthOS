import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const outputDir = process.env.HEARTHOS_BACKUP_DIR || path.join(os.homedir(), "HearthOS-secure-backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(outputDir, `production-baseline-${stamp}.json`);
const sql = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 10 });

const checksumTables = new Set([
  "organizations", "users", "customers", "properties", "fireplace_units", "jobs",
  "job_assignments", "job_checklists", "job_checklist_items", "job_photos", "job_notes",
  "invoices", "invoice_line_items", "payments", "estimates", "estimate_line_items",
  "inventory_items", "vendors", "purchase_orders", "purchase_order_line_items", "bills",
  "bill_line_items", "audit_logs", "qb_sync_status", "hearth_jobs_store",
  "hearth_core_data_store", "hearth_meeks_jobs_store", "hearth_projects",
]);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function stableDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function tableExists(name) {
  const rows = await sql`select to_regclass(${`public.${name}`})::text as relation`;
  return Boolean(rows[0]?.relation);
}

async function tableStats(name) {
  const identifier = quoteIdentifier(name);
  const countRows = await sql.unsafe(`select count(*)::bigint::text as count from public.${identifier}`);
  const result = { count: countRows[0]?.count || "0" };

  if (checksumTables.has(name) && Number(result.count) <= 100000) {
    const checksumRows = await sql.unsafe(`
      select md5(coalesce(string_agg(row_hash, '' order by row_hash), '')) as checksum
      from (
        select md5(to_jsonb(t)::text) as row_hash
        from public.${identifier} t
      ) rows
    `);
    result.checksum = checksumRows[0]?.checksum || null;
  }
  return result;
}

async function organizationSummary() {
  if (!(await tableExists("organizations"))) return [];
  return sql`
    select
      o.id::text,
      o.name,
      o.slug,
      coalesce(o.qb_connected, false) as "quickBooksConnected",
      (select count(*)::int from customers c where c.org_id = o.id) as customers,
      (select count(*)::int from invoices i where i.org_id = o.id) as invoices,
      (select coalesce(sum(i.total_amount), 0)::text from invoices i where i.org_id = o.id) as "invoiceTotal",
      (select coalesce(sum(i.balance), 0)::text from invoices i where i.org_id = o.id) as "invoiceBalance",
      (select count(*)::int from payments p where p.org_id = o.id) as payments,
      (select coalesce(sum(p.amount), 0)::text from payments p where p.org_id = o.id) as "paymentTotal",
      (select count(*)::int from inventory_items ii where ii.org_id = o.id) as "inventoryItems",
      (select count(*)::int from vendors v where v.org_id = o.id) as vendors,
      (select count(*)::int from estimates e where e.org_id = o.id) as estimates,
      (select count(*)::int from purchase_orders po where po.org_id = o.id) as "purchaseOrders",
      (select count(*)::int from bills b where b.org_id = o.id) as bills
    from organizations o
    order by o.created_at asc
  `;
}

try {
  const tableRows = await sql`
    select table_name as name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `;
  const tables = {};
  for (const row of tableRows) tables[row.name] = await tableStats(row.name);

  const organizations = await organizationSummary();
  const payload = {
    capturedAt: new Date().toISOString(),
    purpose: "Pre-multitenant migration production reconciliation baseline",
    containsCustomerPII: false,
    organizations,
    tables,
    digest: stableDigest({ organizations, tables }),
  };

  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await chmod(outputDir, 0o700);
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    ok: true,
    outputPath,
    organizationCount: organizations.length,
    tableCount: tableRows.length,
    digest: payload.digest,
  }, null, 2));
} finally {
  await sql.end();
}
