import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { centerRun, withCenterPostgres } from './center-local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const routePath = 'src/app/api/customers/center/route.ts';
const searchPath = 'src/lib/customer-search.ts';
const schemaPath = 'src/db/schema.ts';
const baselineRef = '19fb50f';
const fixedNow = '2026-09-09T12:00:00.000Z';
class CenterDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return new Date(fixedNow).getTime(); }
}

async function bundle(source, fixture, baseline = false) {
  const result = await build({
    stdin: { contents: source, loader: 'ts', resolveDir: root },
    absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'center-offline-boundary', setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: specifier }) => {
        if (['drizzle-orm', 'drizzle-orm/pg-core', 'next/server'].includes(specifier)) {
          return { path: specifier, external: true };
        }
        const modules = {
          '@/db': 'db', '@/lib/org': 'org', '@/lib/security/crm-access': 'auth',
          '@/lib/customer-search': 'search', 'center-schema': 'schema', 'server-only': 'empty',
        };
        if (!modules[specifier]) throw new Error(`Unapproved route dependency: ${specifier}`);
        return { path: modules[specifier], namespace: 'center-fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'center-fixture' }, async ({ path: name }) => {
        const inline = {
          db: 'export { customers, invoices, payments } from "center-schema"; export const db = __centerFixture.db;',
          org: 'export const getOrCreateDefaultOrg = async () => { __centerFixture.orgCalls++; return { id: __centerFixture.orgId }; };',
          auth: 'export const authorizeCrmApi = async (...args) => { __centerFixture.authCalls.push(args); return __centerFixture.denied; };',
          empty: '',
        };
        const file = name === 'search' ? searchPath : schemaPath;
        const contents = name in inline ? inline[name] : baseline
          ? centerRun('/usr/bin/git', ['show', `${baselineRef}:${file}`], { cwd: root })
          : await readFile(path.join(root, file), 'utf8');
        return { contents, loader: 'ts' };
      });
    } }],
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', '__centerFixture', 'Date', result.outputFiles[0].text)(
    require, loaded, loaded.exports, fixture, CenterDate,
  );
  return loaded.exports;
}

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orgA = id(1), orgB = id(2), orgC = id(3), emptyOrg = id(4);
const alpha = id(101), beta = id(102), gamma = id(103), emailOnly = id(104), unnamed = id(105), foreign = id(106), victim = id(107);
const creditOnly = id(108);

