import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const invoiceId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const body = { invoiceNumber: 'INV-TEST', amount: 10.29, paymentMethod: 'check', requestId };
const recorded = { recorded: true, invoiceId, invoiceNumber: body.invoiceNumber, balance: 89.71, paid: false,
  qbExportStatus: 'exported', tokenPersistenceStatus: 'unchanged' };

async function bundle(entry: string, mocks: Record<string, string>) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    plugins: [{ name: 'manual-payment-offline', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.kind === 'entry-point') return undefined;
        if (!Object.hasOwn(mocks, args.path)) throw new Error(`Unapproved dependency: ${args.path}`);
        return { path: args.path, namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  return result.outputFiles[0].text;
}

async function routeHarness() {
  const fixture = { denied: null as Response | null, authCalls: [] as unknown[], reads: 0,
    calls: [] as Record<string, unknown>[], reply: recorded as Record<string, unknown>, fail: false, uuids: 0,
    uuid: () => `00000000-0000-4000-8000-${String(++fixture.uuids).padStart(12, '0')}`,
    async record(input: Record<string, unknown>) {
      fixture.calls.push(input);
      if (fixture.fail) throw new Error('SECRET raw database/provider error');
      return fixture.reply;
    },
  };
  const code = await bundle('src/app/api/invoices/payments/route.ts', {
    'next/server': 'export const NextResponse = Response;',
    'node:crypto': 'export const randomUUID = () => fixture.uuid();',
    '@/lib/security/crm-access': 'export const authorizeCrmApi = async (...args) => { fixture.authCalls.push(args); return fixture.denied; };',
    '@/lib/invoices/record-payment': 'export const recordInvoicePayment = input => fixture.record(input);',
  });
  const loaded = { exports: {} as { POST: (request: unknown) => Promise<Response> } };
  runInNewContext(code, { fixture, module: loaded, exports: loaded.exports, Response });
  const invoke = (input: unknown = body, malformed = false) => loaded.exports.POST({ json: async () => {
    fixture.reads++; if (malformed) throw new Error('SECRET parser error'); return input;
  } });
  return { fixture, invoke };
}

test('manual route auth runs before parsing or identity allocation', async () => {
  const { fixture, invoke } = await routeHarness();
  fixture.denied = Response.json({ error: 'Denied' }, { status: 403 });
  assert.equal((await invoke(null, true)).status, 403);
  assert.equal(fixture.reads, 0);
  assert.equal(fixture.uuids, 0);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.authCalls)), [['/api/invoices/payments', 'POST']]);
});

test('manual route preserves historical check identity while no-check request UUID is stable and namespaced', async () => {
  const { fixture, invoke } = await routeHarness();
  const first = await invoke({ ...body, checkNumber: ' 1042 ' });
  assert.equal(first.status, 200);
  assert.equal(fixture.calls[0].transactionId, 'check:INV-TEST:1042');
  await invoke({ ...body, checkNumber: '1042', requestId: undefined });
  assert.equal(fixture.calls[1].transactionId, fixture.calls[0].transactionId);
  await invoke({ ...body, requestId: requestId.toUpperCase() });
  await invoke(body);
  assert.equal(fixture.calls[2].transactionId, `manual:${requestId}`);
  assert.equal(fixture.calls[3].transactionId, fixture.calls[2].transactionId);
  assert.equal(fixture.uuids, 0);
  assert.equal((await first.json()).payment.recorded, true);
});

test('legacy no-check manual clients receive a server manual UUID, never an invented Square ID', async () => {
  const { fixture, invoke } = await routeHarness();
  for (let n = 0; n < 2; n++) assert.equal((await invoke({ ...body, requestId: undefined })).status, 200);
  assert.equal(fixture.uuids, 2);
  assert.notEqual(fixture.calls[0].transactionId, fixture.calls[1].transactionId);
  assert.match(String(fixture.calls[0].transactionId), /^manual:[0-9a-f-]{36}$/);
});

test('manual route rejects malformed/bounded input without recorder writes or raw errors', async () => {
  const { fixture, invoke } = await routeHarness();
  const invalid = [null, [], {}, { ...body, invoiceNumber: {} }, { ...body, invoiceNumber: '' },
    { ...body, invoiceNumber: 'x'.repeat(51) }, { ...body, checkNumber: 'x'.repeat(51) },
    { ...body, checkNumber: '\n1042' }, { ...body, paymentMethod: {} }, { ...body, notes: 'x'.repeat(2001) },
    { ...body, notes: {} }, { ...body, requestId: 'client-text' }, { ...body, requestId: 42 },
    ...[0, -1, 1.005, Infinity, NaN, 100_000_000, {}, null, '1e2'].map(amount => ({ ...body, amount }))];
  for (const input of invalid) {
    const response = await invoke(input);
    assert.equal(response.status, 400, JSON.stringify(input));
    assert.equal((await response.json()).code, 'INVALID_MANUAL_PAYMENT');
  }
  assert.equal((await invoke(undefined, true)).status, 400);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.uuids, 0);
  assert.equal((await invoke({ ...body, amount: '10.29', checkNumber: '' })).status, 200);
});

