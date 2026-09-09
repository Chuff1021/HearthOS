import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
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
const input = { orgId: orgA, invoiceId: invoiceA, amount: 10.29, paymentMethod: 'credit_card',
  transactionId: 'square-synthetic-payment', paidAt: new Date('2026-09-01T12:00:00Z'), notes: 'Synthetic payment only' };
const deniedNetwork = () => { throw new Error('Network forbidden in payment recording tests'); };
const quote = value => `"${value.replaceAll('"', '""')}"`;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const pgError = code => error => error.code === code || error.cause?.code === code;

let compiled;
async function compile() {
  if (compiled) return compiled;
  const files = { schema: 'src/db/schema.ts', record: 'src/lib/invoices/record-payment.ts',
    store: 'src/lib/invoices/payment-recording-store.ts', client: 'src/lib/quickbooks/client.ts' };
  const inline = {
    db: 'export * from "payment-schema"; export const db = __fixture.db;',
    org: 'export const getOrCreateDefaultOrg = async () => { __fixture.orgReads++; return { id: __fixture.orgId }; };',
    sync: 'export const getClientFromTokens = (...args) => { __fixture.clientCalls.push(args); return __fixture.clientFactory ? __fixture.clientFactory(...args) : __fixture.client; };',
  };
  const aliases = { 'payment-schema': 'schema', 'payment-record': 'record', 'payment-store': 'store',
    'payment-client': 'client', '@/db': 'db', '@/lib/org': 'org', '@/lib/quickbooks/sync': 'sync',
    './payment-recording-store': 'store' };
  const result = await build({
    stdin: { contents: `export * from 'payment-schema'; export * from 'payment-record';
      export * from 'payment-store'; export * from 'payment-client';`, loader: 'ts', resolveDir: root },
    absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'offline-payment-boundary', setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: specifier }) => {
        if (['node:crypto', 'drizzle-orm', 'drizzle-orm/pg-core'].includes(specifier)) return { path: specifier, external: true };
        if (!aliases[specifier]) throw new Error(`Unapproved dependency: ${specifier}`);
        return { path: aliases[specifier], namespace: 'payment-fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'payment-fixture' }, async ({ path: name }) => ({
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
    require, loaded, loaded.exports, fixture, fixture.fetch ?? deniedNetwork,
    { ...console, error: (...args) => fixture.errors?.push(args) },
  );
  return loaded.exports;
}

async function createSchema(sql, schema) {
  const dialect = new PgDialect();
  for (const value of Object.values(schema)) {
    if (Array.isArray(value?.enumValues)) await sql.unsafe(`CREATE TYPE ${quote(value.enumName)} AS ENUM (${value.enumValues.map(literal).join(', ')})`);
  }
  const tables = new Set();
  function include(table) {
    if (tables.has(table)) return;
    tables.add(table);
    for (const fk of getTableConfig(table).foreignKeys) include(fk.reference().foreignTable);
  }
  [schema.organizations, schema.customers, schema.invoices, schema.payments, schema.auditLogs].forEach(include);
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let ddl = `${quote(column.name)} ${column.getSQLType()}`;
      if (column.primary) ddl += ' PRIMARY KEY';
      if (column.notNull) ddl += ' NOT NULL';
      if (column.isUnique) ddl += ' UNIQUE';
      if (column.default !== undefined) {
        const value = column.default;
        const expression = value && typeof value.getSQL === 'function' ? dialect.sqlToQuery(value).sql
          : typeof value === 'object' ? `${literal(JSON.stringify(value))}::jsonb`
            : typeof value === 'string' ? literal(value) : String(value);
        ddl += ` DEFAULT ${expression}`;
      }
      return ddl;
    });
    await sql.unsafe(`CREATE TABLE ${quote(config.name)} (${columns.join(', ')})`);
  }
  for (const table of tables) {
    const config = getTableConfig(table);
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      await sql.unsafe(`ALTER TABLE ${quote(config.name)} ADD CONSTRAINT ${quote(fk.getName())}
        FOREIGN KEY (${ref.columns.map(c => quote(c.name)).join(', ')})
        REFERENCES ${quote(getTableConfig(ref.foreignTable).name)} (${ref.foreignColumns.map(c => quote(c.name)).join(', ')})
        ON DELETE ${fk.onDelete ?? 'no action'} ON UPDATE ${fk.onUpdate ?? 'no action'}`);
    }
    for (const { config: index } of config.indexes) {
      assert.ok(index.columns.every(column => typeof column.name === 'string'), 'fixture must preserve real index columns');
      await sql.unsafe(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(index.name)} ON ${quote(config.name)} (${index.columns.map(c => quote(c.name)).join(', ')})`);
    }
  }
}

test('payment recording: actual temporary PostgreSQL, real store and fake provider', { timeout: 150_000 }, async t => {
  await withCenterPostgres(async ({ sql, connect, directory }) => {
    const db = drizzle(sql);
    const schema = await load();
    await createSchema(sql, schema);
    let fixture, service, calls;
    const count = async table => Number((await sql`SELECT count(*) AS count FROM ${sql(table)}`)[0].count);
    const record = (overrides = {}) => service.recordInvoicePayment({ ...input, ...overrides });
    const balance = async (invoiceId = invoiceA) => (await sql`SELECT balance FROM invoices WHERE id = ${invoiceId}`)[0].balance;
    async function seed() {
      await sql`TRUNCATE organizations, customers, users, invoices, jobs, properties, fireplace_units, payments, audit_logs`;
      for (const [org, suffix] of [[orgA, 'a'], [orgB, 'b']]) {
        await sql`INSERT INTO organizations ${sql({ id: org, name: 'Synthetic', slug: suffix,
          qb_realm_id: `realm-${suffix}`, qb_access_token: `access-${suffix}`, qb_refresh_token: `refresh-${suffix}` })}`;
      }
      for (const [customer, org, qb] of [[customerA, orgA, '201'], [customerB, orgB, '202']]) {
        await sql`INSERT INTO customers ${sql({ id: customer, org_id: org, qb_customer_id: qb, first_name: 'Synthetic', last_name: 'Customer' })}`;
      }
      for (const [invoice, org, customer, number, qb] of [[invoiceA, orgA, customerA, 'INV-A', '301'],
        [invoiceB, orgA, customerA, 'INV-B', '302'], [foreignInvoice, orgB, customerB, 'FOREIGN', '303']]) {
        await sql`INSERT INTO invoices ${sql({ id: invoice, org_id: org, customer_id: customer, invoice_number: number,
          qb_invoice_id: qb, issue_date: '2026-09-01', subtotal: '100.69', total_amount: '100.69', balance: '100.69' })}`;
      }
      calls = [];
      fixture = { db, orgId: orgA, orgReads: 0, clientCalls: [], errors: [], client: {
        async createPayment(payload) { calls.push(payload); return { ...payload, Id: String(400 + calls.length) }; },
        getTokens: () => null,
      } };
      service = await load(fixture);
    }
    const scenario = async (name, work) => t.test(name, async () => { await seed(); await work(); });

    await scenario('schema enforces payment and audit FKs, PK and QB/invoice uniqueness', async () => {
      assert.equal((await sql`SELECT current_setting('listen_addresses') AS value`)[0].value, '');
      const fks = await sql`SELECT conrelid::regclass::text AS source, confrelid::regclass::text AS target FROM pg_constraint WHERE contype = 'f'`;
      for (const pair of ['payments->organizations', 'payments->invoices', 'audit_logs->organizations', 'audit_logs->users',
        'invoices->customers', 'invoices->jobs', 'customers->organizations']) {
        assert.ok(fks.some(fk => `${fk.source}->${fk.target}` === pair), pair);
      }
      await assert.rejects(sql`INSERT INTO payments (org_id, invoice_id, amount) VALUES (${orgA}, ${id(999)}, 1)`, pgError('23503'));
      await assert.rejects(sql`INSERT INTO audit_logs (org_id, user_id, action, entity_type) VALUES (${orgA}, ${id(999)}, 'claim', 'payment_export')`, pgError('23503'));
      assert.equal((await record()).qbExportStatus, 'exported');
      const [payment] = await sql`SELECT * FROM payments`;
      assert.equal(payment.id, service.paymentRecordingId(orgA, input.transactionId));
      assert.equal(calls[0].PrivateNote, `HearthOS payment: ${payment.id}\n${input.notes}`);
      await assert.rejects(sql`INSERT INTO payments (id, org_id, invoice_id, amount) VALUES (${payment.id}, ${orgA}, ${invoiceB}, 1)`, pgError('23505'));
      await assert.rejects(sql`INSERT INTO payments (org_id, invoice_id, amount, qb_payment_id) VALUES (${orgA}, ${invoiceA}, 1, ${payment.qb_payment_id})`, pgError('23505'));
      const events = await sql`SELECT * FROM audit_logs ORDER BY action`;
      assert.equal(events.length, 2);
      assert.ok(events.every(row => row.user_id === null && row.org_id === orgA && row.created_at));
      assert.equal(events[0].new_value.realmId, 'realm-a');
    });

    await scenario('stable identity and strict nonempty transaction, cents and date validation', async () => {
      for (const transactionId of [undefined, '', ' ', ' tx', 'tx ', 'x'.repeat(101), 'tx\n', 123]) {
        assert.equal((await record({ transactionId })).reason, 'invalid_transaction_id');
      }
      for (const amount of [NaN, Infinity, -1, 0, 0.001, 1.005, 10.291, 100_000_000, '10.29', null]) {
        assert.equal((await record({ amount })).reason, 'invalid_amount');
      }
      assert.equal((await record({ paidAt: new Date(NaN) })).reason, 'invalid_paid_at');
      assert.equal((await record({ paymentMethod: '' })).reason, 'invalid_payment_method');
      assert.equal(await count('payments'), 0);
      assert.equal(fixture.clientCalls.length, 0);
      assert.equal((await record({ amount: 0.29 })).balance, 100.4);
      assert.notEqual(service.paymentRecordingId(orgA, 'tx'), service.paymentRecordingId(orgB, 'tx'));
      assert.notEqual(service.paymentRecordingId(orgA, 'tx'), service.paymentRecordingId(orgA, 'tx', 'claim'));
    });

    await scenario('exact aliases, canonical IDs and default-org compatibility', async () => {
      for (const invoiceNumber of ['INV-A', '301', 'QB-301', invoiceA]) {
        const result = await record({ orgId: undefined, invoiceId: undefined, invoiceNumber });
        assert.equal(result.recorded, true);
        assert.equal(result.invoiceId, invoiceA);
      }
      assert.equal(calls.length, 1);
      assert.equal(fixture.orgReads, 4);
      assert.equal((await record({ invoiceId: invoiceB, transactionId: 'canonical' })).invoiceId, invoiceB);
      assert.equal((await record({ invoiceId: foreignInvoice, transactionId: 'foreign' })).reason, 'invoice_not_found');
      assert.equal((await record({ invoiceId: undefined, invoiceNumber: 'INV' })).reason, 'invoice_not_found');
    });

    await scenario('ambiguous aliases and cross-org customer associations fail closed', async () => {
      await sql`UPDATE invoices SET invoice_number = '301' WHERE id = ${invoiceB}`;
      assert.equal((await record({ invoiceId: undefined, invoiceNumber: '301' })).reason, 'ambiguous_invoice');
      await sql`UPDATE invoices SET invoice_number = 'INV-A' WHERE id = ${invoiceB}`;
      assert.equal((await record({ invoiceId: undefined, invoiceNumber: 'INV-A' })).reason, 'ambiguous_invoice');
      await sql`UPDATE invoices SET customer_id = ${customerB} WHERE id = ${invoiceA}`;
      assert.equal((await record()).reason, 'customer_scope_mismatch');
      assert.equal(await count('payments'), 0);
      assert.equal(await count('audit_logs'), 0);
      assert.equal(calls.length, 0);
    });

    await scenario('concurrent duplicate callbacks see committed local money before one provider call', async () => {
      let enter, release;
      const entered = new Promise(resolve => { enter = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const create = fixture.client.createPayment;
      fixture.client.createPayment = async payload => {
        assert.equal(await count('payments'), 1);
        assert.equal(await count('audit_logs'), 1);
        assert.equal(await balance(), '90.40');
        enter(); await gate; return create(payload);
      };
      const first = record();
      try {
        await Promise.race([entered, first.then(result => assert.fail(JSON.stringify(result)))]);
        const others = await Promise.all(Array.from({ length: 12 }, () => record()));
        assert.ok(others.every(result => result.recorded && result.qbExportStatus === 'review_required'));
        assert.equal(await count('payments'), 1);
      } finally { release(); }
      const result = await first;
      assert.equal(result.qbExportStatus, 'exported');
      assert.equal(calls.length, 1);
      const again = await record();
      assert.equal(again.qbPaymentId, result.qbPaymentId);
      assert.equal(again.qbExportStatus, 'exported');
      assert.equal(await count('audit_logs'), 2);
      assert.equal(calls.length, 1);
    });

    await scenario('two distinct concurrent payments serialize the balance, including fractional dollars', async () => {
      const results = await Promise.all([record({ amount: 40.29, transactionId: 'one' }), record({ amount: 60.4, transactionId: 'two' })]);
      assert.ok(results.every(result => result.recorded && result.qbExportStatus === 'exported'));
      assert.equal(await count('payments'), 2);
      assert.equal(calls.length, 2);
      assert.equal(await balance(), '0.00');
      const [invoice] = await sql`SELECT * FROM invoices WHERE id = ${invoiceA}`;
      assert.equal(invoice.status, 'paid');
      assert.equal(new Date(invoice.paid_at).toISOString(), input.paidAt.toISOString());
      assert.equal((await record({ transactionId: 'overpay', amount: 1 })).balance, 0);
      await sql`UPDATE invoices SET total_amount = 0 WHERE id = ${invoiceB}`;
      const zero = await record({ invoiceId: invoiceB, transactionId: 'zero-total' });
      assert.equal(zero.balance, 0);
      assert.equal(zero.paid, false);
    });

    await scenario('same TX concurrent cross-invoice allocation is stopped by payments PK', async () => {
      const results = await Promise.all([record(), record({ invoiceId: invoiceB })]);
      assert.equal(results.filter(result => result.recorded).length, 1);
      assert.equal(results.find(result => !result.recorded).reason, 'transaction_conflict');
      assert.equal(await count('payments'), 1);
      assert.equal(calls.length, 1);
      const [saved] = await sql`SELECT * FROM payments`;
      assert.equal(await balance(saved.invoice_id), '90.40');
      assert.equal(await balance(saved.invoice_id === invoiceA ? invoiceB : invoiceA), '100.69');
      assert.equal((await record({ invoiceId: saved.invoice_id, amount: 10.28 })).reason, 'transaction_conflict');
    });

    await scenario('transaction identity is independent between organizations', async () => {
      const results = await Promise.all([record(), record({ orgId: orgB, invoiceId: foreignInvoice })]);
      assert.ok(results.every(result => result.recorded));
      assert.equal(await count('payments'), 2);
      assert.equal(calls.length, 2);
      assert.deepEqual(fixture.clientCalls.map(args => args[2]).sort(), ['realm-a', 'realm-b']);
    });

    await scenario('principal 100 allocation exports only 100; card fee accounting remains outside recorder', async () => {
      await sql`UPDATE invoices SET total_amount = 100, balance = 100 WHERE id = ${invoiceA}`;
      // Capture owns the actual intent tests. This fixture models its durable fee evidence.
      // New captures allocate principal, unlike baseline gross allocation. The $3.50
      // is NOT exported as QB income or to a fee account; full fee accounting is not complete.
      const intentId = id(800);
      const evidence = { amountCents: 10350, principalCents: 10000, feeCents: 350 };
      await sql`INSERT INTO audit_logs (id, org_id, action, entity_type, new_value)
        VALUES (${intentId}, ${orgA}, 'reserve', 'synthetic_capture_evidence', ${JSON.stringify(evidence)}::jsonb)`;
      const result = await record({ amount: 100 });
      assert.equal(result.recorded, true);
      assert.equal(result.balance, 0);
      assert.equal(result.paid, true);
      assert.equal(result.qbExportStatus, 'exported');
      const [payment] = await sql`SELECT * FROM payments`;
      assert.equal(payment.amount, '100.00');
      assert.equal(calls[0].TotalAmt, 100);
      assert.equal(calls[0].Line[0].Amount, 100);
      assert.equal(calls[0].Line.length, 1);
      assert.equal(calls[0].UnappliedAmt, undefined);
      const [claim] = await sql`SELECT * FROM audit_logs WHERE action = 'claim'`;
      assert.equal(claim.new_value.cents, 10000);
      service = await load(fixture);
      assert.equal((await record({ amount: 100 })).qbExportStatus, 'exported');
      assert.equal((await record({ amount: 103.5 })).reason, 'transaction_conflict');
      assert.equal(calls.length, 1);
      assert.equal(await count('payments'), 1);
      assert.deepEqual((await sql`SELECT new_value FROM audit_logs WHERE id = ${intentId}`)[0].new_value, evidence);
    });

    await scenario('legacy gross-only callback does not infer a fee or silently cap its QB line', async () => {
      await sql`UPDATE invoices SET total_amount = 100, balance = 100 WHERE id = ${invoiceA}`;
      const result = await record({ amount: 103.5 });
      assert.equal(result.recorded, true);
      assert.equal(result.balance, 0);
      assert.equal((await sql`SELECT amount FROM payments`)[0].amount, '103.50');
      assert.equal(calls[0].TotalAmt, 103.5);
      assert.equal(calls[0].Line[0].Amount, 103.5);
      // Synthetic acceptance proves preservation only, not live QB fee-accounting acceptance.
      assert.equal(result.qbExportStatus, 'exported');
    });

    await scenario('historical random-PK payment reconciles balance without rewriting or QB replay', async () => {
      for (const qbId of [null, 'historic-qb-id']) {
        await sql`TRUNCATE payments, audit_logs`;
        await sql`UPDATE invoices SET balance = 100.69, status = 'sent' WHERE id = ${invoiceA}`;
        await sql`INSERT INTO payments (id, org_id, invoice_id, amount, transaction_id, qb_payment_id, notes)
          VALUES (${id(900)}, ${orgA}, ${invoiceA}, 10.29, ${input.transactionId}, ${qbId}, 'Historical original note')`;
        const before = await sql`SELECT * FROM payments`;
        const result = await record();
        assert.equal(result.recorded, true);
        assert.equal(result.balance, 90.4);
        assert.equal(result.qbExportStatus, 'review_required');
        assert.deepEqual(await sql`SELECT * FROM payments`, before);
        assert.equal((await sql`SELECT new_value FROM audit_logs`)[0].new_value.historical, true);
        await record();
        assert.deepEqual(await sql`SELECT * FROM payments`, before);
      }
      assert.equal(calls.length, 0);
    });

    await scenario('conflicting or duplicate historical allocations never get normalized away', async () => {
      await sql`INSERT INTO payments (org_id, invoice_id, amount, transaction_id) VALUES (${orgA}, ${invoiceB}, 10.29, ${input.transactionId})`;
      assert.equal((await record()).reason, 'transaction_conflict');
      await sql`INSERT INTO payments (org_id, invoice_id, amount, transaction_id) VALUES (${orgA}, ${invoiceA}, 10.29, ${input.transactionId})`;
      const before = await sql`SELECT * FROM payments ORDER BY id`;
      assert.equal((await record()).reason, 'transaction_conflict');
      assert.deepEqual(await sql`SELECT * FROM payments ORDER BY id`, before);
      assert.equal(await balance(), '100.69');
      assert.equal(await count('audit_logs'), 0);
      assert.equal(calls.length, 0);
    });

    await scenario('cross-org historical payment on invoice fails scoped recomputation atomically', async () => {
      await sql`INSERT INTO payments (org_id, invoice_id, amount) VALUES (${orgB}, ${invoiceA}, 1)`;
      assert.equal((await record()).reason, 'payment_scope_mismatch');
      assert.equal(await count('payments'), 1);
      assert.equal(await count('audit_logs'), 0);
      assert.equal(await balance(), '100.69');
      assert.equal(calls.length, 0);
    });

    await scenario('lost QB response and misleading auth error text never replay or leak', async () => {
      fixture.client.createPayment = async payload => { calls.push(payload); throw new Error('AuthenticationFailed Token expired 401 SECRET provider-body'); };
      const result = await record();
      assert.equal(result.recorded, true);
      assert.equal(result.qbExportStatus, 'review_required');
      assert.equal(result.qbPaymentId, undefined);
      assert.equal(await balance(), '90.40');
      assert.equal(await count('audit_logs'), 1);
      const [payment] = await sql`SELECT * FROM payments`;
      assert.match(payment.notes, /pending or unresolved/);
      assert.equal(payment.qb_payment_id, null);
      const before = await sql`SELECT * FROM audit_logs`;
      service = await load(fixture);
      assert.equal((await record()).qbExportStatus, 'review_required');
      assert.equal(calls.length, 1);
      assert.deepEqual(await sql`SELECT * FROM audit_logs`, before);
      assert.doesNotMatch(JSON.stringify([result, payment, fixture.errors, before]), /SECRET|AuthenticationFailed|Token expired/);
    });

    await scenario('missing or mismatched QB response cannot invent success', async () => {
      for (const mutate of [() => null, value => ({ ...value, Id: '' }), value => ({ ...value, TotalAmt: 10.28 }),
        value => ({ ...value, CustomerRef: { value: '999' } }), value => ({ ...value, Line: [] }),
        value => ({ ...value, UnappliedAmt: 0.01 }),
        value => ({ ...value, Line: [{ Amount: 10.29, LinkedTxn: [{ TxnId: '999', TxnType: 'Invoice' }] }] })]) {
        await sql`TRUNCATE payments, audit_logs`;
        fixture.client.createPayment = async payload => { calls.push(payload); return mutate({ ...payload, Id: '500' }); };
        assert.equal((await record()).qbExportStatus, 'review_required');
        assert.equal((await record()).qbExportStatus, 'review_required');
        assert.equal((await sql`SELECT qb_payment_id FROM payments`)[0].qb_payment_id, null);
        assert.equal(await count('audit_logs'), 1);
      }
      assert.equal(calls.length, 7);
    });

    await scenario('QB singleton LinkedTxn is accepted only for the exact invoice and amount', async () => {
      const link = { TxnId: '301', TxnType: 'Invoice' };
      const variants = [link, null, {}, '301', { ...link, TxnId: 301 }, { ...link, TxnId: '302' },
        { ...link, TxnType: 'Payment' }, [link, link], [null]];
      for (const [index, LinkedTxn] of variants.entries()) {
        fixture.client.createPayment = async payload => {
          calls.push(payload);
          return { ...payload, Id: String(700 + index), Line: [{ Amount: 10.29, LinkedTxn }] };
        };
        const transactionId = `singleton-${index}`;
        const result = await record({ transactionId });
        assert.equal(result.qbExportStatus, index === 0 ? 'exported' : 'review_required');
        assert.equal((await record({ transactionId })).qbExportStatus, result.qbExportStatus);
      }
      assert.equal(calls.length, variants.length);
      assert.equal(await count('payments'), variants.length);
      assert.equal(Number((await sql`SELECT count(*) FROM audit_logs WHERE action = 'complete'`)[0].count), 1);
    });

    await scenario('unconfigured exports stay reported after connecting or reconnecting', async () => {
      await sql`UPDATE organizations SET qb_access_token = NULL WHERE id = ${orgA}`;
      assert.equal((await record()).qbExportStatus, 'review_required');
      const before = await sql`SELECT * FROM audit_logs`;
      await sql`UPDATE organizations SET qb_access_token = 'new-access', qb_realm_id = 'new-realm' WHERE id = ${orgA}`;
      assert.equal((await record()).qbExportStatus, 'review_required');
      assert.deepEqual(await sql`SELECT * FROM audit_logs`, before);
      assert.equal(calls.length, 0);
      assert.equal(await count('payments'), 1);
    });

    await scenario('a separate process exits after durable local commit; restart never contacts QB', async () => {
      const password = randomBytes(24).toString('hex');
      await sql.unsafe(`CREATE ROLE payment_restart LOGIN PASSWORD ${literal(password)}`);
      await sql`GRANT USAGE ON SCHEMA public TO payment_restart`;
      await sql`GRANT SELECT, INSERT, UPDATE ON organizations, customers, invoices, payments, audit_logs TO payment_restart`;
      await sql`CREATE TABLE fake_qb_payments (id text PRIMARY KEY, payload jsonb)`;
      await sql`GRANT INSERT ON fake_qb_payments TO payment_restart`;
      const config = { host: directory, port: 55439, database: 'postgres', user: 'payment_restart', password, ssl: false, max: 1 };
      const child = `const postgres = require('postgres'); const { drizzle } = require('drizzle-orm/postgres-js');
        const sql = postgres(${JSON.stringify(config)});
        const fixture = {db: drizzle(sql), clientCalls: [], client: {createPayment: async payload => {
          await sql.unsafe('INSERT INTO fake_qb_payments (id, payload) VALUES ($1, $2::jsonb)', ['synthetic-provider-payment', JSON.stringify(payload)]);
          process.exit(0);
        }, getTokens: () => null}};
        const loaded = {exports:{}};
        new Function('require','module','exports','__fixture','fetch','console',${JSON.stringify(await compile())})(require,loaded,loaded.exports,fixture,()=>{throw Error('Network forbidden')},console);
        loaded.exports.recordInvoicePayment({...${JSON.stringify(input)}, paidAt: new Date(${JSON.stringify(input.paidAt)})})
          .then(result => { console.error(result); process.exit(1); }, () => process.exit(1));`;
      centerRun(process.execPath, ['-e', child], { cwd: root });
      assert.equal(await count('payments'), 1);
      assert.equal(await balance(), '90.40');
      assert.equal(await count('audit_logs'), 1);
      assert.equal(await count('fake_qb_payments'), 1, 'provider side effect exists but its response was never received');
      fixture.db = drizzle(connect('payment_restart', password));
      service = await load(fixture);
      const result = await record();
      assert.equal(result.recorded, true);
      assert.equal(result.qbExportStatus, 'review_required');
      assert.equal(calls.length, 0);
      assert.equal(fixture.clientCalls.length, 0);
    });

    for (const [table, action] of [['payments', 'INSERT'], ['invoices', 'UPDATE'], ['audit_logs', 'INSERT']]) {
      await scenario(`local ${table} failure rolls back everything before provider`, async () => {
        await sql.unsafe(`CREATE OR REPLACE FUNCTION reject_payment_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SECRET synthetic local failure'; END $$`);
        await sql.unsafe(`CREATE TRIGGER reject_payment_write BEFORE ${action} ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_payment_write()`);
        try {
          const result = await record();
          assert.deepEqual(result, { recorded: false, reason: 'recording_failed' });
          assert.equal(await count('payments'), 0);
          assert.equal(await count('audit_logs'), 0);
          assert.equal(await balance(), '100.69');
          assert.equal(calls.length, 0);
          assert.equal(fixture.clientCalls.length, 0);
        } finally { await sql.unsafe(`DROP TRIGGER reject_payment_write ON ${table}`); }
      });
    }

    await scenario('completion event failure rolls back QB ID while retaining local money and claim', async () => {
      await sql.unsafe(`CREATE FUNCTION reject_payment_completion() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action = 'complete' THEN RAISE EXCEPTION 'SECRET completion failure'; END IF; RETURN NEW; END $$`);
      await sql`CREATE TRIGGER reject_payment_completion BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_payment_completion()`;
      try {
        assert.equal((await record()).qbExportStatus, 'review_required');
        assert.equal((await sql`SELECT qb_payment_id FROM payments`)[0].qb_payment_id, null);
        assert.equal(await count('audit_logs'), 1);
        assert.equal(await balance(), '90.40');
      } finally { await sql`DROP TRIGGER reject_payment_completion ON audit_logs`; }
      assert.equal((await record()).qbExportStatus, 'review_required');
      assert.equal(calls.length, 1);
    });

    for (const matching of [true, false]) {
      await scenario(`an import-winning completion is ${matching ? 'accepted idempotently' : 'rejected when conflicting'} without another export`, async () => {
        const create = fixture.client.createPayment;
        fixture.client.createPayment = async payload => {
          const response = await create(payload);
          const qbId = matching ? response.Id : '999';
          const [claim] = await sql`SELECT * FROM audit_logs WHERE action = 'claim'`;
          assert.equal(payload.PrivateNote.split('\n')[0], `HearthOS payment: ${claim.entity_id}`);
          await sql.begin(async tx => {
            await tx`UPDATE payments SET qb_payment_id = ${qbId} WHERE id = ${claim.entity_id}`;
            const completion = { ...claim.new_value, qbPaymentId: qbId };
            await tx`INSERT INTO audit_logs (id, org_id, entity_type, entity_id, action, new_value)
              VALUES (${service.paymentRecordingId(orgA, input.transactionId, 'complete')}, ${orgA}, 'payment_export',
                ${claim.entity_id}, 'complete', ${JSON.stringify(completion)}::jsonb)`;
          });
          return response;
        };
        const result = await record();
        assert.equal(result.recorded, true);
        assert.equal(result.qbExportStatus, matching ? 'exported' : 'review_required');
        assert.equal(result.qbPaymentId, matching ? '401' : undefined);
        assert.equal(await count('payments'), 1);
        assert.equal(await count('audit_logs'), 2);
        assert.equal(await balance(), '90.40');
        const events = await sql`SELECT * FROM audit_logs ORDER BY id`;
        await record();
        assert.equal(calls.length, 1);
        assert.deepEqual(await sql`SELECT * FROM audit_logs ORDER BY id`, events);
      });
    }

    await scenario('reconnect during QB call rejects old-realm completion and cannot reexport', async () => {
      const create = fixture.client.createPayment;
      fixture.client.createPayment = async payload => {
        const response = await create(payload);
        await sql`UPDATE organizations SET qb_realm_id = 'reconnected', qb_refresh_token = 'new-refresh' WHERE id = ${orgA}`;
        return response;
      };
      fixture.client.getTokens = () => ({ access_token: 'rotated', refresh_token: 'rotated-refresh', expires_in: 3600 });
      const result = await record();
      assert.equal(result.qbExportStatus, 'review_required');
      assert.equal(result.tokenPersistenceStatus, 'review_required');
      assert.equal((await sql`SELECT qb_payment_id FROM payments`)[0].qb_payment_id, null);
      assert.equal(await count('audit_logs'), 1);
      const claim = (await sql`SELECT * FROM audit_logs`)[0];
      assert.equal(claim.new_value.realmId, 'realm-a');
      assert.equal((await record()).qbExportStatus, 'review_required');
      assert.equal(calls.length, 1);
      assert.equal((await sql`SELECT qb_refresh_token FROM organizations WHERE id = ${orgA}`)[0].qb_refresh_token, 'new-refresh');
    });

    await scenario('already completed export is not a success in a different current realm', async () => {
      assert.equal((await record()).qbExportStatus, 'exported');
      const events = await sql`SELECT * FROM audit_logs ORDER BY id`;
      await sql`UPDATE organizations SET qb_realm_id = 'reconnected' WHERE id = ${orgA}`;
      const result = await record();
      assert.equal(result.qbExportStatus, 'review_required');
      assert.equal(result.qbPaymentId, undefined);
      assert.equal(calls.length, 1);
      assert.deepEqual(await sql`SELECT * FROM audit_logs ORDER BY id`, events);
    });

    for (const outcome of ['success', 'lost']) {
      await scenario(`rotated credentials persist in finally after ${outcome}`, async () => {
        const create = fixture.client.createPayment;
        fixture.client.createPayment = async payload => {
          const value = await create(payload);
          if (outcome === 'lost') throw new Error('SECRET lost response');
          return value;
        };
        fixture.client.getTokens = () => ({ access_token: 'rotated', refresh_token: 'rotated-refresh', expires_in: 3600 });
        const result = await record();
        assert.equal(result.qbExportStatus, outcome === 'lost' ? 'review_required' : 'exported');
        assert.equal(result.tokenPersistenceStatus, 'saved');
        const [own] = await sql`SELECT * FROM organizations WHERE id = ${orgA}`;
        assert.equal(own.qb_access_token, 'rotated');
        assert.equal(own.qb_refresh_token, 'rotated-refresh');
        assert.ok(Number.isFinite(Date.parse(own.qb_token_expires_at)));
        assert.equal((await sql`SELECT qb_access_token FROM organizations WHERE id = ${orgB}`)[0].qb_access_token, 'access-b');
        await record();
        assert.equal(calls.length, 1);
      });
    }

    await scenario('refresh-token CAS cannot overwrite concurrent credentials or erase completed export', async () => {
      const create = fixture.client.createPayment;
      fixture.client.createPayment = async payload => {
        await sql`UPDATE organizations SET qb_refresh_token = 'concurrent-refresh' WHERE id = ${orgA}`;
        return create(payload);
      };
      fixture.client.getTokens = () => ({ access_token: 'rotated', refresh_token: 'rotated-refresh', expires_in: 3600 });
      const result = await record();
      assert.equal(result.qbExportStatus, 'exported');
      assert.equal(result.tokenPersistenceStatus, 'review_required');
      assert.equal((await sql`SELECT qb_refresh_token FROM organizations WHERE id = ${orgA}`)[0].qb_refresh_token, 'concurrent-refresh');
      assert.equal(calls.length, 1);
    });

    await scenario('token persistence DB failure does not turn a completed export into failure', async () => {
      await sql.unsafe(`CREATE FUNCTION reject_payment_tokens() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SECRET token storage failure'; END $$`);
      await sql`CREATE TRIGGER reject_payment_tokens BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION reject_payment_tokens()`;
      fixture.client.getTokens = () => ({ access_token: 'rotated', refresh_token: 'rotated-refresh', expires_in: 3600 });
      try {
        const result = await record();
        assert.equal(result.recorded, true);
        assert.equal(result.qbExportStatus, 'exported');
        assert.equal(result.tokenPersistenceStatus, 'review_required');
        assert.match(result.qbExportNote, /credentials need review/);
        assert.equal(await count('audit_logs'), 2);
        assert.doesNotMatch(JSON.stringify([result, fixture.errors]), /SECRET|rotated-refresh/);
        await record();
        assert.equal(calls.length, 1);
      } finally { await sql`DROP TRIGGER reject_payment_tokens ON organizations`; }
    });

    for (const reply of ['success', 'lost', 'unauthorized']) {
      await scenario(`actual QB client explicit 401 then ${reply}: one refresh, no recorder replay`, async () => {
        let writes = 0, refreshes = 0;
        fixture.fetch = async (url, init) => {
          if (url === 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer') {
            refreshes++;
            return Response.json({ access_token: 'rotated', refresh_token: 'rotated-refresh', expires_in: 3600 });
          }
          assert.equal(new URL(url).pathname, '/v3/company/realm-a/payment');
          writes++;
          if (writes === 1 || reply === 'unauthorized') return new Response('SECRET provider body', { status: 401 });
          if (reply === 'lost') throw new Error('SECRET AuthenticationFailed 401 lost response');
          return Response.json({ Payment: { ...JSON.parse(init.body), Id: '701' } });
        };
        service = await load(fixture);
        fixture.clientFactory = (access, refresh, realm) => {
          const client = new service.QuickBooksClient({ clientId: 'synthetic', clientSecret: 'synthetic', redirectUri: 'https://example.test', environment: 'sandbox' });
          client.setRealmId(realm);
          client.setTokens({ access_token: access, refresh_token: refresh, expires_in: 3600 });
          return client;
        };
        const result = await record();
        assert.equal(result.qbExportStatus, reply === 'success' ? 'exported' : 'review_required');
        assert.equal(result.tokenPersistenceStatus, 'saved');
        assert.equal(writes, 2);
        assert.equal(refreshes, 1);
        await record();
        assert.equal(writes, 2);
        assert.doesNotMatch(JSON.stringify([result, fixture.errors]), /SECRET|AuthenticationFailed/);
      });
    }
    t.diagnostic('Real recorder/store/client, fresh socket-only PostgreSQL, schema-derived FKs and uniqueness, synthetic providers only, separate-process crash. No migrations or application database access.');
  });
});