async function seed(sql, schema) {
  // Schema-derived column types, not migrations. Unrelated tables/FKs/defaults
  // are omitted so the fixture can exercise legacy inconsistent org links.
  await sql.unsafe("CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'void')");
  for (const table of [schema.customers, schema.invoices, schema.payments]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(', ');
    await sql.unsafe(`CREATE TABLE "${config.name}" (${columns})`);
  }
  const customers = [
    { id: alpha, org_id: orgA, first_name: 'Ada', last_name: 'Ash', company_name: 'Alpha 100%_Works', email: 'ada@example.test', phone: '(312) 555-0101', phone_alt: '773-555-0102', qb_customer_id: 'QB-ALPHA', address_line1: '12 Maple Lane', address_line2: 'Suite 5', city: 'Evanston', state: 'IL', zip: '60201', is_active: true },
    { id: beta, org_id: orgA, first_name: 'Ben', last_name: 'Birch', is_active: false },
    { id: gamma, org_id: orgA, first_name: 'Cara', last_name: 'Cedar', is_active: true },
    { id: emailOnly, org_id: orgA, email: 'delta@example.test', is_active: true },
    { id: unnamed, org_id: orgA, is_active: null },
    { id: foreign, org_id: orgB, company_name: 'Other Organization', is_active: true },
    { id: victim, org_id: orgC, company_name: 'Isolation Customer', is_active: true },
    { id: creditOnly, org_id: orgA, company_name: 'Credit Account', is_active: true },
  ];
  for (const customer of customers) await sql`INSERT INTO customers ${sql(customer)}`;
  const invoices = [
    [201, orgA, alpha, '2026-01-01', '2026-09-08', '200.50', '100.25'],
    [202, orgA, alpha, '2026-03-01', null, '50.25', '25.50'],
    [203, orgA, alpha, '2026-04-01', '2026-01-01', '-20.75', '-20.75'],
    [204, orgA, alpha, '2025-12-31', '2025-12-31', '80.00', '0.00'],
    [205, orgA, beta, '2025-12-31', '2026-01-01', '100.00', '40.00'],
    [206, orgA, unnamed, '2026-09-09', '2026-09-09', '30.00', '30.00'],
    [207, orgA, emailOnly, '2026-06-01', '2026-06-01', '0.00', '0.00'],
    [208, orgB, foreign, '2026-08-01', '2026-08-02', '900000.00', '800000.00'],
    [209, orgC, victim, '2026-01-01', null, '11.00', '7.00'],
    [210, orgB, victim, '2026-08-01', '2026-08-02', '500000.00', '400000.00'],
    [211, orgA, creditOnly, '2026-05-01', '2026-05-01', '-9.00', '-9.00'],
  ];
  for (const [n, org_id, customer_id, issue_date, due_date, subtotal, balance] of invoices) {
    await sql`INSERT INTO invoices ${sql({ id: id(n), org_id, customer_id, issue_date, due_date, subtotal, balance })}`;
  }
  const payments = [
    [301, orgA, 201, '2026-05-01T12:00:00Z'], [302, orgA, 201, '2026-06-01T12:00:00Z'],
    [303, orgB, 208, '2026-08-01T12:00:00Z'], [304, orgC, 209, '2026-02-01T12:00:00Z'],
    [305, orgC, 210, '2026-09-08T12:00:00Z'], // Payment org matches, invoice org does not.
    [306, orgB, 209, '2026-09-07T12:00:00Z'], // Invoice org matches, payment org does not.
  ];
  for (const [n, org_id, invoice, paid_at] of payments) {
    await sql`INSERT INTO payments ${sql({ id: id(n), org_id, invoice_id: id(invoice), paid_at, amount: '1.00' })}`;
  }
}

async function fingerprint(sql) {
  const result = {};
  for (const table of ['customers', 'invoices', 'payments']) {
    result[table] = await sql`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(row_hash, '' ORDER BY row_hash), '')) AS checksum
      FROM (SELECT md5(row_to_json(t)::text) AS row_hash FROM ${sql(table)} t) hashed`;
  }
  return result;
}