test('manual route separates local confirmation from QB review and sanitizes recorder failures', async () => {
  const { fixture, invoke } = await routeHarness();
  fixture.reply = { ...recorded, qbExportStatus: 'review_required', qbExportNote: 'QuickBooks export needs review.' };
  let response = await invoke();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).payment.qbExportStatus, 'review_required');
  fixture.reply = { recorded: false, reason: 'transaction_conflict' };
  response = await invoke();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'MANUAL_PAYMENT_REVIEW_REQUIRED');
  fixture.fail = true;
  response = await invoke();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /SECRET|raw database|provider error/);
});

type Element = { type: string; props: Record<string, unknown> };
type Setter = (value: unknown) => void;
type Effect = { deps: unknown[]; run?: () => (() => void) | void; cleanup?: () => void };
type Request = { url: string; init: RequestInit; resolve: (response: Response) => void; reject: (error: Error) => void };
const invoice = { id: invoiceId, invoiceNumber: body.invoiceNumber, customerId: 'customer', customerName: 'Synthetic Customer',
  jobTitle: 'Synthetic invoice', issueDate: '2026-09-01', dueDate: '2026-09-20', status: 'sent', subtotal: 100,
  taxRate: 0, taxAmount: 0, totalAmount: 100, balance: 100, lineItems: [], createdAt: '2026-09-01', updatedAt: '2026-09-01' };

async function uiHarness(options: { partial?: boolean; refreshFailure?: boolean; prompts?: Array<string | null>;
  invoiceShape?: { id: string; localId?: string; invoiceNumber?: string };
  storage?: Map<string, string>; storageBlocked?: 'read' | 'write' | 'remove' } = {}) {
  let cursor = 0;
  const values: unknown[] = [];
  const effects: Effect[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0, uuidCount = 0;
  const prompts = [...(options.prompts ?? ['10.29', ''])];
  const promptCalls: string[] = [];
  const requests: Request[] = [];
  const traffic: Array<{ url: string; init: RequestInit }> = [];
  const sample = { ...invoice, balance: options.partial ? 40 : 100, ...options.invoiceShape };
  const storage = options.storage ?? new Map<string, string>();
  const fixture = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      const setter: Setter = value => { values[index] = typeof value === 'function' ? value(values[index]) : value; };
      return [values[index], setter];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const index = cursor++;
      const prior = values[index] as { fn: unknown; deps: unknown[] } | undefined;
      if (!prior || deps.some((dep, i) => !Object.is(dep, prior.deps[i]))) values[index] = { fn, deps };
      return (values[index] as { fn: unknown }).fn;
    },
    useEffect(run: Effect['run'], deps: unknown[]) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) effects[index] = { deps, run, cleanup: previous?.cleanup };
    },
    jsx(type: string | ((props: object) => unknown), props: object) { return typeof type === 'function' ? type(props) : { type, props }; },
  };
  const code = await bundle('src/app/invoices/page.tsx', {
    react: 'export const {useState,useEffect,useCallback,useRef} = fixture;',
    'react/jsx-runtime': 'export const jsx = fixture.jsx; export const jsxs = fixture.jsx; export const Fragment = "fragment";',
    'next/navigation': `export const useSearchParams = () => new URLSearchParams('id=${sample.id}');`,
    '@/components/layout/Sidebar': 'export default () => null;',
    '@/components/layout/Header': 'export default () => null;',
    '@/components/PnlModal': 'export default () => null;',
  });
  const loaded = { exports: {} as { default: () => Element } };
  runInNewContext(code, {
    module: loaded, exports: loaded.exports, fixture, URLSearchParams, AbortController, console,
    crypto: { randomUUID: () => { uuidCount++; return `00000000-0000-4000-8000-${String(uuidCount).padStart(12, '0')}`; } },
    sessionStorage: {
      getItem(key: string) { if (options.storageBlocked === 'read') throw new Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (options.storageBlocked === 'write') throw new Error('Storage blocked'); storage.set(key, value); },
      removeItem(key: string) { if (options.storageBlocked === 'remove') throw new Error('Storage blocked'); storage.delete(key); },
    },
    prompt: (message: string) => { promptCalls.push(message); return prompts.shift() ?? null; },
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id), setInterval: () => 1, clearInterval: () => undefined,
    fetch: (url: string, init: RequestInit = {}) => {
      traffic.push({ url, init });
      if (url === '/api/invoices/payments') return new Promise<Response>((resolve, reject) => {
        assert.equal(JSON.parse(storage.get(`hearthos:manual-payment:v1:${invoiceId}`)!).body, init.body,
          'the exact intent is persisted before POST');
        requests.push({ url, init, resolve, reject });
        init.signal?.addEventListener('abort', () => reject(new Error('Synthetic timeout')));
      });
      if (url === '/api/invoices') {
        if (options.refreshFailure && requests.length) return Promise.reject(new Error('SECRET refresh failure'));
        if (init.method && init.method !== 'GET') return Promise.resolve(Response.json({ success: true }));
        return Promise.resolve(Response.json({ invoices: [sample] }));
      }
      if (url === '/api/quickbooks/customers?live=true') return Promise.resolve(Response.json({ customers: [] }));
      if (url === '/api/quickbooks/items?sync=true') return Promise.resolve(Response.json({ items: [] }));
      if (url === '/api/square/transactions?limit=200') return Promise.resolve(Response.json({ payments: options.partial
        ? [{ invoiceNumber: body.invoiceNumber, amount: 62.1, status: 'completed', paymentDate: '2026-09-02' }] : [] }));
      throw new Error(`Unexpected offline request: ${url}`);
    },
  });
  function render() {
    cursor = 0;
    const tree = loaded.exports.default();
    for (const effect of effects) {
      if (effect?.run) { effect.cleanup?.(); effect.cleanup = effect.run() || undefined; effect.run = undefined; }
    }
    return tree;
  }
  async function settle() { for (let i = 0; i < 4; i++) { await new Promise(setImmediate); render(); } return render(); }
  render(); await settle();
  return { render, settle, requests, traffic, prompts, promptCalls, storage, uuidCount: () => uuidCount,
    timeout() { for (const callback of timers.values()) callback(); },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
  };
}

