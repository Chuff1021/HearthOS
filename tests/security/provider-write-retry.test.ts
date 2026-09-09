import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

type Reply = number | 'lost';
type Route = 'invoices' | 'purchase-orders';
type Flow = {
  name: string;
  route: Route;
  target: string;
  body?: Record<string, unknown>;
  url?: string;
  smtp?: boolean;
  successStatus: number;
  failureStatus?: number;
  optionalSend?: boolean;
};
type Options = {
  tokenStorageFails?: boolean;
  connectionChanged?: 'realm' | 'refresh' | 'org';
  refreshFails?: boolean;
  smtpFails?: boolean;
  cookieAuth?: boolean;
  denied?: boolean;
  operationReplies?: Record<string, Reply[]>;
};

const line = {
  Amount: 100.69, DetailType: 'SalesItemLineDetail', Description: 'Fixture service',
  SalesItemLineDetail: { ItemRef: { value: 'fixture-item' }, Qty: 1, UnitPrice: 100.69 },
};
const invoice = {
  Id: 'fixture-invoice', DocNumber: 'TEST-100', TotalAmt: 100.69, Balance: 100.69,
  CustomerRef: { value: 'fixture-customer' }, BillEmail: { Address: 'buyer@example.test' },
  Line: [line], SyncToken: '0',
};
const poBody = {
  vendorId: 'fixture-vendor',
  lines: [{ itemId: 'fixture-item', description: 'Fixture service', qty: 1, unitPrice: 100.69, amount: 100.69 }],
};
const fromEstimateBody = { action: 'from-estimate', vendorId: 'fixture-vendor', estimateId: 'fixture-estimate' };
const flows: Flow[] = [
  { name: 'invoice QB create', route: 'invoices', target: 'POST /invoice', body: { CustomerRef: invoice.CustomerRef, Line: [line] }, successStatus: 200 },
  { name: 'invoice UI create', route: 'invoices', target: 'POST /invoice', body: { customerId: 'fixture-customer', lineItems: [{ itemId: 'fixture-item', description: 'Fixture', qty: 1, unitPrice: 100.69, total: 100.69 }] }, successStatus: 200 },
  { name: 'invoice QB send', route: 'invoices', target: 'POST /invoice/fixture-invoice/send', body: { action: 'send', id: invoice.Id }, successStatus: 200 },
  { name: 'invoice update write', route: 'invoices', target: 'POST /invoice', body: { action: 'update', id: invoice.Id, updates: { PrivateNote: 'Fixture' } }, successStatus: 200 },
  { name: 'invoice update preflight', route: 'invoices', target: 'GET /invoice/fixture-invoice', body: { action: 'update', id: invoice.Id, updates: {} }, successStatus: 200 },
  { name: 'invoice post-update sync', route: 'invoices', target: 'GET /query', body: { action: 'update', id: invoice.Id, updates: {} }, successStatus: 200 },
  { name: 'invoice POST sync', route: 'invoices', target: 'GET /query', body: { action: 'sync' }, successStatus: 200 },
  { name: 'invoice SMTP invoice lookup', route: 'invoices', target: 'GET /invoice/fixture-invoice', body: { action: 'send', id: invoice.Id }, smtp: true, successStatus: 200 },
  { name: 'invoice SMTP customer lookup', route: 'invoices', target: 'GET /customer/fixture-customer', body: { action: 'send', id: invoice.Id }, smtp: true, successStatus: 200, failureStatus: 200 },
  { name: 'PO create', route: 'purchase-orders', target: 'POST /purchaseorder', body: poBody, successStatus: 201 },
  { name: 'PO from-estimate create', route: 'purchase-orders', target: 'POST /purchaseorder', body: fromEstimateBody, successStatus: 201 },
  { name: 'PO from-estimate lookup', route: 'purchase-orders', target: 'GET /estimate/fixture-estimate', body: fromEstimateBody, successStatus: 201 },
  { name: 'PO direct send', route: 'purchase-orders', target: 'POST /purchaseorder/fixture-po/send', body: { action: 'send', id: 'fixture-po' }, successStatus: 200 },
  { name: 'PO create then QB send', route: 'purchase-orders', target: 'POST /purchaseorder/fixture-po/send', body: { ...poBody, send: true, email: 'vendor@example.test' }, successStatus: 201, failureStatus: 201, optionalSend: true },
  { name: 'PO from-estimate then QB send', route: 'purchase-orders', target: 'POST /purchaseorder/fixture-po/send', body: { ...fromEstimateBody, send: true, email: 'vendor@example.test' }, successStatus: 201, failureStatus: 201, optionalSend: true },
  { name: 'PO GET by ID', route: 'purchase-orders', target: 'GET /purchaseorder/fixture-po', url: '?id=fixture-po', successStatus: 200 },
  { name: 'PO GET list', route: 'purchase-orders', target: 'GET /query', url: '', successStatus: 200 },
];

