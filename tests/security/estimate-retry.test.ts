import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

type Reply = number | 'lost';

async function exercise(replies: Reply[], options: { send?: boolean; tokenStorageFails?: boolean; connectionChanged?: boolean } = {}) {
  const fixture = {
    providerCalls: 0, refreshCalls: 0, imports: 0, audits: 0,
    tokenWrites: [] as unknown[], tokenPredicates: [] as unknown[], warnings: [] as string[],
    select: () => ({ from: () => ({ where: async () => [{ qbItemId: 'fixture-item', name: 'Service', sku: 'SERVICE' }] }) }),
    update: () => ({ set: (values: unknown) => ({ where: (predicate: unknown) => ({ returning: async () => {
      fixture.tokenWrites.push(values);
      fixture.tokenPredicates.push(predicate);
      if (options.tokenStorageFails) throw new Error('synthetic storage failure');
      return options.connectionChanged ? [] : [{ id: 'fixture-org' }];
    } }) }) }),
  };
  const mocks: Record<string, string> = {
    '@/lib/security/crm-access': 'export const authorizeCrmApi = async () => null;',
    '@/lib/security/public-links': 'export const signCustomerLink = () => { throw new Error("Unexpected customer link"); };',
    'next/server': 'export const NextResponse = Response;',
    '@/lib/org': 'export const getOrCreateDefaultOrg = async () => ({id: "fixture-org", qbAccessToken: "old-access", qbRefreshToken: "old-refresh", qbRealmId: "fixture-realm"});',
    '@/db': `export const db = {select: fixture.select, update: fixture.update};
      export const organizations = {id: 'org.id', qbRealmId: 'org.realm', qbRefreshToken: 'org.refresh'};
      export const estimates = {}; export const estimateLineItems = {}; export const inventoryItems = {};`,
    'drizzle-orm': 'export const eq = (...args) => args; export const and = (...args) => args; export const or = and; export const asc = x => x;',
    '@/lib/quickbooks/sync': `import { QuickBooksClient } from '${process.cwd()}/src/lib/quickbooks/client.ts';
      export const getClientFromTokens = (access, refresh, realm) => {
        const client = new QuickBooksClient({clientId:'fixture',clientSecret:'fixture',redirectUri:'https://example.invalid',environment:'sandbox'});
        client.setRealmId(realm);
        client.setTokens({access_token:access,refresh_token:refresh,expires_in:3600,token_type:'bearer'});
        return client;
      };
      export const persistEstimatesToDb = async () => { fixture.imports++; };`,
    '@/lib/audit-log-store': 'export const addAuditLog = () => { fixture.audits++; };',
    '@/lib/email/smtp': 'export const isSmtpConfigured = () => false; export const parseEmailList = () => []; export const sendSmtpEmail = () => {throw new Error("Unexpected email");};',
    '@/lib/estimates/pdf': 'export const renderEstimatePdf = () => {throw new Error("Unexpected PDF");};',
  };
  const bundle = await build({
    entryPoints: ['src/app/api/quickbooks/estimates/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'estimate-retry-fixture', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }],
  });
  const loaded = { exports: {} as { POST: (request: unknown) => Promise<Response> } };
  runInNewContext(bundle.outputFiles[0].text, {
    module: loaded, exports: loaded.exports, fixture, Response, URL, URLSearchParams, Buffer, Date, Error,
    console: { error: (message: string) => fixture.warnings.push(message) },
    fetch: async (url: string) => {
      if (url === 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer') {
        fixture.refreshCalls++;
        return Response.json({access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer'});
      }
      assert.match(url, /^https:\/\/sandbox-quickbooks\.api\.intuit\.com\/v3\/company\/fixture-realm\/estimate/);
      const reply = replies[fixture.providerCalls++];
      if (reply === undefined) throw new Error('Unexpected provider replay');
      if (reply === 'lost') throw new Error('synthetic lost response');
      return Response.json(reply === 200 ? { Estimate: { Id: 'fixture-estimate', TotalAmt: 100.69 } } : { Fault: { type: 'synthetic' } }, { status: reply });
    },
  });
  const body = options.send ? { action: 'send', id: 'fixture-estimate' } : {
    customerId: 'fixture-customer', note: 'Synthetic test only',
    lines: [{ itemId: 'fixture-item', description: 'Test', qty: 1, unitPrice: 100.69, amount: 100.69 }],
  };
  const response = await loaded.exports.POST({ cookies: { get: () => undefined }, json: async () => body });
  return { response, fixture };
}

for (const reply of ['lost', 400, 429, 500] as const) {
  test(`estimate ${reply} response is not automatically replayed or refreshed`, async () => {
    const { response, fixture } = await exercise([reply]);
    assert.equal(response.status, 500);
    assert.equal(fixture.providerCalls, 1);
    assert.equal(fixture.refreshCalls, 0);
    assert.equal(fixture.imports, 0);
    assert.equal(fixture.audits, 0);
  });
}

test('estimate send with a lost response is not emailed again', async () => {
  const { response, fixture } = await exercise(['lost'], { send: true });
  assert.equal(response.status, 500);
  assert.equal(fixture.providerCalls, 1);
  assert.equal(fixture.refreshCalls, 0);
});

test('explicit 401 refreshes once and persists rotated credentials with account and token guards', async () => {
  const { response, fixture } = await exercise([401, 200]);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).estimate.TotalAmt, 100.69);
  assert.equal(fixture.providerCalls, 2);
  assert.equal(fixture.refreshCalls, 1);
  assert.equal(fixture.imports, 1);
  assert.equal(fixture.audits, 1);
  assert.equal(fixture.tokenWrites.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.tokenPredicates)), [[
    ['org.id', 'fixture-org'], ['org.realm', 'fixture-realm'], ['org.refresh', 'old-refresh'],
  ]]);
});

test('failed request after refresh does not trigger a second refresh or replay', async () => {
  const { response, fixture } = await exercise([401, 'lost']);
  assert.equal(response.status, 500);
  assert.equal(fixture.providerCalls, 2);
  assert.equal(fixture.refreshCalls, 1);
  assert.equal(fixture.tokenWrites.length, 1);
});

test('repeated unauthorized response stops after one credential refresh', async () => {
  const { response, fixture } = await exercise([401, 401]);
  assert.equal(response.status, 500);
  assert.equal(fixture.providerCalls, 2);
  assert.equal(fixture.refreshCalls, 1);
});

for (const option of ['tokenStorageFails', 'connectionChanged'] as const) {
  test(`${option} does not disguise a successful estimate or cause another provider write`, async () => {
    const { response, fixture } = await exercise([401, 200], { [option]: true });
    assert.equal(response.status, 201);
    assert.equal(fixture.providerCalls, 2);
    assert.equal(fixture.refreshCalls, 1);
    assert.equal(fixture.tokenWrites.length, 1);
    assert.equal(fixture.warnings.length, 1);
  });
}
