import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

// All records are synthetic and exist only inside the offline test process.
async function harness(denied = false, failedKind = '') {
  const fixture = {
    denied, orgReads: 0, guards: [] as unknown[], started: [] as string[],
    limits: [] as number[], predicates: [] as unknown[], joins: [] as unknown[],
    release: {} as Record<string, () => void>,
    rows: {
      customers: Array.from({ length: 12 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        qbCustomerId: `external-${index}`, companyName: 'Synthetic Organization',
        firstName: 'Synthetic', lastName: 'Contact', email: 'offline@example.invalid',
        addressLine1: 'TEST-ONLY LOCATION', city: 'Fixture City',
      })),
      invoices: Array.from({ length: 12 }, (_, index) => ({
        invoice: { id: `local-invoice-${index}`, qbInvoiceId: index ? null : 'external/invoice', invoiceNumber: 'TEST-100', totalAmount: '42' },
        customerCompany: 'Synthetic Organization',
      })),
      jobs: Array.from({ length: 12 }, (_, index) => ({ id: `job-${index}`, jobNumber: 'TEST-100', title: 'Synthetic visit', customerName: 'Synthetic Contact', propertyAddress: 'TEST-ONLY LOCATION' })),
    } as Record<string, unknown[]>,
    read(kind: string, limit?: number) {
      this.started.push(kind);
      if (kind === failedKind) return Promise.reject(new Error('Synthetic private database error'));
      return new Promise<unknown[]>((resolve) => { this.release[kind] = () => resolve(this.rows[kind].slice(0, limit)); });
    },
    select() {
      let kind = '';
      let limit = 0;
      const builder = {
        from(table: { name: string }) { kind = table.name; return builder; },
        leftJoin(_table: unknown, predicate: unknown) { fixture.joins.push(predicate); return builder; },
        where(predicate: unknown) { fixture.predicates.push(predicate); return builder; },
        orderBy() { return builder; },
        limit(value: number) { limit = value; fixture.limits.push(value); return builder; },
        then(resolve: (value: unknown[]) => void, reject: (error: unknown) => void) { return fixture.read(kind, limit).then(resolve, reject); },
      };
      return builder;
    },
  };
  const mocks: Record<string, string> = {
    'server-only': '',
    'next/server': 'export const NextResponse = Response;',
    '@/lib/security/crm-access': 'export const authorizeCrmApi = async (...args) => { fixture.guards.push(args); return fixture.denied ? Response.json({error:"Denied"}, {status:403}) : null; };',
    '@/lib/org': 'export const getOrCreateDefaultOrg = async () => { fixture.orgReads++; return {id:"synthetic-org"}; };',
    '../jobs/route': 'export const getJobs = () => fixture.read("jobs");',
    '@/db': `const table = name => new Proxy({name}, {get: (target, key) => key === 'name' ? name : name + '.' + String(key)});
      export const customers = table('customers'); export const invoices = table('invoices');
      export const db = {select: () => fixture.select()};`,
    'drizzle-orm': `export const and = (...args) => ['and', ...args]; export const or = (...args) => ['or', ...args];
      export const eq = (...args) => ['eq', ...args]; export const ilike = (...args) => ['ilike', ...args];
      export const desc = value => value; export const sql = (strings, ...values) => ['sql', ...values];`,
  };
  const result = await build({ entryPoints: ['src/app/api/search/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'customer-search-offline', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const loaded = { exports: {} as { GET: (request: { url: string }) => Promise<Response> } };
  runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, fixture, Response, URL });
  return { fixture, get: (q: string) => loaded.exports.GET({ url: `https://example.invalid/api/search?q=${encodeURIComponent(q)}` }) };
}

test('global search starts all three reads before any resolves, keeps caps and exact destination IDs', async () => {
  const { fixture, get } = await harness();
  const pending = get('TEST-100');
  await new Promise(setImmediate);
  assert.deepEqual([...fixture.started].sort(), ['customers', 'invoices', 'jobs']);
  assert.deepEqual(fixture.limits, [8, 8]);
  Object.values(fixture.release).forEach(release => release());
  const response = await pending;
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['customers', 'jobs', 'invoices']);
  assert.deepEqual([body.customers.length, body.jobs.length, body.invoices.length], [8, 5, 8]);
  assert.equal(body.customers[0].id, '00000000-0000-4000-8000-000000000000');
  assert.equal(body.customers[0].href, `/customers/${body.customers[0].id}`);
  assert.match(body.customers[0].subtitle, /TEST-ONLY LOCATION/);
  assert.match(body.customers[0].subtitle, /offline@example.invalid/);
  assert.equal(body.invoices[0].href, '/invoices?id=external%2Finvoice');
  assert.equal(body.invoices[1].href, '/invoices?id=local-invoice-1');
  assert.equal(body.jobs[0].href, '/jobs?id=job-0');
  assert.equal(fixture.orgReads, 1);
  assert.match(JSON.stringify(fixture.predicates), /customers.orgId.*synthetic-org/);
  assert.match(JSON.stringify(fixture.predicates), /invoices.orgId.*synthetic-org/);
  assert.match(JSON.stringify(fixture.predicates), /customers.addressLine1/);
  assert.match(JSON.stringify(fixture.predicates), /customers.phoneAlt/);
  assert.equal(JSON.stringify(fixture.joins), '[["and",["eq","customers.id","invoices.customerId"],["eq","customers.orgId","synthetic-org"]]]');
});

test('denied and short queries perform no organization or data reads', async () => {
  for (const denied of [false, true]) {
    const { fixture, get } = await harness(denied);
    const response = await get(denied ? 'Synthetic' : 'x');
    assert.equal(response.status, denied ? 403 : 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(fixture.orgReads, 0);
    assert.deepEqual(fixture.started, []);
    assert.equal(JSON.stringify(fixture.guards), '[["/api/search","GET"]]');
  }
});

test('each failed read returns a generic private no-store error, never partial results or private details', async () => {
  for (const kind of ['customers', 'invoices', 'jobs']) {
    const { fixture, get } = await harness(false, kind);
    const response = await get('Synthetic');
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(await response.json(), { error: 'Search is temporarily unavailable. Please try again.' });
    Object.values(fixture.release).forEach(release => release());
  }
});

test('literal wildcard input is escaped and query size is bounded', async () => {
  const { fixture, get } = await harness();
  const pending = get(`TEST_% ${'x'.repeat(300)}`);
  await new Promise(setImmediate);
  const serialized = JSON.stringify(fixture.predicates);
  assert.ok(serialized.includes('TEST\\\\_\\\\%'));
  assert.ok(!serialized.includes('x'.repeat(161)));
  Object.values(fixture.release).forEach(release => release());
  await pending;
});

test('destination source contracts require local customer UUID but retain invoice external-ID preference', () => {
  const profile = readFileSync('src/app/customers/[id]/page.tsx', 'utf8');
  const detail = readFileSync('src/app/api/customers/[id]/route.ts', 'utf8');
  const invoices = readFileSync('src/app/api/invoices/route.ts', 'utf8');
  assert.match(profile, /\/api\/customers\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(detail, /eq\(customers.id, id\)/);
  assert.match(invoices, /id: invoice.qbInvoiceId \|\| invoice.id/);
});
