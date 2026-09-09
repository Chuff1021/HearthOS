import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
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
const orgId = id(1), foreignOrg = id(2), invoiceId = id(11), secondInvoice = id(12);
const env = { SQUARE_ENVIRONMENT: 'sandbox', SQUARE_ACCESS_TOKEN: 'fake-square-token',
  SQUARE_LOCATION_ID: 'offline-location', SQUARE_WEBHOOK_SIGNATURE_KEY: 'synthetic-signature-key',
  SQUARE_WEBHOOK_URL: 'https://offline.invalid/api/square/webhook', HEARTHOS_PUBLIC_LINK_SECRET: 'synthetic-public-link-secret-32-bytes-long' };
let compiled;
async function compile() {
  if (compiled) return compiled;
  const files = { schema: 'src/db/schema.ts', intent: 'src/lib/invoices/square-capture-intent.ts',
    capture: 'src/app/api/square/payments/route.ts', webhook: 'src/app/api/square/webhook/route.ts',
    record: 'src/lib/invoices/record-payment.ts', recording: 'src/lib/invoices/payment-recording-store.ts',
    links: 'src/lib/security/public-links.ts' };
  const inline = {
    db: 'export * from "fixture-schema"; export const db = __fixture.db;',
    auth: 'export const authorizeCrmApi = async () => { __fixture.authCalls++; return __fixture.denied ? Response.json({}, {status:403}) : null; };',
    org: 'export const getOrCreateDefaultOrg = async () => { throw new Error("No default-org creation allowed"); };',
    sync: 'export const getClientFromTokens = () => __fixture.qb;',
    store: `export const listSquarePayments = () => { __fixture.fileReads++; return __fixture.stored; };
      export const upsertSquarePayment = p => __fixture.store(p);
      export const upsertSquarePaymentByOrderId = (orderId, p) => __fixture.store(p, orderId);`,
  };
  const aliases = { 'fixture-schema': 'schema', 'fixture-intent': 'intent', 'fixture-capture': 'capture',
    'fixture-webhook': 'webhook', 'fixture-links': 'links', '@/db': 'db', '@/lib/org': 'org',
    '@/lib/security/crm-access': 'auth', '@/lib/security/public-links': 'links',
    '@/lib/invoices/square-capture-intent': 'intent', '@/lib/invoices/record-payment': 'record',
    './payment-recording-store': 'recording', '@/lib/quickbooks/sync': 'sync', '@/lib/square-payment-store': 'store' };
  const result = await build({ stdin: { contents: `export * from 'fixture-schema'; export * from 'fixture-intent';
    export * from 'fixture-links'; export {POST as capture} from 'fixture-capture'; export {POST as webhook} from 'fixture-webhook';`,
    resolveDir: root, loader: 'ts' }, absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'isolated-square-boundaries', setup(b) {
      b.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (['node:crypto', 'drizzle-orm', 'drizzle-orm/pg-core', 'next/server'].includes(name)) return { path: name, external: true };
        if (!aliases[name]) throw new Error(`Unapproved dependency ${name}`);
        return { path: aliases[name], namespace: 'square-fixture' };
      });
      b.onLoad({ filter: /.*/, namespace: 'square-fixture' }, async ({ path: name }) => ({
        contents: inline[name] ?? await readFile(path.join(root, files[name]), 'utf8'), loader: 'ts',
      }));
    } }],
  });
  compiled = result.outputFiles[0].text;
  return compiled;
}
async function load(fixture = {}) {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', '__fixture', 'fetch', 'process', 'console', await compile())(
    require, loaded, loaded.exports, fixture,
    (...args) => { if (!fixture.fetch) throw new Error('Network forbidden'); return fixture.fetch(...args); },
    { env: fixture.env ?? { ...env } }, { ...console, error: (...args) => fixture.errors?.push(args) });
  return loaded.exports;
}
const quote = s => `"${s.replaceAll('"', '""')}"`;
const literal = s => `'${String(s).replaceAll("'", "''")}'`;
async function createSchema(sql, schema) {
  for (const value of Object.values(schema)) if (value?.enumName && value?.enumValues) {
    await sql.unsafe(`CREATE TYPE ${quote(value.enumName)} AS ENUM (${value.enumValues.map(literal).join(',')})`);
  }
  const tables = new Map();
  function visit(table) {
    const config = getTableConfig(table);
    if (tables.has(config.name)) return;
    tables.set(config.name, config);
    config.foreignKeys.forEach(fk => visit(fk.reference().foreignTable));
  }
  [schema.auditLogs, schema.invoices, schema.payments].forEach(visit);
  const dialect = new PgDialect();
  for (const config of tables.values()) {
    const columns = config.columns.map(c => {
      let ddl = `${quote(c.name)} ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${c.isUnique ? ' UNIQUE' : ''}`;
      if (c.default !== undefined) {
        const value = c.default;
        ddl += ` DEFAULT ${value && typeof value.getSQL === 'function' ? dialect.sqlToQuery(value).sql
          : typeof value === 'object' ? `${literal(JSON.stringify(value))}::jsonb`
            : typeof value === 'string' ? literal(value) : String(value)}`;
      }
      return ddl;
    });
    await sql.unsafe(`CREATE TABLE ${quote(config.name)} (${columns.join(',')})`);
  }
  for (const config of tables.values()) {
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      await sql.unsafe(`ALTER TABLE ${quote(config.name)} ADD CONSTRAINT ${quote(fk.getName())}
        FOREIGN KEY (${ref.columns.map(c => quote(c.name)).join(',')})
        REFERENCES ${quote(getTableConfig(ref.foreignTable).name)} (${ref.foreignColumns.map(c => quote(c.name)).join(',')})
        ON DELETE ${fk.onDelete ?? 'no action'} ON UPDATE ${fk.onUpdate ?? 'no action'}`);
    }
    for (const index of config.indexes) if (index.config.unique) await sql.unsafe(
      `CREATE UNIQUE INDEX ${quote(index.config.name)} ON ${quote(config.name)} (${index.config.columns.map(c => quote(c.name)).join(',')})`);
  }
  await sql`INSERT INTO organizations (id,name,slug) VALUES (${orgId},'Synthetic','default'),(${foreignOrg},'Foreign','foreign')`;
  await sql`INSERT INTO customers (id,org_id,first_name,last_name) VALUES (${id(21)},${orgId},'Synthetic','Customer'),(${id(22)},${foreignOrg},'Foreign','Customer')`;
}