// Bundle the actual routes/client, replacing every service boundary before load.
// Nothing in the VM can use a real network, database, environment, or mailer.
const bundles = new Map<Route, Promise<string>>();
function bundleRoute(route: Route) {
  let promise = bundles.get(route);
  if (promise) return promise;
  const mocks: Record<string, string> = {
    '@/lib/security/crm-access': 'export const authorizeCrmApi = async () => fixture.denied ? Response.json({error:"denied"},{status:403}) : null;',
    '@/lib/security/public-links': 'export const signCustomerLink = () => "fixture-link";',
    'next/server': 'export const NextResponse = Response;',
    '@/lib/org': 'export const getOrCreateDefaultOrg = async () => { fixture.orgReads++; return {...fixture.org}; };',
    '@/db': `export const db = {select: fixture.select, update: fixture.update};
      export const organizations = {id:'org.id',qbRealmId:'org.realm',qbRefreshToken:'org.refresh'};
      export const invoices = {}; export const invoiceLineItems = {}; export const inventoryItems = {};`,
    'drizzle-orm': 'export const eq = (...args) => args; export const and = (...args) => args; export const or = and; export const asc = x => x;',
    '@/lib/quickbooks/sync': `import { QuickBooksClient } from '${process.cwd()}/src/lib/quickbooks/client.ts';
      export const getClientFromTokens = (access, refresh, realm) => {
        fixture.clients++;
        const client = new QuickBooksClient({clientId:'fixture',clientSecret:'fixture',redirectUri:'https://example.invalid',environment:'sandbox'});
        client.setRealmId(realm);
        client.setTokens({access_token:access,refresh_token:refresh,expires_in:3600,token_type:'bearer'});
        return client;
      };
      export const createInvoiceInQuickBooks = async (client, invoice) => client.createInvoice(invoice);
      export const syncInvoices = async client => { fixture.syncs++; return client.getInvoices(); };
      export const persistPurchaseOrdersToDb = async () => { fixture.imports++; };
      export const getCachedInvoices = () => [];
      export const getInvoicesForCustomer = () => [];
      export const getOutstandingInvoices = () => [];
      export const getTotalOutstanding = () => 0;
      export const getSyncStatus = () => ({});`,
    '@/lib/quickbooks/transform': 'export const transformInvoice = x => x; export const transformInvoices = x => x;',
    '@/lib/audit-log-store': 'export const addAuditLog = () => { fixture.audits++; };',
    '@/lib/email/smtp': `export const isSmtpConfigured = () => fixture.smtp;
      export const parseEmailList = () => [];
      export const sendSmtpEmail = async () => { fixture.emails++; if (fixture.smtpFails) throw new Error('private-fixture-mail-error'); };`,
    '@/lib/invoices/pdf': 'export const renderInvoicePdf = async () => { fixture.pdfs++; return Buffer.from("fixture-pdf"); };',
    '@/lib/purchase-orders/pdf': 'export const renderPurchaseOrderPdf = async () => { fixture.pdfs++; return Buffer.from("fixture-pdf"); };',
  };
  promise = build({
    entryPoints: [`src/app/api/quickbooks/${route}/route.ts`], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'offline-provider-boundaries', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'fixture' };
        if (args.path.startsWith('@/')) throw new Error(`Unmocked application dependency: ${args.path}`);
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }],
  }).then(result => result.outputFiles[0].text);
  bundles.set(route, promise);
  return promise;
}