function elements(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Element;
  return [node, ...elements(node.props?.children)];
}
function content(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? content((tree as Element).props?.children) : String(tree);
}
function button(tree: Element, name: string) {
  const found = elements(tree).find(node => node.type === 'button' && content(node).trim() === name);
  assert.ok(found, `Missing ${name}`);
  return found.props as { onClick: () => Promise<void>; disabled?: boolean };
}

test('actual invoice UI single-flight prevents double prompting/submission and carries stable UUID', async () => {
  const h = await uiHarness();
  const handler = button(h.render(), 'Record Check Payment').onClick;
  const first = handler();
  await handler();
  assert.equal(h.requests.length, 1);
  assert.equal(h.promptCalls.length, 2);
  assert.equal(h.uuidCount(), 1);
  assert.match(JSON.parse(String(h.requests[0].init.body)).requestId, /^[0-9a-f-]{36}$/);
  assert.equal(button(h.render(), 'Record Check Payment').disabled, true);
  h.requests[0].resolve(Response.json({ success: true, payment: recorded }));
  await first;
  assert.match(content(h.render()), /Payment recorded locally/);
  h.unmount();
});

for (const outcome of ['network', 'malformed', 'missing-recorded', 'server-error', 'timeout']) {
  test(`actual invoice UI ${outcome} retains exact payload for explicit same-identity retry`, async () => {
    const h = await uiHarness();
    const first = button(h.render(), 'Record Check Payment').onClick();
    const payload = h.requests[0].init.body;
    if (outcome === 'network') h.requests[0].reject(new Error('SECRET network unknown'));
    if (outcome === 'malformed') h.requests[0].resolve(new Response('{bad'));
    if (outcome === 'missing-recorded') h.requests[0].resolve(Response.json({ success: true, payment: {} }));
    if (outcome === 'server-error') h.requests[0].resolve(Response.json({ error: 'SECRET provider' }, { status: 503 }));
    if (outcome === 'timeout') h.timeout();
    await first;
    let tree = h.render();
    assert.match(content(tree), /Payment recording is unconfirmed/);
    assert.doesNotMatch(content(tree), /SECRET|QuickBooks export completed/);
    assert.equal(button(tree, 'Record Check Payment').disabled, true);
    await h.settle();
    assert.equal(h.requests.length, 1, 'never automatically retries');
    const retry = button(tree, 'Check Payment Recording').onClick();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].init.body, payload);
    assert.equal(h.promptCalls.length, 2);
    assert.equal(h.uuidCount(), 1);
    h.requests[1].resolve(Response.json({ success: true, payment: { ...recorded, qbExportStatus: 'review_required' } }));
    await retry;
    tree = h.render();
    assert.match(content(tree), /Payment recorded locally.*QuickBooks export needs review/);
    assert.equal(button(tree, 'Record Check Payment').disabled, false);
    assert.ok(!elements(tree).some(node => node.type === 'button' && content(node).trim() === 'Check Payment Recording'));
    h.unmount();
  });
}

