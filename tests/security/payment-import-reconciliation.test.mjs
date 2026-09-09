import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { centerRun, withCenterPostgres } from '../quality/center-local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orgA = id(1), orgB = id(2), customerA = id(3), customerB = id(4), invoiceA = id(5), invoiceB = id(6), foreignInvoice = id(7);
const input = { orgId: orgA, invoiceId: invoiceA, amount: 40, paymentMethod: 'credit_card',
  transactionId: 'synthetic-square-payment', paidAt: new Date('2026-09-01T12:00:00Z'), notes: 'Synthetic note only' };
const quote = s => `"${s.replaceAll('"', '""')}"`;
const literal = s => `'${String(s).replaceAll("'", "''")}'`;
const review = error => error.code === 'PAYMENT_IMPORT_REVIEW_REQUIRED';
let compiled;
async function compile() {
  if (compiled) return compiled;
  const files = { schema: 'src/db/schema.ts', record: 'src/lib/invoices/record-payment.ts',
    store: 'src/lib/invoices/payment-recording-store.ts', helper: 'src/lib/invoices/payment-import-reconciliation.ts',
    sync: 'src/lib/quickbooks/sync.ts' };
  const inline = {
    db: 'export * from "fixture-schema"; export const db = __fixture.db;',
    org: 'export const getOrCreateDefaultOrg = async () => { throw Error("Default-org lookup forbidden"); };',
    client: 'export class QuickBooksClient {}; export const createQuickBooksClient = () => __fixture.client;',
  };
  const aliases = { 'fixture-schema': 'schema', 'fixture-record': 'record', 'fixture-store': 'store',
    'fixture-helper': 'helper', 'fixture-sync': 'sync', '@/db': 'db', '@/lib/org': 'org',
    '@/lib/quickbooks/sync': 'sync', './client': 'client', './payment-recording-store': 'store',
    '@/lib/invoices/payment-import-reconciliation': 'helper' };
  const result = await build({ stdin: { contents: `export * from 'fixture-schema'; export * from 'fixture-record';
    export * from 'fixture-store'; export * from 'fixture-helper'; export {persistPaymentsToDb} from 'fixture-sync';`,
    loader: 'ts', resolveDir: root }, absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'offline-import-boundaries', setup(b) {
      b.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (['node:crypto', 'drizzle-orm', 'drizzle-orm/pg-core'].includes(name)) return { path: name, external: true };
        if (!aliases[name]) throw new Error(`Unapproved dependency ${name}`);
        return { path: aliases[name], namespace: 'import-fixture' };
      });
      b.onLoad({ filter: /.*/, namespace: 'import-fixture' }, async ({ path: name }) => ({
        contents: inline[name] ?? await readFile(path.join(root, files[name]), 'utf8'), loader: 'ts',
      }));
    } }],
  });
  compiled = result.outputFiles[0].text;
  return compiled;
}
async function load(fixture = {}) {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', '__fixture', 'fetch', 'console', await compile())(
    require, loaded, loaded.exports, fixture, () => { throw Error('Network forbidden'); },
    { ...console, error: (...args) => fixture.errors?.push(args) });
  return loaded.exports;
}
async function createSchema(sql, schema) {
  const dialect = new PgDialect();
  for (const value of Object.values(schema)) if (value?.enumName && value?.enumValues) {
    await sql.unsafe(`CREATE TYPE ${quote(value.enumName)} AS ENUM (${value.enumValues.map(literal).join(',')})`);
  }
  const tables = new Set();
  function include(table) {
    if (tables.has(table)) return;
    tables.add(table); getTableConfig(table).foreignKeys.forEach(fk => include(fk.reference().foreignTable));
  }
  [schema.organizations, schema.customers, schema.invoices, schema.payments, schema.auditLogs].forEach(include);
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => {
      let ddl = `${quote(c.name)} ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${c.isUnique ? ' UNIQUE' : ''}`;
      if (c.default !== undefined) {
        const v = c.default;
        ddl += ` DEFAULT ${v && typeof v.getSQL === 'function' ? dialect.sqlToQuery(v).sql
          : typeof v === 'object' ? `${literal(JSON.stringify(v))}::jsonb` : typeof v === 'string' ? literal(v) : String(v)}`;
      }
      return ddl;
    });
    await sql.unsafe(`CREATE TABLE ${quote(config.name)} (${columns.join(',')})`);
  }
  for (const table of tables) {
    const config = getTableConfig(table);
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      await sql.unsafe(`ALTER TABLE ${quote(config.name)} ADD CONSTRAINT ${quote(fk.getName())}
        FOREIGN KEY (${ref.columns.map(c => quote(c.name)).join(',')}) REFERENCES ${quote(getTableConfig(ref.foreignTable).name)}
        (${ref.foreignColumns.map(c => quote(c.name)).join(',')}) ON DELETE ${fk.onDelete ?? 'no action'} ON UPDATE ${fk.onUpdate ?? 'no action'}`);
    }
    for (const { config: index } of config.indexes) await sql.unsafe(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(index.name)}
      ON ${quote(config.name)} (${index.columns.map(c => quote(c.name)).join(',')})`);
  }
}

test('new marked payment imports: actual recorder/importer, temporary PostgreSQL and fake QB', { timeout: 150_000 }, async t => {
  const schema = await load();
  await withCenterPostgres(async ({ sql, connect, directory }) => {
    await createSchema(sql, schema);
    await sql`SET client_min_messages TO WARNING`;
    const password = randomBytes(20).toString('hex');
    await sql.unsafe(`CREATE ROLE import_runtime LOGIN PASSWORD ${literal(password)}`);
    await sql`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO import_runtime`;
    const client = connect('import_runtime', password);
    const db = drizzle(client);
    const count = async table => Number((await sql.unsafe(`SELECT count(*) AS n FROM ${quote(table)}`))[0].n);
    const snapshot = async () => ({ payments: await sql`SELECT * FROM payments ORDER BY id`, invoices: await sql`SELECT * FROM invoices ORDER BY id`,
      audit: await sql`SELECT * FROM audit_logs ORDER BY id` });
    let f, api;
    async function seed() {
      await sql`TRUNCATE organizations CASCADE`;
      await sql`INSERT INTO organizations (id,name,slug,qb_realm_id,qb_access_token,qb_refresh_token) VALUES
        (${orgA},'Synthetic','default','realm-a','synthetic-access','synthetic-refresh'),(${orgB},'Foreign','foreign','realm-b','foreign-access','foreign-refresh')`;
      await sql`INSERT INTO customers (id,org_id,qb_customer_id,first_name,last_name) VALUES
        (${customerA},${orgA},'201','Synthetic','Customer'),(${customerB},${orgB},'202','Foreign','Customer')`;
      for (const [key, org, customer, number, qb] of [[invoiceA, orgA, customerA, 'INV-A', '301'],
        [invoiceB, orgA, customerA, 'INV-B', '302'], [foreignInvoice, orgB, customerB, 'FOREIGN', '303']]) {
        await sql`INSERT INTO invoices (id,org_id,customer_id,invoice_number,qb_invoice_id,issue_date,subtotal,total_amount,balance,status)
          VALUES (${key},${org},${customer},${number},${qb},'2026-09-01','100.00','100.00','100.00','sent')`;
      }
      f = { db, calls: [], errors: [], lost: true, rows: [], client: {
        setRealmId: () => {}, setTokens: () => {}, getTokens: () => null,
        async createPayment(payload) {
          f.calls.push(payload); const payment = { ...payload, Id: String(400 + f.calls.length) }; f.rows.push(payment);
          if (f.gate) await f.gate;
          if (f.lost) throw Error('synthetic-private-provider-error');
          return payment;
        },
      } };
      api = await load(f);
    }
    const record = (patch = {}) => api.recordInvoicePayment({ ...input, ...patch });
    const importRows = (rows = f.rows, org = orgA) => api.persistPaymentsToDb(org, rows);
    const scenario = (name, run) => t.test(name, async () => { await seed(); await run(); });

    await scenario('lost export then actual import twice attaches one existing allocation and completion', async () => {
      const result = await record(); assert.equal(result.recorded, true); assert.equal(result.qbExportStatus, 'review_required');
      const before = await snapshot(); const local = before.payments[0];
      assert.equal(f.rows[0].PrivateNote, `HearthOS payment: ${local.id}\nSynthetic note only`);
      assert.equal(await importRows(), 1); assert.equal(await importRows(), 1);
      const after = await snapshot(); assert.equal(after.payments.length, 1); assert.equal(after.audit.length, 2);
      assert.deepEqual({ ...after.payments[0], qb_payment_id: null }, before.payments[0]);
      assert.deepEqual(after.invoices, before.invoices); assert.equal(after.payments[0].qb_payment_id, '401');
      assert.equal(after.audit.find(row => row.action === 'complete').new_value.paymentId, local.id);
      assert.equal(f.calls.length, 1); assert.equal((await record()).qbExportStatus, 'exported'); assert.equal(f.calls.length, 1);
    });
    await scenario('recognized marker unknown payment never falls back to normal insert', async () => {
      await record(); const bad = { ...f.rows[0], PrivateNote: `HearthOS payment: ${id(999)}\nSynthetic` };
      const before = await snapshot(); await assert.rejects(importRows([bad]), review); assert.deepEqual(await snapshot(), before);
    });
    await scenario('malformed recognized marker fails closed before any batch insertion', async () => {
      await record(); const good = f.rows[0]; const before = await snapshot();
      for (const PrivateNote of ['HearthOS payment: nope\n', `HearthOS payment: ${good.PrivateNote.split('\n')[0].slice(18)}`,
        `prefix ${good.PrivateNote}`, good.PrivateNote.toLowerCase(), good.PrivateNote + '\nHearthOS payment: duplicate',
        'HearthOS payment: ' + 'x'.repeat(4001)]) {
        await assert.rejects(importRows([{ ...good, PrivateNote }]), review);
      }
      assert.deepEqual(await snapshot(), before);
    });
    await scenario('strict provider identity, cents, date, customer, one invoice line and unapplied contract', async () => {
      await record(); const good = f.rows[0]; const before = await snapshot();
      const patches = [{ Id: 'QB-401' }, { Id: 401 }, { Id: '9'.repeat(51) }, { TotalAmt: 39 }, { TotalAmt: '40' }, { TotalAmt: 40.001 },
        { TotalAmt: 0 }, { CustomerRef: { value: '202' } }, { CustomerRef: { value: 'missing' } }, { TxnDate: '2026-09-02' },
        { UnappliedAmt: 1 }, { CurrencyRef: { value: 'CAD' } }, { Line: [] }, { Line: [...good.Line, ...good.Line] },
        { Line: [{ Amount: 39, LinkedTxn: good.Line[0].LinkedTxn }] }, { Line: [{ Amount: 40, LinkedTxn: null }] },
        { Line: [null] }, { Line: [{ Amount: 40, LinkedTxn: [null] }] }, { Line: [{ Amount: 40, LinkedTxn: '301' }] },
        { Line: [{ Amount: 40, LinkedTxn: [{ TxnId: '301', TxnType: 'Estimate' }] }] },
        { Line: [{ Amount: 40, LinkedTxn: [{ TxnId: '302', TxnType: 'Invoice' }] }] },
        { Line: [{ Amount: 40, LinkedTxn: [...good.Line[0].LinkedTxn, ...good.Line[0].LinkedTxn] }] }];
      for (const patch of patches) await assert.rejects(importRows([{ ...good, ...patch }]), review);
      assert.deepEqual(await snapshot(), before);
    });
    await scenario('documented singleton LinkedTxn object normalizes to one exact invoice allocation', async () => {
      await record(); const good = f.rows[0]; const singleton = { ...good, Line: [{ ...good.Line[0], LinkedTxn: good.Line[0].LinkedTxn[0] }] };
      assert.equal(await importRows([singleton]), 1); assert.equal(await importRows(), 1);
      assert.equal(await count('payments'), 1); assert.equal(await count('audit_logs'), 2);
      await assert.rejects(importRows([{ ...singleton, Line: [{ Amount: 40, LinkedTxn: { TxnId: '302', TxnType: 'Invoice' } }] }]), review);
      await assert.rejects(importRows([{ ...singleton, Line: [{ Amount: 40, LinkedTxn: { TxnId: '301', TxnType: 'Estimate' } }] }]), review);
    });
    await scenario('principal-only export reconciles but gross including an unallocated fee does not', async () => {
      await record({ amount: 100 }); const good = f.rows[0]; const before = await snapshot();
      await assert.rejects(importRows([{ ...good, TotalAmt: 103.5, Line: [{ ...good.Line[0], Amount: 103.5 }] }]), review);
      assert.deepEqual(await snapshot(), before); assert.equal(await importRows(), 1);
      assert.equal((await sql`SELECT amount FROM payments`)[0].amount, '100.00'); assert.equal(await count('payments'), 1);
    });
    await scenario('foreign org and changed current realm cannot attach marked provider payment', async () => {
      await record(); const before = await snapshot(); await assert.rejects(importRows(f.rows, orgB), review);
      await sql`UPDATE organizations SET qb_realm_id='reconnected' WHERE id=${orgA}`;
      await assert.rejects(importRows(), review); assert.deepEqual(await snapshot(), before);
    });
    await scenario('claim historical flag, transaction, cents, realm, invoice and entity scope match exactly', async () => {
      await record(); const [original] = await sql`SELECT * FROM audit_logs WHERE action='claim'`;
      for (const patch of [{ historical: true }, { historical: undefined }, { transactionId: 'other' }, { cents: 3999 },
        { realmId: 'realm-b' }, { paymentId: id(999) }, { invoiceId: invoiceB }]) {
        await sql`UPDATE audit_logs SET new_value=${sql.json({ ...original.new_value, ...patch })} WHERE id=${original.id}`;
        await assert.rejects(importRows(), review); assert.equal((await sql`SELECT qb_payment_id FROM payments`)[0].qb_payment_id, null);
      }
      await sql`UPDATE audit_logs SET new_value=${sql.json(original.new_value)},org_id=${orgB} WHERE id=${original.id}`;
      await assert.rejects(importRows(), review); assert.equal(await count('audit_logs'), 1);
    });
    await scenario('missing claim and changed local amount/transaction never create a new allocation', async () => {
      await record(); const before = await snapshot(); const local = before.payments[0];
      await sql`UPDATE payments SET amount='39.00' WHERE id=${local.id}`; await assert.rejects(importRows(), review);
      await sql`UPDATE payments SET amount='40.00',transaction_id='changed' WHERE id=${local.id}`; await assert.rejects(importRows(), review);
      await sql`UPDATE payments SET transaction_id=${local.transaction_id} WHERE id=${local.id}`;
      await sql`DELETE FROM audit_logs`; await assert.rejects(importRows(), review); assert.equal(await count('payments'), 1);
    });
    await scenario('customer and invoice associations cannot be foreign or reassigned', async () => {
      await record(); await sql`UPDATE invoices SET customer_id=${customerB} WHERE id=${invoiceA}`;
      await assert.rejects(importRows(), review);
      await sql`UPDATE invoices SET customer_id=${customerA},qb_invoice_id='999' WHERE id=${invoiceA}`;
      await assert.rejects(importRows(), review); assert.equal(await count('payments'), 1); assert.equal(await count('audit_logs'), 1);
    });
    await scenario('prior historical duplicate is not merged or overwritten', async () => {
      await record(); await sql`INSERT INTO payments (org_id,invoice_id,qb_payment_id,amount,transaction_id)
        VALUES (${orgA},${invoiceA},'401','40.00','historical-import')`;
      const before = await snapshot(); await assert.rejects(importRows(), review); assert.deepEqual(await snapshot(), before);
    });
    await scenario('conflicting existing QB attachment or completion remains review without overwrite', async () => {
      await record(); await sql`UPDATE payments SET qb_payment_id='999'`; let before = await snapshot();
      await assert.rejects(importRows(), review); assert.deepEqual(await snapshot(), before);
      await sql`UPDATE payments SET qb_payment_id=NULL`; await importRows();
      await sql`UPDATE audit_logs SET new_value=jsonb_set(new_value,'{qbPaymentId}','"999"') WHERE action='complete'`;
      before = await snapshot(); await assert.rejects(importRows(), review); assert.deepEqual(await snapshot(), before);
    });
    await scenario('repeated identical batch entries reconcile once; conflicting markers do not partly attach', async () => {
      await record(); const good = f.rows[0]; const before = await snapshot();
      await assert.rejects(importRows([good, { ...good, Id: '402' }]), review);
      await assert.rejects(importRows([good, { ...good, TotalAmt: 39 }]), review);
      await assert.rejects(importRows([good, { ...good, PrivateNote: undefined }]), review);
      assert.deepEqual(await snapshot(), before); assert.equal(await importRows([good, good]), 1);
    });
    await scenario('unmarked legacy imports retain ordinary insert/update semantics and no automatic merge', async () => {
      await record(); const legacy = { ...f.rows[0], PrivateNote: undefined };
      assert.equal(await importRows([legacy]), 1); assert.equal(await count('payments'), 2); assert.equal(await count('audit_logs'), 1);
      assert.equal(await importRows([legacy]), 1); assert.equal(await count('payments'), 2);
      const updated = { ...legacy, Line: [{ ...legacy.Line[0], Amount: 35 }] };
      assert.equal(await importRows([updated]), 1);
      assert.equal((await sql`SELECT amount FROM payments WHERE qb_payment_id='401'`)[0].amount, '35.00');
      assert.equal((await sql`SELECT amount FROM payments WHERE qb_payment_id IS NULL`)[0].amount, '40.00');
    });
    await scenario('mixed marked and unmarked batch counts each path without duplicate allocation', async () => {
      await record(); const legacy = { ...f.rows[0], Id: '888', PrivateNote: 'Ordinary legacy payment',
        Line: [{ Amount: 20, LinkedTxn: [{ TxnId: '302', TxnType: 'Invoice' }] }], TotalAmt: 20 };
      assert.equal(await importRows([f.rows[0], legacy]), 2); assert.equal(await count('payments'), 2);
      assert.equal(await importRows([f.rows[0], legacy]), 2); assert.equal(await count('payments'), 2);
    });
    await scenario('recognized invalid marker blocks mixed legacy insertion rather than falling back', async () => {
      await record(); const good = f.rows[0]; const before = await snapshot();
      await assert.rejects(importRows([{ ...good, PrivateNote: 'HearthOS payment: malformed' }, { ...good, Id: '888', PrivateNote: undefined }]), review);
      assert.deepEqual(await snapshot(), before);
    });
    await scenario('concurrent imports serialize to one attachment and one completion', async () => {
      await record(); const results = await Promise.all(Array.from({ length: 8 }, () => importRows()));
      assert.deepEqual(results, Array(8).fill(1)); assert.equal(await count('payments'), 1); assert.equal(await count('audit_logs'), 2);
      assert.equal(f.calls.length, 1);
    });
    await scenario('actual importer completes before delayed original export response without false failure', async () => {
      f.lost = false; let release; f.gate = new Promise(resolve => { release = resolve; });
      const attempt = record();
      try {
        while (!f.rows.length) await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(await importRows(), 1); release();
        const result = await attempt; assert.equal(result.qbExportStatus, 'exported'); assert.equal(result.qbPaymentId, '401');
        assert.equal(await count('payments'), 1); assert.equal(await count('audit_logs'), 2); assert.equal(f.calls.length, 1);
      } finally { release(); await attempt; }
    });
    await scenario('original completion wins before import and repeated import remains idempotent', async () => {
      f.lost = false; assert.equal((await record()).qbExportStatus, 'exported'); const before = await snapshot();
      assert.equal(await importRows(), 1); assert.deepEqual(await snapshot(), before);
    });
    await scenario('concurrent original result/import completion cannot create two allocations', async () => {
      f.lost = false; let release; f.gate = new Promise(resolve => { release = resolve; });
      const attempt = record(); while (!f.rows.length) await new Promise(resolve => setTimeout(resolve, 5));
      const importing = importRows(); release();
      const [result, written] = await Promise.all([attempt, importing]); assert.equal(result.qbExportStatus, 'exported'); assert.equal(written, 1);
      assert.equal(await count('payments'), 1); assert.equal(await count('audit_logs'), 2);
    });
    await scenario('completion insert failure rolls back QB attachment and retry recovers', async () => {
      await record(); const before = await snapshot();
      await sql.unsafe(`CREATE FUNCTION reject_import_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action='complete' THEN RAISE EXCEPTION 'synthetic-private-database-error'; END IF; RETURN NEW; END $$`);
      await sql`CREATE TRIGGER reject_import_completion BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_import_completion()`;
      try {
        await assert.rejects(importRows(), error => review(error) && !String(error).includes('synthetic-private'));
        assert.deepEqual(await snapshot(), before); assert.equal(f.errors.length, 0);
      }
      finally { await sql`DROP TRIGGER reject_import_completion ON audit_logs`; }
      assert.equal(await importRows(), 1); assert.equal(await count('payments'), 1); assert.equal(f.calls.length, 1);
    });
    await scenario('suppressed attachment update cannot publish a false completion event', async () => {
      await record(); const before = await snapshot();
      await sql.unsafe(`CREATE FUNCTION suppress_import_attachment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
      await sql`CREATE TRIGGER suppress_import_attachment BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION suppress_import_attachment()`;
      try { await assert.rejects(importRows(), review); assert.deepEqual(await snapshot(), before); }
      finally { await sql`DROP TRIGGER suppress_import_attachment ON payments`; }
    });
    await scenario('later invalid marked row rolls back earlier valid attachment in same batch', async () => {
      await record(); await record({ invoiceId: invoiceB, transactionId: 'second-square-payment' });
      const before = await snapshot(); const bad = { ...f.rows[1], PrivateNote: `HearthOS payment: ${id(999)}\nSynthetic` };
      await assert.rejects(importRows([f.rows[0], bad]), review); assert.deepEqual(await snapshot(), before);
    });
    await scenario('new process reconciles lost export claim through actual importer without provider access', async () => {
      await record();
      const child = `const postgres=require('postgres');const {drizzle}=require('drizzle-orm/postgres-js');
        const sql=postgres(${JSON.stringify({ host: directory, port: 55439, database: 'postgres', user: 'import_runtime', password, ssl: false, max: 1 })});
        const f={db:drizzle(sql)},m={exports:{}};new Function('require','module','exports','__fixture','fetch',${JSON.stringify(await compile())})
          (require,m,m.exports,f,()=>{throw Error('network forbidden')});
        (async()=>{const n=await m.exports.persistPaymentsToDb(${JSON.stringify(orgA)},${JSON.stringify(f.rows)});
          if(n!==1)throw Error('missing reconciliation');await sql.end();})().catch(e=>{console.error(e);process.exit(1)});`;
      centerRun(process.execPath, ['-e', child], { cwd: root });
      assert.equal(await importRows(), 1); assert.equal(await count('payments'), 1); assert.equal(await count('audit_logs'), 2); assert.equal(f.calls.length, 1);
    });
    t.diagnostic('Actual persistPaymentsToDb + reconciliation + recorder/store; temporary schema-derived PostgreSQL with real FKs/uniqueness; fake QB and denied network; no environment/provider/production access. Historical unmarked duplicates intentionally remain unchanged.');
  });
});