test('capture integer cents and strict bounded provider shape', async () => {
  const api = await load();
  for (const value of [0, -1, 0.001, 1.005, NaN, Infinity, true, null, {}, '1e2', ' 1', '1.000', 100000000]) assert.equal(api.dollarsToCents(value), null);
  for (const [value, cents] of [[1.01, 101], ['100.00', 10000], [0.29, 29]]) assert.equal(api.dollarsToCents(value), cents);
  assert.notEqual(api.captureIntentId(orgId, 'L', 'source'), api.captureIntentId(foreignOrg, 'L', 'source'));
  assert.notEqual(api.captureIntentId(orgId, 'L', 'source'), api.captureIntentId(orgId, 'M', 'source'));
});

test('real PostgreSQL capture claims, fake provider, actual routes and atomic recorder', async t => {
  const schema = await load();
  await withCenterPostgres(async ({ sql, connect, directory }) => {
    await createSchema(sql, schema);
    let queryCount = 0;
    const password = randomBytes(20).toString('hex');
    await sql.unsafe(`CREATE ROLE capture_runtime LOGIN PASSWORD ${literal(password)}`);
    await sql`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO capture_runtime`;
    const client = connect('capture_runtime', password, () => queryCount++);
    const db = drizzle(client, { schema });
    // Warm the real connection before asserting pre-validation zero I/O.
    await client`SELECT 1`;
    async function seed() {
      await sql`TRUNCATE payments, audit_logs, invoices CASCADE`;
      for (const [key, org, customer, number, qb] of [[invoiceId, orgId, id(21), 'INV-1', '101'],
        [secondInvoice, orgId, id(21), 'INV-2', '102'], [id(13), foreignOrg, id(22), 'FOREIGN', '103']]) {
        await sql`INSERT INTO invoices (id,org_id,customer_id,invoice_number,qb_invoice_id,issue_date,subtotal,total_amount,balance,status)
          VALUES (${key},${org},${customer},${number},${qb},'2026-01-01','100.00','100.00','100.00','sent')`;
      }
    }
    async function fixture() {
      const f = { db, env: { ...env }, denied: true, authCalls: 0, fileReads: 0, fileWrites: 0, stored: [],
        calls: [], errors: [], mode: 'completed', qbCalls: 0,
        store(p, orderId) { this.fileWrites++; const i = this.stored.findIndex(row => row.id === p.id || (orderId && row.orderId === orderId));
          if (i >= 0) this.stored[i] = { ...this.stored[i], ...p }; else this.stored.push(p); },
      };
      f.qb = { createPayment: async payload => { f.qbCalls++; f.qbPayload = payload; return { ...payload, Id: '700' }; }, getTokens: () => null };
      f.fetch = async (url, init) => {
        assert.equal(url, 'https://connect.squareupsandbox.com/v2/payments');
        const request = JSON.parse(init.body); f.calls.push(request);
        f.lastPayment = { id: `offline-payment-${f.calls.length}`, status: 'COMPLETED', amount_money: request.amount_money,
          location_id: request.location_id, reference_id: request.reference_id, source_type: 'CARD',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', receipt_url: 'https://example.test/receipt' };
        if (f.gate) await f.gate;
        if (f.mode === 'lost') throw new Error('raw-sensitive-provider-error');
        if (f.mode === 'json') return new Response('{', { status: 200 });
        if (f.mode === 'reject') return Response.json({ errors: [{ category: 'PAYMENT_METHOD_ERROR', code: 'CARD_DECLINED', detail: 'raw-sensitive-provider-error' }] }, { status: 400 });
        if (f.mode === '500') return Response.json({ errors: [{ category: 'PAYMENT_METHOD_ERROR', code: 'CARD_DECLINED' }] }, { status: 500 });
        const payment = f.mutate ? f.mutate(f.lastPayment) : { ...f.lastPayment,
          status: f.mode === 'pending' ? 'PENDING' : f.mode === 'failed' ? 'FAILED' : f.mode === 'canceled' ? 'CANCELED' : 'COMPLETED' };
        return Response.json(f.mode === 'missing' ? {} : { payment });
      };
      const api = await load(f);
      f.api = api;
      const issuedAt = Date.now();
      f.token = (number = 'INV-1', maxCents = 10350, now = issuedAt) => api.signCustomerLink({ purpose: 'payment', document: number, maxCents }, now);
      f.capture = async (patch = {}, raw) => {
        const body = { amount: 100, sourceId: 'synthetic-nonce', invoiceNumber: 'INV-1', token: f.token(), ...patch };
        const response = await api.capture(new Request('https://offline.invalid/api/square/payments', { method: 'POST', body: raw ?? JSON.stringify(body) }));
        return { status: response.status, body: await response.json() };
      };
      f.webhook = async (payment = f.lastPayment, options = {}) => {
        const body = options.raw ?? JSON.stringify({ type: options.type ?? 'payment.updated', data: { object: { payment } } });
        const signature = createHmac('sha256', env.SQUARE_WEBHOOK_SIGNATURE_KEY).update(env.SQUARE_WEBHOOK_URL + body).digest('base64');
        const response = await api.webhook(new Request(env.SQUARE_WEBHOOK_URL, { method: 'POST', body,
          headers: options.missing ? {} : { 'x-square-hmacsha256-signature': options.signature ?? signature } }));
        return { status: response.status, body: await response.json() };
      };
      return f;
    }
    async function scenario(name, run) { await t.test(name, async () => { await seed(); await run(await fixture()); }); }
    const count = async table => Number((await sql.unsafe(`SELECT count(*) AS n FROM ${quote(table)}`))[0].n);
    const actions = async () => (await sql`SELECT action FROM audit_logs WHERE entity_type='square_capture' ORDER BY action`).map(r => r.action);

    await scenario('missing/invalid signature, env and malformed payments perform zero DB/file I/O', async f => {
      const good = { id: 'test', status: 'COMPLETED', amount_money: { amount: 100, currency: 'USD' }, location_id: env.SQUARE_LOCATION_ID };
      const start = queryCount;
      assert.equal((await f.webhook(good, { missing: true })).status, 401);
      assert.equal((await f.webhook(good, { signature: 'bad' })).status, 401);
      for (const key of ['SQUARE_WEBHOOK_SIGNATURE_KEY', 'SQUARE_WEBHOOK_URL', 'SQUARE_LOCATION_ID']) {
        const old = f.env[key]; delete f.env[key]; assert.equal((await f.webhook(good)).status, 401); f.env[key] = old;
      }
      assert.equal((await f.webhook(good, { raw: '{' })).status, 400);
      for (const patch of [{ id: '' }, { id: 1 }, { status: 'UNKNOWN' }, { status: undefined }, { location_id: 'foreign' },
        ...[0, -1, 1.5, '100'].map(amount => ({ amount_money: { amount, currency: 'USD' } })), { amount_money: { amount: 100, currency: 'CAD' } }]) {
        assert.equal((await f.webhook({ ...good, ...patch })).status, 400);
      }
      assert.equal(queryCount, start); assert.equal(f.fileReads, 0); assert.equal(f.fileWrites, 0);
      assert.equal(await count('payments'), 0); assert.equal(await count('audit_logs'), 0);
    });
    await scenario('validation/auth/absent/foreign/paid/ambiguous invoices never charge', async f => {
      for (const patch of [{ amount: 1.005 }, { sourceId: '' }, { sourceId: 'x'.repeat(4097) }, { sourceId: {} },
        { sourceId: 'CASH' }, { sourceId: 'EXTERNAL' }, { invoicePrincipal: 90 }, { token: 'invalid' },
        { invoiceNumber: 'absent', token: f.token('absent') }, { invoiceNumber: 'FOREIGN', token: f.token('FOREIGN') }]) {
        assert.ok((await f.capture(patch)).status >= 400);
      }
      await sql`UPDATE invoices SET status='paid',balance='0.00' WHERE id=${invoiceId}`;
      assert.equal((await f.capture()).status, 409);
      await sql`UPDATE invoices SET status='sent',balance='100.00' WHERE id=${invoiceId}`;
      await sql`UPDATE invoices SET invoice_number='INV-1' WHERE id=${secondInvoice}`;
      assert.equal((await f.capture()).status, 409);
      assert.equal(f.calls.length, 0); assert.equal(await count('audit_logs'), 0);
    });
    await scenario('concurrent identical captures claim once, record once, replay durable native result', async f => {
      const results = await Promise.all(Array.from({ length: 8 }, () => f.capture()));
      assert.equal(f.calls.length, 1); assert.equal(await count('payments'), 1);
      assert.equal(results.filter(r => r.status === 200).length >= 1, true);
      const replay = await f.capture(); assert.equal(replay.status, 200); assert.equal(replay.body.status, 'COMPLETED');
      assert.equal(replay.body.invoicePayment.recorded, true); assert.equal(replay.body.retrySafe, false);
      assert.equal(replay.body.paymentId, f.lastPayment.id); assert.equal(f.calls[0].reference_id.length, 40);
      assert.match(f.calls[0].note, /INV-1/); assert.equal(f.calls.length, 1);
      assert.deepEqual(await actions(), ['confirmed', 'reserved', 'settled']);
      const audit = JSON.stringify(await sql`SELECT new_value FROM audit_logs WHERE entity_type='square_capture'`);
      assert.ok(!audit.includes('synthetic-nonce')); assert.ok(!audit.includes(f.token()));
    });
    await scenario('signed invoice document takes priority over another invoices QuickBooks ID', async f => {
      await sql`UPDATE invoices SET invoice_number='301',qb_invoice_id='401' WHERE id=${invoiceId}`;
      await sql`UPDATE invoices SET invoice_number='302',qb_invoice_id='301' WHERE id=${secondInvoice}`;
      const result = await f.capture({ amount: 40, invoiceNumber: '301', token: f.token('301') });
      assert.equal(result.status, 200); assert.equal(result.body.invoicePayment.invoiceId, invoiceId);
      assert.equal((await sql`SELECT invoice_id FROM payments`)[0].invoice_id, invoiceId);
      assert.match(f.calls[0].note, /301/);
      const legacy = { ...f.lastPayment, id: 'legacy-document-collision', reference_id: '301' };
      assert.equal((await f.webhook(legacy)).status, 200);
      assert.ok((await sql`SELECT invoice_id FROM payments`).every(row => row.invoice_id === invoiceId));
      assert.equal((await sql`SELECT balance FROM invoices WHERE id=${secondInvoice}`)[0].balance, '100.00');
      await sql`UPDATE invoices SET invoice_number='301' WHERE id=${secondInvoice}`;
      assert.equal((await f.capture({ amount: 10, sourceId: 'ambiguous', invoiceNumber: '301', token: f.token('301') })).body.code, 'INVOICE_NOT_UNAMBIGUOUS');
      assert.equal(f.calls.length, 1);
    });
    await scenario('only absent document matches fall back to QuickBooks ID or exact UUID', async f => {
      for (const [index, reference] of ['101', 'QB-101', invoiceId].entries()) {
        const result = await f.capture({ amount: 10, sourceId: `fallback-${index}`, invoiceNumber: reference, token: f.token(reference) });
        assert.equal(result.status, 200); assert.equal(result.body.invoicePayment.invoiceId, invoiceId);
      }
      assert.equal(f.calls.length, 3); assert.equal(await count('payments'), 3);
    });
    await scenario('same source cannot change amount, invoice or principal', async f => {
      f.mode = 'lost'; assert.equal((await f.capture({ amount: 50 })).status, 409);
      assert.equal((await f.capture({ amount: 40 })).body.code, 'CAPTURE_INTENT_CONFLICT');
      assert.equal((await f.capture({ amount: 50, invoiceNumber: 'INV-2', token: f.token('INV-2') })).body.code, 'CAPTURE_INTENT_CONFLICT');
      assert.equal(f.calls.length, 1);
    });
    await scenario('retokenized requests reserve principal and enforce cumulative signed token cap', async f => {
      f.mode = 'pending'; const token = f.token('INV-1', 6000);
      assert.equal((await f.capture({ amount: 40, token })).body.code, 'CAPTURE_PENDING');
      assert.equal((await f.capture({ amount: 30, sourceId: 'next', token })).body.code, 'PAYMENT_LINK_LIMIT');
      assert.equal((await f.capture({ amount: 70, sourceId: 'third', token: f.token('INV-1', 10350, Date.now() + 1) })).body.code, 'INVOICE_BALANCE_RESERVED');
      assert.equal(f.calls.length, 1); assert.equal(await count('payments'), 0);
      await f.webhook({ ...f.lastPayment, status: 'COMPLETED' });
      assert.equal((await f.capture({ amount: 30, sourceId: 'fourth', token })).body.code, 'PAYMENT_LINK_LIMIT');
      assert.equal(await count('payments'), 1);
    });
    await scenario('different nonces concurrently cannot exceed invoice balance', async f => {
      f.mode = 'pending'; const outcomes = await Promise.all(['a', 'b'].map(sourceId => f.capture({ sourceId, amount: 70 })));
      assert.equal(f.calls.length, 1); assert.equal(outcomes.filter(r => r.body.code === 'INVOICE_BALANCE_RESERVED').length, 1);
    });
    await scenario('lost partial blocks new nonce on same/different links until webhook resolves', async f => {
      f.mode = 'lost'; const token = f.token();
      assert.equal((await f.capture({ amount: 40, token })).status, 409);
      for (const nextToken of [token, f.token('INV-1', 9000, Date.now() + 20)]) {
        const result = await f.capture({ amount: 40, sourceId: 'new-nonce', token: nextToken });
        assert.equal(result.status, 409); assert.equal(result.body.code, 'INVOICE_CAPTURE_PENDING');
        assert.equal(result.body.retrySafe, false);
      }
      assert.equal(f.calls.length, 1); assert.equal(await count('payments'), 0);
      assert.equal((await f.webhook()).status, 200);
      f.mode = 'completed'; assert.equal((await f.capture({ amount: 40, sourceId: 'legitimate-next' })).status, 200);
      assert.equal(f.calls.length, 2); assert.equal(await count('payments'), 2);
      assert.equal((await sql`SELECT balance FROM invoices WHERE id=${invoiceId}`)[0].balance, '20.00');
    });
    await scenario('concurrent affordable partials still permit only one unresolved capture', async f => {
      f.mode = 'pending'; const outcomes = await Promise.all(['a', 'b'].map(sourceId => f.capture({ sourceId, amount: 40 })));
      assert.equal(f.calls.length, 1); assert.equal(outcomes.filter(r => r.body.code === 'INVOICE_CAPTURE_PENDING').length, 1);
    });
    await scenario('same signed token cap survives invoice-number reassignment', async f => {
      const token = f.token('INV-1', 6000);
      assert.equal((await f.capture({ amount: 40, token })).status, 200);
      await sql`UPDATE invoices SET invoice_number='RENAMED' WHERE id=${invoiceId}`;
      await sql`UPDATE invoices SET invoice_number='INV-1' WHERE id=${secondInvoice}`;
      const next = await f.capture({ sourceId: 'second', amount: 30, token });
      assert.equal(next.body.code, 'PAYMENT_LINK_LIMIT'); assert.equal(f.calls.length, 1);
    });
    await scenario('padded equivalent signed token cannot reset cumulative cap after settlement', async f => {
      const token = f.token('INV-1', 4000);
      assert.ok(f.api.verifyCustomerLink(`${token}=`, 'payment', 'INV-1'));
      assert.equal((await f.capture({ amount: 40, token })).status, 200);
      const result = await f.capture({ amount: 40, sourceId: 'another', token: `${token}=` });
      assert.equal(result.body.code, 'PAYMENT_LINK_LIMIT'); assert.equal(f.calls.length, 1);
    });
    await scenario('fee principal is server bounded and immutable, including after retokenization', async f => {
      for (const invoicePrincipal of [1, 90, 99, 100.01, -1, 0, 100.001]) {
        assert.ok((await f.capture({ amount: 103.5, invoicePrincipal })).status >= 400);
      }
      assert.equal(f.calls.length, 0);
      f.mode = 'lost'; assert.equal((await f.capture({ amount: 51.75, invoicePrincipal: 50 })).status, 409);
      assert.equal((await f.capture({ amount: 51.75 })).body.code, 'CAPTURE_INTENT_CONFLICT');
      assert.equal((await f.capture({ amount: 60, sourceId: 'new' })).body.code, 'INVOICE_BALANCE_RESERVED');
      assert.equal(f.calls.length, 1);
      assert.equal((await f.webhook({ ...f.lastPayment, source_type: 'BANK_ACCOUNT' })).status, 409);
      assert.equal(await count('payments'), 0);
    });
    await scenario('fee total is bounded separately from principal and local allocation', async f => {
      await sql`UPDATE organizations SET qb_access_token='synthetic',qb_refresh_token='synthetic',qb_realm_id='synthetic' WHERE id=${orgId}`;
      await sql`UPDATE customers SET qb_customer_id='201' WHERE id=${id(21)}`;
      try {
        const result = await f.capture({ amount: 103.5, invoicePrincipal: 100 });
        assert.equal(result.status, 200); assert.equal(f.calls[0].amount_money.amount, 10350);
        assert.equal((await sql`SELECT amount FROM payments`)[0].amount, '100.00');
        assert.equal((await sql`SELECT balance FROM invoices WHERE id=${invoiceId}`)[0].balance, '0.00');
        assert.equal(f.qbCalls, 1); assert.equal(f.qbPayload.TotalAmt, 100);
        assert.deepEqual(f.qbPayload.Line, [{ Amount: 100, LinkedTxn: [{ TxnId: '101', TxnType: 'Invoice' }] }]);
        const intent = (await sql`SELECT new_value FROM audit_logs WHERE entity_type='square_capture' AND action='reserved'`)[0].new_value;
        assert.equal(intent.amountCents, 10350); assert.equal(intent.principalCents, 10000); assert.equal(intent.feeCents, 350);
        assert.equal((await f.capture({ sourceId: 'again', amount: 1 })).status, 409);
      } finally {
        await sql`UPDATE organizations SET qb_access_token=NULL,qb_refresh_token=NULL,qb_realm_id=NULL WHERE id=${orgId}`;
      }
    });
    await scenario('CRM-authenticated invoice-less payments remain supported and reserved', async f => {
      assert.equal((await f.capture({ invoiceNumber: undefined, token: undefined })).status, 403);
      f.denied = false;
      assert.equal((await f.capture({ invoiceNumber: undefined, token: undefined })).status, 200);
      assert.equal(f.authCalls, 2); assert.equal(await count('payments'), 0); assert.equal(f.calls.length, 1);
      assert.deepEqual(await actions(), ['confirmed', 'reserved', 'settled']);
    });
    await scenario('lost invoice-less capture blocks reloaded/new nonce but not invoice-bound payments', async f => {
      f.denied = false; f.mode = 'lost';
      const adhoc = { invoiceNumber: undefined, token: undefined, amount: 40 };
      assert.equal((await f.capture(adhoc)).status, 409); const lost = f.lastPayment;
      const again = await f.capture({ ...adhoc, sourceId: 'reloaded-nonce' });
      assert.equal(again.body.code, 'ADHOC_CAPTURE_PENDING'); assert.equal(again.body.retrySafe, false);
      assert.equal(f.calls.length, 1);
      f.mode = 'completed'; assert.equal((await f.capture({ amount: 40, sourceId: 'bound' })).status, 200);
      assert.equal((await f.webhook(lost)).status, 200);
      assert.equal((await f.capture({ ...adhoc, sourceId: 'next-adhoc' })).status, 200);
      assert.equal(f.calls.length, 3);
    });
    await scenario('terminal webhook releases unknown invoice-less org/location hold', async f => {
      f.denied = false; f.mode = 'lost'; const adhoc = { invoiceNumber: undefined, token: undefined, amount: 40 };
      await f.capture(adhoc); assert.equal((await f.webhook({ ...f.lastPayment, status: 'CANCELED' })).status, 200);
      f.mode = 'completed'; assert.equal((await f.capture({ ...adhoc, sourceId: 'next' })).status, 200);
      assert.equal(f.calls.length, 2); assert.equal(await count('payments'), 0);
    });
    await scenario('settled replay refreshes QB realm status without recharging or reexporting', async f => {
      await sql`UPDATE organizations SET qb_access_token='synthetic',qb_refresh_token='synthetic',qb_realm_id='realm-a' WHERE id=${orgId}`;
      await sql`UPDATE customers SET qb_customer_id='201' WHERE id=${id(21)}`;
      try {
        const result = await f.capture(); assert.equal(result.body.invoicePayment.qbExportStatus, 'exported');
        await sql`UPDATE organizations SET qb_realm_id='realm-b' WHERE id=${orgId}`;
        const replay = await f.capture(); assert.equal(replay.status, 200);
        assert.equal(replay.body.invoicePayment.qbExportStatus, 'review_required');
        assert.equal(replay.body.invoicePayment.qbPaymentId, undefined);
        assert.equal(f.calls.length, 1); assert.equal(f.qbCalls, 1); assert.equal(await count('payments'), 1);
        await sql`UPDATE organizations SET qb_realm_id='realm-a' WHERE id=${orgId}`;
        await sql`DELETE FROM audit_logs WHERE entity_type='payment_export' AND action='complete'`;
        const before = await count('audit_logs');
        assert.equal((await f.capture()).body.invoicePayment.qbExportStatus, 'review_required');
        assert.equal(await count('audit_logs'), before); assert.equal(f.qbCalls, 1);
        await sql`DELETE FROM audit_logs WHERE entity_type='payment_export'`;
        await sql`DELETE FROM payments`;
        const missing = await f.capture(); assert.equal(missing.status, 200); assert.equal(missing.body.status, 'COMPLETED');
        assert.equal(missing.body.invoicePayment.recorded, false); assert.equal(await count('payments'), 0);
        assert.deepEqual(await actions(), ['confirmed', 'reserved', 'settled']);
        assert.equal(f.calls.length, 1); assert.equal(f.qbCalls, 1);
      } finally { await sql`UPDATE organizations SET qb_access_token=NULL,qb_refresh_token=NULL,qb_realm_id=NULL WHERE id=${orgId}`; }
    });
    await scenario('sync balance reset cannot reopen already allocated principal after QB failure', async f => {
      await sql`UPDATE organizations SET qb_access_token='synthetic',qb_refresh_token='synthetic',qb_realm_id='synthetic' WHERE id=${orgId}`;
      await sql`UPDATE customers SET qb_customer_id='201' WHERE id=${id(21)}`;
      f.qb.createPayment = async () => { f.qbCalls++; throw new Error('synthetic lost QB response'); };
      try {
        const paid = await f.capture(); assert.equal(paid.status, 200); assert.equal(paid.body.invoicePayment.qbExportStatus, 'review_required');
        await sql`UPDATE invoices SET balance='100.00',status='sent' WHERE id=${invoiceId}`;
        const again = await f.capture({ sourceId: 'retokenized', token: f.token('INV-1', 20000) });
        assert.equal(again.body.code, 'INVOICE_BALANCE_RESERVED'); assert.equal(f.calls.length, 1);
        assert.equal(await count('payments'), 1);
      } finally { await sql`UPDATE organizations SET qb_access_token=NULL,qb_refresh_token=NULL,qb_realm_id=NULL WHERE id=${orgId}`; }
    });
    await scenario('sync-reset partial allocation leaves at most remaining principal available', async f => {
      assert.equal((await f.capture({ amount: 40 })).status, 200);
      await sql`UPDATE invoices SET balance='100.00',status='sent' WHERE id=${invoiceId}`;
      assert.equal((await f.capture({ amount: 60.01, sourceId: 'too-much' })).body.code, 'INVOICE_BALANCE_RESERVED');
      assert.equal((await f.capture({ amount: 60, sourceId: 'remaining' })).status, 200);
      assert.equal(f.calls.length, 2);
    });
    await scenario('foreign-org allocations attached to own invoice fail closed before provider', async f => {
      await sql`INSERT INTO payments (org_id,invoice_id,amount,transaction_id) VALUES (${foreignOrg},${invoiceId},'10.00','foreign-allocation')`;
      const result = await f.capture({ amount: 10 });
      assert.equal(result.body.code, 'INVOICE_PAYMENT_REVIEW_REQUIRED'); assert.equal(result.body.retrySafe, false);
      assert.equal(f.calls.length, 0); assert.equal(await count('audit_logs'), 0);
    });
    await scenario('zero and signed reversal allocations preserve valid remaining balance', async f => {
      await sql`INSERT INTO payments (org_id,invoice_id,amount,transaction_id) VALUES
        (${orgId},${invoiceId},'0.00','zero-import'),
        (${orgId},${invoiceId},'40.00','prior-import'),
        (${orgId},${invoiceId},'-10.00','reversal-import')`;
      await sql`UPDATE invoices SET balance='70.00' WHERE id=${invoiceId}`;
      assert.equal((await f.capture({ amount: 70.01 })).body.code, 'INVOICE_BALANCE_RESERVED');
      assert.equal((await f.capture({ amount: 70 })).status, 200);
      assert.equal(f.calls.length, 1);
      assert.equal((await sql`SELECT balance FROM invoices WHERE id=${invoiceId}`)[0].balance, '0.00');
    });
    await scenario('negative allocations never raise the separate stored-balance cap', async f => {
      await sql`INSERT INTO payments (org_id,invoice_id,amount,transaction_id) VALUES (${orgId},${invoiceId},'-10.00','refund-import')`;
      await sql`UPDATE invoices SET balance='20.00' WHERE id=${invoiceId}`;
      assert.equal((await f.capture({ amount: 20.01 })).body.code, 'INVOICE_BALANCE_RESERVED');
      assert.equal((await f.capture({ amount: 20 })).status, 200); assert.equal(f.calls.length, 1);
    });
    await scenario('malformed/unknown provider results never fabricate confirmation and never retry', async f => {
      const mutations = [p => ({ ...p, id: undefined }), p => ({ ...p, status: undefined }), p => ({ ...p, amount_money: undefined }),
        p => ({ ...p, amount_money: { amount: 9999, currency: 'USD' } }), p => ({ ...p, amount_money: { amount: 10000, currency: 'CAD' } }),
        p => ({ ...p, location_id: 'other' }), p => ({ ...p, reference_id: 'INV-1' })];
      for (const mode of ['missing', 'json', '500', 'lost', ...mutations]) {
        await seed(); f.calls.length = 0; f.stored = []; f.mode = typeof mode === 'string' ? mode : 'completed'; f.mutate = typeof mode === 'function' ? mode : null;
        const first = await f.capture(); assert.equal(first.status, 409); assert.equal(first.body.retrySafe, false); assert.equal(first.body.ok, false);
        assert.equal((await f.capture()).status, 409); assert.equal((await f.capture({ sourceId: 'retokenized' })).status, 409);
        assert.equal(f.calls.length, 1); assert.equal(await count('payments'), 0); assert.deepEqual(await actions(), ['reserved']);
        assert.ok(!JSON.stringify(first).includes('raw-sensitive'));
      }
    });
    await scenario('definite rejection/terminal failed cancels release but never reuse the same intent', async f => {
      for (const mode of ['reject', 'failed', 'canceled']) {
        await seed(); f.calls.length = 0; f.mode = mode;
        const first = await f.capture(); assert.equal(first.status, 402); assert.equal(first.body.retrySafe, true);
        assert.equal((await f.capture()).status, 409); assert.equal(f.calls.length, 1);
        assert.deepEqual(await actions(), ['released', 'reserved']); assert.equal(await count('payments'), 0);
        f.mode = 'completed'; assert.equal((await f.capture({ sourceId: 'new-nonce' })).status, 200);
      }
    });
    await scenario('lost capture finishes from new reference webhook; older pending cannot regress', async f => {
      f.mode = 'lost'; assert.equal((await f.capture()).status, 409);
      const payment = f.lastPayment;
      assert.equal((await f.webhook()).status, 200); assert.equal(await count('payments'), 1);
      assert.equal((await f.webhook()).status, 200); assert.equal(await count('payments'), 1);
      assert.equal((await f.webhook({ ...payment, status: 'PENDING' })).status, 200);
      assert.equal(f.stored[0].status, 'COMPLETED'); assert.equal(f.stored[0].invoiceNumber, 'INV-1');
      assert.equal((await f.capture()).status, 200); assert.equal(f.calls.length, 1);
      assert.deepEqual(await actions(), ['confirmed', 'reserved', 'settled']);
      f.stored = []; assert.equal((await f.webhook(payment)).status, 200);
      assert.equal(f.stored[0].status, 'COMPLETED'); assert.equal(f.stored[0].amount, 100);
      assert.equal(await count('payments'), 1); assert.equal(f.calls.length, 1);
    });
    await scenario('webhook races capture result and duplicate callbacks without double local record', async f => {
      let release; f.gate = new Promise(resolve => { release = resolve; });
      const attempt = f.capture();
      while (!f.lastPayment) await new Promise(resolve => setTimeout(resolve, 5));
      const webhook = f.webhook(); release();
      const outcomes = await Promise.all([attempt, webhook, f.webhook()]);
      assert.ok(outcomes.every(r => r.status === 200)); assert.equal(await count('payments'), 1); assert.equal(f.calls.length, 1);
      assert.deepEqual(await actions(), ['confirmed', 'reserved', 'settled']);
    });
    await scenario('confirmed webhook beats late rejected HTTP response without releasing or retry permission', async f => {
      let release; f.gate = new Promise(resolve => { release = resolve; }); f.mode = 'reject';
      const attempt = f.capture(); while (!f.lastPayment) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal((await f.webhook()).status, 200); release();
      const result = await attempt; assert.equal(result.status, 409); assert.equal(result.body.retrySafe, false);
      assert.deepEqual(await actions(), ['confirmed', 'reserved', 'settled']);
    });
    await scenario('new references enforce own org, exact amount/location and canonical invoice mapping', async f => {
      f.mode = 'lost'; await f.capture();
      for (const patch of [{ amount_money: { amount: 9999, currency: 'USD' } }, { location_id: 'wrong' },
        { reference_id: `hos_${id(999)}` }]) assert.ok((await f.webhook({ ...f.lastPayment, ...patch })).status >= 400);
      const foreign = await f.api.reserveCapture({ orgId: foreignOrg, locationId: env.SQUARE_LOCATION_ID, sourceId: 'foreign', amountCents: 10000, invoiceNumber: 'FOREIGN' });
      assert.equal((await f.webhook({ ...f.lastPayment, reference_id: `hos_${foreign.intent.id}` })).status, 409);
      assert.equal(await count('payments'), 0);
      await sql`UPDATE invoices SET invoice_number='RENAMED' WHERE id=${invoiceId}`;
      assert.equal((await f.webhook()).status, 200);
      assert.equal((await sql`SELECT invoice_id FROM payments`)[0].invoice_id, invoiceId);
    });
    await scenario('legacy reference and validated order-only association continue to record', async f => {
      const payment = { id: 'legacy', status: 'COMPLETED', amount_money: { amount: 4000, currency: 'USD' },
        location_id: env.SQUARE_LOCATION_ID, reference_id: 'QB-101', source_type: 'BANK_ACCOUNT' };
      assert.equal((await f.webhook(payment)).status, 200);
      assert.equal((await sql`SELECT invoice_id FROM payments`)[0].invoice_id, invoiceId);
      f.stored.push({ id: 'old-order', orderId: 'order', invoiceNumber: 'INV-2', status: 'PENDING' });
      assert.equal((await f.webhook({ ...payment, id: 'order-payment', reference_id: undefined, order_id: 'order' })).status, 200);
      assert.equal(await count('payments'), 2);
      assert.equal((await f.webhook({ ...payment, status: 'PENDING' })).status, 200);
      assert.equal(f.stored.find(row => row.id === 'legacy').status, 'COMPLETED');
    });
    await scenario('local recording failure keeps reservation and webhook can recover', async f => {
      await sql.unsafe(`CREATE FUNCTION reject_capture_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sensitive-local-failure'; END $$`);
      await sql`CREATE TRIGGER reject_capture_record BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION reject_capture_record()`;
      try {
        const result = await f.capture(); assert.equal(result.status, 409); assert.equal(result.body.retrySafe, false);
        assert.equal(await count('payments'), 0); assert.deepEqual(await actions(), ['confirmed', 'reserved']);
        assert.equal((await f.capture({ sourceId: 'new' })).status, 409); assert.equal(f.calls.length, 1);
      } finally { await sql`DROP TRIGGER reject_capture_record ON payments`; }
      assert.equal((await f.webhook()).status, 200); assert.equal(await count('payments'), 1);
    });
    await scenario('separate process sees durable pending claim and cannot recreate it', async f => {
      f.mode = 'lost'; await f.capture();
      const child = `const postgres=require('postgres'); const {drizzle}=require('drizzle-orm/postgres-js');
        const sql=postgres(${JSON.stringify({ host: directory, port: 55439, database: 'postgres', user: 'capture_runtime', password, ssl: false, max: 1 })});
        const f={db:drizzle(sql)}; const m={exports:{}}; new Function('require','module','exports','__fixture','fetch','process',${JSON.stringify(await compile())})(require,m,m.exports,f,()=>{throw Error('network')},{env:${JSON.stringify(env)}});
        (async()=>{ const intent=await m.exports.getCaptureIntent(${JSON.stringify(orgId)},${JSON.stringify(f.lastPayment.reference_id)});
          if(intent.amountCents!==10000) throw Error('missing durable claim');
          const retry=await m.exports.reserveCapture(${JSON.stringify({ orgId, locationId: env.SQUARE_LOCATION_ID,
            sourceId: 'synthetic-nonce', amountCents: 10000, invoiceNumber: 'INV-1', token: f.token(), maxCents: 10350 })});
          if(retry.fresh || retry.result) throw Error('replayed durable claim');
          await sql.end(); })().catch(e=>{console.error(e);process.exit(1)});`;
      centerRun(process.execPath, ['-e', child], { cwd: root });
      assert.equal((await f.capture()).status, 409); assert.equal(f.calls.length, 1);
    });
    t.diagnostic('Real socket-only PostgreSQL; schema-derived tables/FKs/uniqueness; actual capture/webhook/intent/recording code; synthetic Square/QB; no production/env/provider calls or schema changes.');
  });
});