async function exercise(flow: Flow, replies: Reply[], options: Options = {}) {
  const fixture = {
    org: { id: 'fixture-org', qbAccessToken: 'old-access', qbRefreshToken: 'old-refresh', qbRealmId: 'fixture-realm' },
    denied: options.denied, smtp: flow.smtp, smtpFails: options.smtpFails,
    targetCalls: 0, refreshCalls: 0, clients: 0, orgReads: 0, imports: 0, audits: 0, syncs: 0, emails: 0, pdfs: 0,
    calls: [] as { operation: string; authorization: string | undefined; body: unknown }[],
    warnings: [] as unknown[][], unexpected: [] as string[],
    tokenWrites: [] as Record<string, unknown>[], tokenPredicates: [] as unknown[],
    tokenWriteCallCounts: [] as number[], refreshInputs: [] as (string | null)[],
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: (predicate: [string, string][]) => ({ returning: async () => {
      fixture.tokenWrites.push(values);
      fixture.tokenPredicates.push(predicate);
      fixture.tokenWriteCallCounts.push(fixture.calls.length);
      if (options.tokenStorageFails) throw new Error('private-fixture-storage-error');
      const columns: Record<string, string> = { 'org.id': fixture.org.id, 'org.realm': fixture.org.qbRealmId, 'org.refresh': fixture.org.qbRefreshToken };
      if (!predicate.every(([key, value]) => columns[key] === value)) return [];
      fixture.org.qbAccessToken = String(values.qbAccessToken);
      fixture.org.qbRefreshToken = String(values.qbRefreshToken);
      return [{ id: fixture.org.id }];
    } }) }) }),
  };
  const loaded = { exports: {} as Record<'GET' | 'POST', (request: unknown) => Promise<Response>> };
  runInNewContext(await bundleRoute(flow.route), {
    module: loaded, exports: loaded.exports, fixture, Response, URL, URLSearchParams, Buffer, Date, Error,
    process: { env: { HEARTHOS_PUBLIC_ORIGIN: 'https://example.invalid' } },
    console: { error: (...args: unknown[]) => fixture.warnings.push(args) },
    fetch: async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      if (url === 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer') {
        fixture.refreshCalls++;
        fixture.refreshInputs.push(new URLSearchParams(init.body).get('refresh_token'));
        if (options.refreshFails) return Response.json({ error: 'private-fixture-refresh-error' }, { status: 400 });
        if (options.connectionChanged === 'realm') fixture.org.qbRealmId = 'replacement-realm';
        if (options.connectionChanged === 'refresh') fixture.org.qbRefreshToken = 'replacement-refresh';
        if (options.connectionChanged === 'org') fixture.org.id = 'replacement-org';
        const suffix = fixture.refreshCalls === 1 ? '' : `-${fixture.refreshCalls}`;
        return Response.json({ access_token: `new-access${suffix}`, refresh_token: `new-refresh${suffix}`, expires_in: 3600, token_type: 'bearer' });
      }
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://sandbox-quickbooks.api.intuit.com');
      assert.ok(parsed.pathname.startsWith('/v3/company/fixture-realm/'));
      const path = parsed.pathname.slice('/v3/company/fixture-realm'.length);
      const operation = `${init.method} ${path}`;
      fixture.calls.push({ operation, authorization: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : undefined });
      const responses: Record<string, unknown> = {
        'POST /invoice': { Invoice: invoice },
        'GET /invoice/fixture-invoice': { Invoice: invoice },
        'POST /invoice/fixture-invoice/send': { Invoice: invoice },
        'GET /customer/fixture-customer': { Customer: { Id: 'fixture-customer' } },
        'GET /estimate/fixture-estimate': { Estimate: { Id: 'fixture-estimate', Line: [line] } },
        'POST /purchaseorder': { PurchaseOrder: { Id: 'fixture-po', TotalAmt: 100.69 } },
        'POST /purchaseorder/fixture-po/send': { PurchaseOrder: { Id: 'fixture-po', TotalAmt: 100.69 } },
        'GET /purchaseorder/fixture-po': { PurchaseOrder: { Id: 'fixture-po', TotalAmt: 100.69 } },
        'GET /query': { QueryResponse: flow.route === 'invoices' ? { Invoice: [invoice] } : { PurchaseOrder: [{ Id: 'fixture-po', TotalAmt: 100.69 }] } },
      };
      if (!Object.hasOwn(responses, operation)) {
        fixture.unexpected.push(operation);
        throw new Error('Unexpected fixture operation');
      }
      const attempt = fixture.calls.filter(call => call.operation === operation).length - 1;
      const reply = options.operationReplies && Object.hasOwn(options.operationReplies, operation)
        ? options.operationReplies[operation][attempt]
        : operation === flow.target ? replies[fixture.targetCalls++] : 200;
      if (reply === undefined) {
        fixture.unexpected.push(`Replay: ${operation}`);
        throw new Error('Unexpected provider replay');
      }
      if (reply === 'lost') throw new Error('private-fixture-lost-response');
      return Response.json(reply === 200 ? responses[operation] : { Fault: { type: 'private-fixture-provider-error' } }, { status: reply });
    },
  });
  const cookieValues: Record<string, string> = { qb_access_token: 'old-access', qb_refresh_token: 'old-refresh', qb_realm_id: 'fixture-realm' };
  const response = await loaded.exports[flow.body ? 'POST' : 'GET']({
    url: `https://example.invalid/api/quickbooks/${flow.route}${flow.url || ''}`,
    cookies: { get: (key: string) => options.cookieAuth ? { value: cookieValues[key] } : undefined },
    json: async () => flow.body,
  });
  assert.deepEqual(fixture.unexpected, []);
  assert.ok(fixture.warnings.every(args => args.length === 1 && typeof args[0] === 'string'));
  assert.doesNotMatch(JSON.stringify(fixture.warnings), /private-fixture|old-access|old-refresh|new-access|new-refresh|replacement-/);
  return { response, body: await response.json(), fixture };
}