test('actual invoice UI known local payment survives failed refresh with QB pending feedback', async () => {
  const h = await uiHarness({ refreshFailure: true });
  const first = button(h.render(), 'Record Check Payment').onClick();
  h.requests[0].resolve(Response.json({ success: true, payment: { ...recorded, qbExportStatus: 'pending', tokenPersistenceStatus: 'review_required' } }));
  await first;
  const tree = await h.settle();
  assert.match(content(tree), /Payment recorded locally.*QuickBooks export is pending.*connection needs review.*payment remains recorded/);
  assert.doesNotMatch(content(tree), /Payment recording is unconfirmed|SECRET/);
  assert.equal(h.requests.length, 1);
  assert.equal(button(tree, 'Record Check Payment').disabled, false);
  h.prompts.push('1', '');
  const next = button(tree, 'Record Check Payment').onClick();
  assert.equal(h.uuidCount(), 2, 'only confirmation releases the identity for a new payment');
  h.requests[1].resolve(Response.json({ success: true, payment: recorded }));
  await next;
  h.unmount();
});

test('actual invoice UI rejects sub-cent input before generating identity or posting', async () => {
  const h = await uiHarness({ prompts: ['1.005'] });
  await button(h.render(), 'Record Check Payment').onClick();
  assert.equal(h.requests.length, 0);
  assert.equal(h.uuidCount(), 0);
  assert.match(content(h.render()), /two decimal places/);
  h.unmount();
});

test('actual invoice UI reload restores exact pending request and clears only matching local confirmation', async () => {
  const storage = new Map<string, string>();
  const firstPage = await uiHarness({ storage });
  const first = button(firstPage.render(), 'Record Check Payment').onClick();
  const original = firstPage.requests[0].init.body;
  firstPage.requests[0].reject(new Error('Synthetic lost response'));
  await first;
  firstPage.unmount();
  const reloaded = await uiHarness({ storage });
  assert.equal(reloaded.requests.length, 0, 'reload does not automatically replay');
  assert.equal(button(reloaded.render(), 'Record Check Payment').disabled, true);
  const check = button(reloaded.render(), 'Check Payment Recording').onClick();
  assert.equal(reloaded.requests[0].init.body, original);
  assert.equal(reloaded.uuidCount(), 0);
  assert.equal(reloaded.promptCalls.length, 0);
  reloaded.requests[0].resolve(Response.json({ success: true, payment: { ...recorded, invoiceId: requestId } }));
  await check;
  assert.equal(storage.size, 1, 'wrong invoice response cannot release pending identity');
  const retry = button(reloaded.render(), 'Check Payment Recording').onClick();
  assert.equal(reloaded.requests[1].init.body, original);
  reloaded.requests[1].resolve(Response.json({ success: true, payment: recorded }));
  await retry;
  assert.equal(storage.size, 0);
  reloaded.unmount();
});

for (const storageBlocked of ['read', 'write'] as const) {
  test(`actual invoice UI ${storageBlocked}-blocked storage fails closed before POST`, async () => {
    const h = await uiHarness({ storageBlocked });
    await button(h.render(), 'Record Check Payment').onClick();
    assert.equal(h.requests.length, 0);
    assert.match(content(h.render()), /No request was sent in this attempt/);
    h.unmount();
  });
}

test('actual invoice UI storage cleanup failure retains known success and the same payment identity', async () => {
  const h = await uiHarness({ storageBlocked: 'remove' });
  const first = button(h.render(), 'Record Check Payment').onClick();
  h.requests[0].resolve(Response.json({ success: true, payment: recorded }));
  await first;
  assert.match(content(h.render()), /Payment recorded locally.*saved reference could not be cleared/);
  assert.equal(h.storage.size, 1);
  assert.equal(button(h.render(), 'Record Check Payment').disabled, true);
  h.unmount();
});