test('customer center: real offline PostgreSQL parity, isolation, and read-only queries', { timeout: 120_000 }, async t => {
  await withCenterPostgres(async ({ sql, connect }) => {
    const fixture = { db: null, orgId: orgA, orgCalls: 0, authCalls: [], denied: null };
    const schema = await bundle('export { customers, invoices, payments } from "center-schema";', fixture);
    await seed(sql, schema);
    const password = randomBytes(24).toString('hex');
    await sql.unsafe(`CREATE ROLE center_reader LOGIN PASSWORD '${password}'`);
    await sql.unsafe('GRANT USAGE ON SCHEMA public TO center_reader');
    await sql.unsafe('GRANT SELECT ON customers, invoices, payments TO center_reader');
    await sql.unsafe('ALTER ROLE center_reader SET default_transaction_read_only = on');
    const wire = [];
    const reader = connect('center_reader', password, (_connection, query) => wire.push(query));
    // Each new postgres.js connection reads type metadata. Warm the whole pool
    // before measuring, without filtering any statements from the route audit.
    const connections = [];
    try {
      for (let i = 0; i < 4; i++) connections.push(await reader.reserve());
      for (const connection of connections) await connection`SELECT 1`;
    } finally {
      for (const connection of connections) connection.release();
    }
    const [settings] = await reader`SELECT current_user AS name, current_setting('transaction_read_only') AS readonly,
      current_setting('listen_addresses') AS listeners`;
    assert.deepEqual({ ...settings }, { name: 'center_reader', readonly: 'on', listeners: '' });
    await assert.rejects(reader`UPDATE customers SET first_name = 'forbidden'`, error => error.code === '25006');
    const before = await fingerprint(sql);
    const queries = [];
    const db = drizzle(reader, { logger: { logQuery(query, params) { queries.push({ query, params }); } } });
    fixture.db = db;
    const baseline = await bundle(centerRun('/usr/bin/git', ['show', `${baselineRef}:${routePath}`], { cwd: root }), fixture, true);
    const current = await bundle(await readFile(path.join(root, routePath), 'utf8'), fixture);
    let requests = 0;
    async function invoke(route, params = {}, orgId = orgA) {
      fixture.orgId = orgId;
      fixture.authCalls = [];
      fixture.orgCalls = 0;
      queries.length = 0;
      wire.length = 0;
      const response = await route.GET(new Request(`http://offline.invalid/api/customers/center?${new URLSearchParams(params)}`));
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.deepEqual(fixture.authCalls, [['/api/customers/center', 'GET']]);
      assert.equal(fixture.orgCalls, 1);
      const count = route === current ? 4 : 6;
      assert.equal(queries.length, count, 'Drizzle query count');
      assert.equal(wire.length, count, 'actual PostgreSQL statement count');
      assert.ok(wire.every(query => /^select\b/i.test(query.trim())), 'route sends SELECT only');
      if (route === current) assert.equal(response.headers.get('cache-control'), 'private, no-store');
      requests++;
      return body;
    }
    const moneyBar = { totalDue: 166, openInvoiceCount: 4, overdueAmount: 140.25, overdueCount: 2, revenueYTD: 251, ytdInvoiceCount: 6 };

    await t.test('baseline/current parity for filters, sorts, directions and defaults', async () => {
      for (const filter of ['active', 'inactive', 'all', 'with_balance', 'unknown']) {
        for (const sort of ['name', 'balance', 'revenue', 'activity', 'unknown']) {
          for (const dir of ['asc', 'desc']) {
            const params = { filter, sort, dir };
            const actual = await invoke(current, params);
            assert.deepEqual(actual, await invoke(baseline, params), JSON.stringify(params));
            assert.deepEqual(actual.moneyBar, moneyBar, 'money bar remains organization-wide');
          }
        }
      }
      for (const params of [{}, { filter: 'ALL', sort: 'BALANCE', dir: 'DESC' }, { filter: 'all', dir: 'invalid' }]) {
        assert.deepEqual(await invoke(current, params), await invoke(baseline, params));
      }
    });

    await t.test('literal, tokenized, contact, address, QB and empty-result searches', async () => {
      for (const q of ['Ada Ash', '  ADA   Evanston  ', '100%', '_Works', '3125550101', '7735550102', 'QB-ALPHA', 'Suite 5', '60201', 'IL', 'ada@example.test', 'Maple', '%', '_', '\\', "' OR 1=1 --", 'no-match', 'x'.repeat(180)]) {
        const params = { q, filter: 'all', sort: 'name' };
        const actual = await invoke(current, params);
        assert.deepEqual(actual, await invoke(baseline, params), q);
        const expected = ['\\', "' OR 1=1 --", 'no-match', 'x'.repeat(180)].includes(q) ? [] : [alpha];
        assert.deepEqual(actual.items.map(item => item.id), expected, q);
        assert.deepEqual(actual.moneyBar, moneyBar);
      }
    });

    await t.test('independent expected financial values and customer fallbacks', async () => {
      const actual = await invoke(current, { filter: 'all' });
      assert.deepEqual(actual.totals, { customers: 6, balance: 166, openInvoices: 4, revenue: 431 });
      const a = actual.items.find(item => item.id === alpha);
      assert.deepEqual([a.balance, a.invoiceCount, a.openInvoiceCount, a.paymentCount, a.totalRevenue], [105, 4, 2, 2, 310]);
      assert.equal(a.lastActivity, '2026-06-01 12:00:00+00');
      assert.deepEqual(a.address, { line1: '12 Maple Lane', line2: 'Suite 5', city: 'Evanston', state: 'IL', zip: '60201' });
      const zero = actual.items.find(item => item.id === gamma);
      assert.deepEqual([zero.balance, zero.invoiceCount, zero.paymentCount, zero.lastActivity], [0, 0, 0, null]);
      assert.equal(actual.items.find(item => item.id === emailOnly).displayName, 'delta@example.test');
      assert.equal(actual.items.find(item => item.id === unnamed).displayName, 'Unnamed');
      assert.equal(actual.items.find(item => item.id === unnamed).isActive, true);
      const credit = actual.items.find(item => item.id === creditOnly);
      assert.deepEqual([credit.balance, credit.totalRevenue, credit.openInvoiceCount], [-9, -9, 0]);
      assert.deepEqual((await invoke(current, { filter: 'inactive' })).items.map(item => item.id), [beta]);
      assert.deepEqual(new Set((await invoke(current, { filter: 'with_balance' })).items.map(item => item.id)), new Set([alpha, beta, unnamed]));
    });

    await t.test('both payment and invoice organization predicates prevent aggregate contamination', async () => {
      const actual = await invoke(current, { filter: 'all' }, orgC);
      assert.deepEqual(actual.items.map(item => item.id), [victim]);
      assert.deepEqual(actual.moneyBar, { totalDue: 7, openInvoiceCount: 1, overdueAmount: 0, overdueCount: 0, revenueYTD: 11, ytdInvoiceCount: 1 });
      assert.deepEqual([actual.items[0].balance, actual.items[0].totalRevenue, actual.items[0].invoiceCount, actual.items[0].paymentCount], [7, 11, 1, 1]);
      assert.equal(actual.items[0].lastActivity, '2026-02-01 12:00:00+00');
      const old = await invoke(baseline, { filter: 'all' }, orgC);
      assert.equal(old.items[0].paymentCount, 2, 'fixture reproduces the baseline cross-org bug');
      assert.equal(old.items[0].lastActivity, '2026-09-08 12:00:00+00');
      old.items[0].paymentCount = actual.items[0].paymentCount;
      old.items[0].lastActivity = actual.items[0].lastActivity;
      assert.deepEqual(actual, old, 'only the intended isolation fix changes the payload');
    });

    await t.test('empty organization aggregates coalesce to zeros', async () => {
      const actual = await invoke(current, {}, emptyOrg);
      assert.deepEqual(actual, await invoke(baseline, {}, emptyOrg));
      assert.deepEqual(actual, { items: [], totals: { customers: 0, balance: 0, openInvoices: 0, revenue: 0 }, moneyBar: { totalDue: 0, openInvoiceCount: 0, overdueAmount: 0, overdueCount: 0, revenueYTD: 0, ytdInvoiceCount: 0 } });
    });

    await t.test('authorization denial performs no organization lookup or queries', async () => {
      fixture.denied = Response.json({ error: 'Unauthorized' }, { status: 401 });
      fixture.orgCalls = 0;
      wire.length = 0;
      queries.length = 0;
      const response = await current.GET(new Request('http://offline.invalid/api/customers/center'));
      assert.equal(response, fixture.denied);
      assert.equal(fixture.orgCalls, 0);
      assert.equal(queries.length, 0);
      assert.equal(wire.length, 0);
      fixture.denied = null;
    });

    await t.test('database failure returns generic error, not internal details', async () => {
      // Keep the real Drizzle builders and route's async execution, but inject a
      // projection that PostgreSQL rejects without changing any fixture data.
      const broken = await bundle(await readFile(path.join(root, routePath), 'utf8'), {
        ...fixture, db: { select() { return db.select({ failure: drizzleSql`1 / 0` }); } },
      });
      const original = console.error;
      const errors = [];
      console.error = (...args) => errors.push(args);
      try {
        const response = await broken.GET(new Request('http://offline.invalid/api/customers/center'));
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { error: 'Unable to load customers. Please try again.' });
        assert.equal(errors.length, 1);
        assert.equal(errors[0][1].cause?.code, '22012', 'actual PostgreSQL division-by-zero error');
      } finally { console.error = original; }
    });

    await t.test('all fixture data is unchanged after route execution', async () => {
      assert.deepEqual(await fingerprint(sql), before);
    });
    t.diagnostic(`${requests} successful route requests; current 4 SELECTs/request, baseline 6; fresh socket-only cluster, SELECT-only role, unchanged row fingerprints.`);
  });
});