function assertRotation(fixture: Awaited<ReturnType<typeof exercise>>['fixture'], rotations = 1) {
  assert.equal(fixture.refreshCalls, rotations);
  assert.equal(fixture.tokenWrites.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.tokenPredicates)), [[
    ['org.id', 'fixture-org'], ['org.realm', 'fixture-realm'], ['org.refresh', 'old-refresh'],
  ]]);
  const suffix = rotations === 1 ? '' : `-${rotations}`;
  assert.equal(fixture.tokenWrites[0].qbAccessToken, `new-access${suffix}`);
  assert.equal(fixture.tokenWrites[0].qbRefreshToken, `new-refresh${suffix}`);
  assert.ok(fixture.tokenWrites[0].qbTokenExpiresAt instanceof Date);
}

function assertSuccessBody(flow: Flow, body: Record<string, any>) {
  if (flow.route === 'invoices') {
    assert.equal(body.success, true);
    const result = body.invoice || body.invoices?.[0];
    assert.equal(result.Id, invoice.Id);
    assert.equal(result.TotalAmt, 100.69);
  } else {
    const result = body.purchaseOrder || body.purchaseOrders?.[0];
    assert.equal(result.Id, 'fixture-po');
    assert.equal(result.TotalAmt, 100.69);
  }
}

for (const flow of flows) {
  for (const reply of ['lost', 400, 429, 500] as const) {
    test(`${flow.name}: ${reply} never refreshes or replays`, async () => {
      const { response, body, fixture } = await exercise(flow, [reply]);
      assert.equal(response.status, flow.failureStatus ?? 500);
      assert.equal(fixture.targetCalls, 1);
      assert.equal(fixture.refreshCalls, 0);
      assert.equal(fixture.tokenWrites.length, 0);
      if (flow.optionalSend) {
        assert.equal(body.purchaseOrder.Id, 'fixture-po');
        assert.equal(body.sent, false);
        assert.ok(body.emailError);
        assert.equal(fixture.calls.filter(call => call.operation === 'POST /purchaseorder').length, 1);
      }
      if (flow.name === 'invoice post-update sync') {
        assert.equal(fixture.calls.filter(call => call.operation === 'POST /invoice').length, 1);
      }
    });
  }

  test(`${flow.name}: explicit 401 retries once and persists guarded rotation`, async () => {
    const { response, body, fixture } = await exercise(flow, [401, 200]);
    assert.equal(response.status, flow.successStatus);
    assertSuccessBody(flow, body);
    assert.equal(fixture.targetCalls, 2);
    assertRotation(fixture);
    assert.equal(fixture.org.qbRefreshToken, 'new-refresh');
    assert.equal(fixture.warnings.length, 0);
    const attempts = fixture.calls.filter(call => call.operation === flow.target);
    assert.equal(attempts[0].authorization, 'Bearer old-access');
    assert.equal(attempts[1].authorization, 'Bearer new-access');
    assert.deepEqual(attempts[0].body, attempts[1].body);
    if (flow.optionalSend) assert.equal(body.sent, true);
    if (flow.smtp) assert.equal(fixture.emails, 1);
    assert.equal(fixture.clients, 1);
  });

  for (const option of ['tokenStorageFails', 'connectionChanged'] as const) {
    test(`${flow.name}: ${option} preserves provider success`, async () => {
      const options: Options = option === 'tokenStorageFails' ? { tokenStorageFails: true } : { connectionChanged: 'realm' };
      const { response, body, fixture } = await exercise(flow, [401, 200], options);
      assert.equal(response.status, flow.successStatus);
      assertSuccessBody(flow, body);
      assert.equal(fixture.targetCalls, 2);
      assertRotation(fixture);
      assert.equal(fixture.org.qbAccessToken, 'old-access');
      assert.equal(fixture.org.qbRealmId, option === 'connectionChanged' ? 'replacement-realm' : 'fixture-realm');
      assert.equal(fixture.warnings.length, 1);
      if (flow.smtp) assert.equal(fixture.emails, 1);
    });
  }

  for (const reply of ['lost', 401] as const) {
    test(`${flow.name}: ${reply} after refresh stops and still persists rotation`, async () => {
      const { response, fixture } = await exercise(flow, [401, reply]);
      assert.equal(response.status, flow.failureStatus ?? 500);
      assert.equal(fixture.targetCalls, 2);
      assertRotation(fixture);
    });
  }

  test(`${flow.name}: failed refresh does not retry the operation`, async () => {
    const { response, fixture } = await exercise(flow, [401], { refreshFails: true });
    assert.equal(response.status, flow.failureStatus ?? 500);
    assert.equal(fixture.targetCalls, 1);
    assert.equal(fixture.refreshCalls, 1);
    assert.equal(fixture.tokenWrites.length, 0);
  });
}