test('actual partial-payment render never mutates invoice from latest Square gross signal', async () => {
  const h = await uiHarness({ partial: true });
  const tree = await h.settle();
  assert.equal(h.traffic.filter(request => request.init.method && request.init.method !== 'GET').length, 0,
    '100 invoice less 60 principal leaves 40; 62.10 gross signal must not auto-PUT balance zero');
  assert.match(content(tree), /40\.00/);
  assert.ok(button(tree, 'Record Check Payment'));
  h.unmount();
});

// GET /api/invoices exposes the QB identity as id, the DB UUID as localId,
// and strips QB- from the stored invoice number. Keep this distinct from UUID-only fixtures.
const qbInvoiceShape = { id: '301', localId: invoiceId, invoiceNumber: '123' };

test('QB invoice API shape posts canonical localId through the actual manual route and accepts raw QB-prefixed confirmation', async () => {
  const h = await uiHarness({ invoiceShape: qbInvoiceShape, refreshFailure: true });
  const attempt = button(h.render(), 'Record Check Payment').onClick();
  assert.equal(h.requests.length, 1);
  const payload = JSON.parse(String(h.requests[0].init.body));
  assert.equal(payload.invoiceId, invoiceId);
  assert.equal(payload.invoiceNumber, '123');
  assert.equal(h.storage.has(`hearthos:manual-payment:v1:${invoiceId}`), true);
  assert.equal(h.storage.has('hearthos:manual-payment:v1:301'), false);
  const route = await routeHarness();
  route.fixture.reply = { ...recorded, invoiceNumber: 'QB-123' };
  const response = await route.invoke(payload);
  assert.equal(response.status, 200);
  assert.equal(route.fixture.calls[0].invoiceId, invoiceId);
  h.requests[0].resolve(response);
  await attempt;
  const tree = await h.settle();
  assert.match(content(tree), /Payment recorded locally for 123.*payment remains recorded/);
  assert.doesNotMatch(content(tree), /Payment recording is unconfirmed/);
  assert.ok((content(tree).match(/89\.71/g) ?? []).length >= 2, 'canonical ID patches both invoice row and selected detail');
  assert.equal(h.storage.size, 0);
  assert.equal(button(tree, 'Record Check Payment').disabled, false);
  h.unmount();
});

test('QB invoice reload restores canonical-key intent and rejects wrong ID or normalized invoice number', async () => {
  const storage = new Map<string, string>();
  const firstPage = await uiHarness({ invoiceShape: qbInvoiceShape, storage });
  const attempt = button(firstPage.render(), 'Record Check Payment').onClick();
  assert.equal(firstPage.requests.length, 1);
  const original = firstPage.requests[0].init.body;
  firstPage.requests[0].reject(new Error('Synthetic lost response'));
  await attempt;
  firstPage.unmount();
  const h = await uiHarness({ invoiceShape: qbInvoiceShape, storage, refreshFailure: true });
  assert.equal(h.requests.length, 0);
  assert.equal(button(h.render(), 'Record Check Payment').disabled, true);
  for (const payment of [
    { ...recorded, invoiceId: '301', invoiceNumber: 'QB-123' },
    { ...recorded, invoiceNumber: 'QB-999' },
    { ...recorded, invoiceNumber: null },
  ]) {
    const check = button(h.render(), 'Check Payment Recording').onClick();
    assert.equal(h.requests.at(-1)!.init.body, original);
    h.requests.at(-1)!.resolve(Response.json({ success: true, payment }));
    await check;
    assert.equal(storage.size, 1);
    assert.match(content(h.render()), /Payment recording is unconfirmed/);
  }
  const check = button(h.render(), 'Check Payment Recording').onClick();
  h.requests.at(-1)!.resolve(Response.json({ success: true, payment: { ...recorded, invoiceNumber: 'QB-123' } }));
  await check;
  assert.equal(h.uuidCount(), 0);
  assert.equal(h.promptCalls.length, 0);
  assert.equal(storage.size, 0);
  assert.match(content(await h.settle()), /Payment recorded locally for 123/);
  h.unmount();
});

test('QB display ID without a valid canonical local UUID fails closed before prompts or POST', async () => {
  for (const invoiceShape of [{ id: '301' }, { id: '301', localId: 'invalid' }, { id: invoiceId, localId: 'invalid' }]) {
    const h = await uiHarness({ invoiceShape });
    const attempt = button(h.render(), 'Record Check Payment').onClick();
    for (const request of h.requests) request.reject(new Error('Unexpected write with invalid canonical ID'));
    await attempt;
    assert.equal(h.requests.length, 0);
    assert.equal(h.uuidCount(), 0);
    assert.equal(h.promptCalls.length, 0);
    assert.equal(h.storage.size, 0);
    h.unmount();
  }
});