for (const flow of flows.filter(flow => flow.name === 'invoice QB create' || flow.name === 'PO create')) {
  test(`${flow.name}: unchanged credentials do not write tokens`, async () => {
    const { response, fixture } = await exercise(flow, [200]);
    assert.equal(response.status, flow.successStatus);
    assert.equal(fixture.targetCalls, 1);
    assert.equal(fixture.tokenWrites.length, 0);
  });

  test(`${flow.name}: cookie credentials still use guarded organization persistence`, async () => {
    const { response, fixture } = await exercise(flow, [401, 200], { cookieAuth: true });
    assert.equal(response.status, flow.successStatus);
    assert.equal(fixture.orgReads, 1);
    assertRotation(fixture);
  });

  for (const connectionChanged of ['org', 'refresh'] as const) {
    test(`${flow.name}: changed ${connectionChanged} prevents stale credential overwrite`, async () => {
      const { response, fixture } = await exercise(flow, [401, 200], { connectionChanged });
      assert.equal(response.status, flow.successStatus);
      assertRotation(fixture);
      assert.equal(fixture.org.qbAccessToken, 'old-access');
      assert.equal(fixture.warnings.length, 1);
    });
  }

  test(`${flow.name}: storage failure preserves the original lost response`, async () => {
    const { response, body, fixture } = await exercise(flow, [401, 'lost'], { tokenStorageFails: true });
    assert.equal(response.status, 500);
    assert.match(body.error, /private-fixture-lost-response/);
    assert.doesNotMatch(body.error, /storage/);
    assert.equal(fixture.targetCalls, 2);
    assertRotation(fixture);
  });

  test(`${flow.name}: denial performs no organization or provider I/O`, async () => {
    const { response, fixture } = await exercise(flow, [], { denied: true });
    assert.equal(response.status, 403);
    assert.equal(fixture.orgReads, 0);
    assert.equal(fixture.clients, 0);
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.tokenWrites.length, 0);
  });
}

test('invoice SMTP failure after a QB refresh is not resent and still persists rotation', async () => {
  const flow = flows.find(flow => flow.name === 'invoice SMTP invoice lookup')!;
  const { response, fixture } = await exercise(flow, [401, 200], { smtpFails: true });
  assert.equal(response.status, 500);
  assert.equal(fixture.emails, 1);
  assert.equal(fixture.pdfs, 1);
  assertRotation(fixture);
});

for (const fromEstimate of [false, true]) {
  test(`PO ${fromEstimate ? 'from-estimate' : 'direct'} create then SMTP is not resent on token persistence failure`, async () => {
    const flow: Flow = {
      name: 'PO SMTP', route: 'purchase-orders', target: 'POST /purchaseorder', smtp: true,
      body: { ...(fromEstimate ? fromEstimateBody : poBody), send: true, email: 'vendor@example.test' }, successStatus: 201,
    };
    const { response, body, fixture } = await exercise(flow, [401, 200], { tokenStorageFails: true });
    assert.equal(response.status, 201);
    assert.equal(body.sentVia, 'smtp');
    assert.equal(fixture.emails, 1);
    assert.equal(fixture.pdfs, 1);
    assert.equal(fixture.targetCalls, 2);
    assertRotation(fixture);
  });
}

const poSteps = ['GET /estimate/fixture-estimate', 'POST /purchaseorder', 'POST /purchaseorder/fixture-po/send'];
const multiStepPo = flows.find(flow => flow.name === 'PO from-estimate then QB send')!;

test('PO from-estimate reuses lookup rotation for create and send, persisting only after send', async () => {
  const { response, body, fixture } = await exercise(multiStepPo, [200], {
    operationReplies: { [poSteps[0]]: [401, 200] },
  });
  assert.equal(response.status, 201);
  assert.equal(body.sent, true);
  assert.equal(fixture.clients, 1);
  assertRotation(fixture);
  assert.deepEqual(fixture.refreshInputs, ['old-refresh']);
  assert.deepEqual(fixture.calls.map(call => [call.operation, call.authorization]), [
    [poSteps[0], 'Bearer old-access'], [poSteps[0], 'Bearer new-access'],
    [poSteps[1], 'Bearer new-access'], [poSteps[2], 'Bearer new-access'],
  ]);
  assert.deepEqual(fixture.tokenWriteCallCounts, [4]);
  assert.equal(fixture.warnings.length, 0);
});

for (const outcome of ['success', 'storage-failure', 'realm', 'refresh', 'org'] as const) {
  test(`PO lookup/create/send rotations: ${outcome} uses latest credentials and one final original-connection CAS`, async () => {
    const { response, body, fixture } = await exercise(multiStepPo, [], {
      operationReplies: Object.fromEntries(poSteps.map(operation => [operation, [401, 200]])),
      tokenStorageFails: outcome === 'storage-failure',
      connectionChanged: outcome === 'realm' || outcome === 'refresh' || outcome === 'org' ? outcome : undefined,
    });
    assert.equal(response.status, 201);
    assertSuccessBody(multiStepPo, body);
    assert.equal(body.sent, true);
    assert.equal(fixture.clients, 1);
    assertRotation(fixture, 3);
    assert.deepEqual(fixture.refreshInputs, ['old-refresh', 'new-refresh', 'new-refresh-2']);
    assert.deepEqual(fixture.calls.map(call => [call.operation, call.authorization]), [
      [poSteps[0], 'Bearer old-access'], [poSteps[0], 'Bearer new-access'],
      [poSteps[1], 'Bearer new-access'], [poSteps[1], 'Bearer new-access-2'],
      [poSteps[2], 'Bearer new-access-2'], [poSteps[2], 'Bearer new-access-3'],
    ]);
    for (const operation of poSteps) {
      const attempts = fixture.calls.filter(call => call.operation === operation);
      assert.deepEqual(attempts[0].body, attempts[1].body);
    }
    assert.deepEqual(fixture.tokenWriteCallCounts, [6]);
    assert.equal(fixture.org.qbAccessToken, outcome === 'success' ? 'new-access-3' : 'old-access');
    assert.equal(fixture.org.qbRefreshToken, outcome === 'success' ? 'new-refresh-3' : outcome === 'refresh' ? 'replacement-refresh' : 'old-refresh');
    assert.equal(fixture.warnings.length, outcome === 'success' ? 0 : 1);
  });
}

for (const failedStep of [1, 2]) {
  test(`PO multi-step lost ${failedStep === 1 ? 'create' : 'send'} never replays and final storage failure preserves outcome`, async () => {
    const { response, body, fixture } = await exercise(multiStepPo, [], {
      operationReplies: Object.fromEntries(poSteps.map((operation, index) => [operation, [401, index === failedStep ? 'lost' : 200]])),
      tokenStorageFails: true,
    });
    assert.equal(response.status, failedStep === 1 ? 500 : 201);
    if (failedStep === 2) {
      assertSuccessBody(multiStepPo, body);
      assert.equal(body.sent, false);
    }
    assert.match(failedStep === 1 ? body.error : body.emailError, /private-fixture-lost-response/);
    assert.equal(fixture.clients, 1);
    assertRotation(fixture, failedStep + 1);
    assert.deepEqual(fixture.refreshInputs, ['old-refresh', 'new-refresh', 'new-refresh-2'].slice(0, failedStep + 1));
    assert.deepEqual(fixture.calls.map(call => call.operation), poSteps.slice(0, failedStep + 1).flatMap(operation => [operation, operation]));
    assert.deepEqual(fixture.tokenWriteCallCounts, [(failedStep + 1) * 2]);
    assert.equal(fixture.warnings.filter(args => String(args[0]).includes('token persistence failed')).length, 1);
  });
}
