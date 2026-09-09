import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { classifyPaymentResponse, createPaymentGuard, PAYMENT_DEADLINE_MS } from '../../src/lib/square/client-payment';

const completed = { ok: true, paymentId: 'synthetic-payment', status: 'COMPLETED', receiptUrl: 'https://example.invalid/receipt' };
const checkout = { ok: true, paymentLinkId: 'synthetic-link', url: 'https://example.invalid/pay' };
type Tree = { type: string; props: Record<string, any> };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: Error) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function nodes(tree: any): Tree[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function content(tree: any): string {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  return typeof tree === 'object' ? content(tree.props?.children) : String(tree);
}
function button(tree: Tree, label: string) {
  const found = nodes(tree).find(node => node.type === 'button' && content(node).startsWith(label));
  assert.ok(found, `Missing button ${label}`);
  return found;
}

const bundles = new Map<string, Promise<string>>();
function bundle(page: 'public' | 'tech') {
  if (!bundles.has(page)) bundles.set(page, (async () => {
    const mocks: Record<string, string> = {
      react: 'export const { useState, useRef, useEffect, useMemo } = fixture;',
      'react/jsx-runtime': 'export const jsx = fixture.jsx; export const jsxs = fixture.jsx; export const Fragment = "fragment";',
      'next/navigation': 'export const useSearchParams = () => fixture.searchParams;',
      '@/components/tech/TechBottomNav': 'export default () => null;',
    };
    const result = await build({
      entryPoints: [page === 'public' ? 'src/app/pay/page.tsx' : 'src/app/tech/payments/page.tsx'],
      bundle: true, write: false, platform: 'browser', format: 'cjs', jsx: 'automatic',
      plugins: [{ name: 'offline-payment-components', setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
      } }],
    });
    return result.outputFiles[0].text;
  })());
  return bundles.get(page)!;
}

async function harness(page: 'public' | 'tech', amount = '100') {
  let cursor = 0;
  const hooks: any[] = [];
  let effects: (() => void)[] = [];
  let tree!: Tree;
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { due: number; run: () => void }>();
  const requests: (Deferred<Response> & { url: string; options: RequestInit })[] = [];
  const tokens: Deferred<any>[] = [];
  const bankCalls: any[] = [];
  const opened: string[] = [];
  const stored = new Map<string, string>();
  let bankEvent!: (event: any) => Promise<void>;
  let bankOptions: any;
  let listFails = false;
  const fixture = {
    searchParams: new URLSearchParams({ amount, customer: 'Synthetic Customer', invoice: 'INV-SYNTHETIC-1', token: 'synthetic-link-token' }),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value: any) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(run: () => void, deps: any[]) {
      const index = cursor++;
      if (!hooks[index] || deps.some((dep, i) => dep !== hooks[index][i])) {
        hooks[index] = deps;
        effects.push(run);
      }
    },
    useMemo(run: () => unknown) { cursor++; return run(); },
    jsx(type: string | ((props: any) => unknown), props: any) {
      if (typeof type === 'function') return type(props);
      if (props.ref) props.ref.current = {};
      return { type, props };
    },
  };
  const loaded = { exports: {} as { default: () => Tree } };
  runInNewContext(await bundle(page), {
    module: loaded, exports: loaded.exports, fixture, AbortController, URL,
    process: { env: { NEXT_PUBLIC_SQUARE_APPLICATION_ID: 'synthetic-app', NEXT_PUBLIC_SQUARE_LOCATION_ID: 'synthetic-location', NEXT_PUBLIC_SQUARE_ENVIRONMENT: 'sandbox' } },
    document: { getElementById: () => ({}) },
    window: {
      location: { origin: 'https://example.invalid' },
      localStorage: { setItem: (key: string, value: string) => stored.set(key, value) },
      open: (url: string) => opened.push(url),
      setInterval: () => 1, clearInterval: () => {},
      Square: { payments: () => ({
        card: async () => ({ attach: async () => {}, tokenize: () => { const token = deferred<any>(); tokens.push(token); return token.promise; } }),
        ach: async (options: any) => {
          bankOptions = options;
          return { addEventListener: (name: string, handler: typeof bankEvent) => { assert.equal(name, 'ontokenization'); bankEvent = handler; },
            tokenize: async (options: any) => { bankCalls.push(options); } };
        },
      }) },
    },
    setTimeout(run: () => void, delay: number) { const id = ++timerId; timers.set(id, { due: now + delay, run }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    fetch: (url: string, options: RequestInit) => {
      if (url === '/api/square/transactions?limit=20') {
        return Promise.resolve(Response.json(listFails ? { error: 'Synthetic list unavailable' } : { payments: [] }, { status: listFails ? 503 : 200 }));
      }
      assert.ok(['/api/square/payments', '/api/square/checkout'].includes(url), `Unexpected network path: ${url}`);
      assert.equal(options.method, 'POST');
      const request = { ...deferred<Response>(), url, options };
      requests.push(request);
      return request.promise;
    },
  });
  function render() {
    cursor = 0;
    tree = loaded.exports.default();
    const pending = effects;
    effects = [];
    pending.forEach(run => run());
    return tree;
  }
  async function settle() { for (let i = 0; i < 25; i++) await Promise.resolve(); return render(); }
  render();
  await settle();
  await settle();
  return {
    render, settle, requests, tokens, bankCalls, opened, stored,
    get bankOptions() { return bankOptions; },
    get timerCount() { return timers.size; },
    setListFails() { listFails = true; },
    card: () => button(render(), page === 'public' ? 'Pay by Card' : 'Charge Card').props.onClick(),
    bank: () => button(render(), 'Pay by E-check').props.onClick(),
    checkout: () => button(render(), 'Create Square Payment Link').props.onClick(),
    bankEvent: (detail = { tokenResult: { status: 'OK', token: 'synthetic-bank-token' } } as any) => bankEvent({ detail }),
    advance(ms: number) { now += ms; for (const [id, timer] of timers) if (timer.due <= now) { timers.delete(id); timer.run(); } },
    change(placeholder: string, value: string) {
      const input = nodes(render()).find(node => node.props.placeholder === placeholder);
      assert.ok(input, `Missing input ${placeholder}`);
      input.props.onChange({ target: { value } });
      render();
    },
  };
}

test('response validation accepts capture only with true ok, ID and actual COMPLETED', () => {
  assert.equal(classifyPaymentResponse(200, completed).kind, 'completed');
  for (const data of [null, [], {}, { ...completed, ok: false }, { ...completed, paymentId: '' }, { ...completed, status: undefined },
    { ...completed, status: 'FAILED' }, { ...completed, payment: { id: completed.paymentId, status: 'PENDING' } }]) {
    assert.equal(classifyPaymentResponse(200, data).kind, 'unknown');
  }
  for (const status of ['PENDING', 'APPROVED']) {
    assert.equal(classifyPaymentResponse(200, { ...completed, status }).kind, 'submitted');
    assert.equal(classifyPaymentResponse(409, { ...completed, ok: false, status, code: 'CAPTURE_PENDING' }).kind, 'submitted');
  }
  for (const retrySafe of [undefined, false, 'true', 1]) {
    assert.equal(classifyPaymentResponse(402, { error: 'Rejected', retrySafe }).kind, 'unknown');
  }
  assert.equal(classifyPaymentResponse(402, { ok: false, error: 'Rejected', retrySafe: true }).kind, 'rejected');
  assert.equal(classifyPaymentResponse(503, { retrySafe: true }).kind, 'unknown');
  assert.equal(classifyPaymentResponse(402, { ...completed, ok: false, retrySafe: true }).kind, 'unknown');
  assert.equal(classifyPaymentResponse(402, { retrySafe: true, payment: 'malformed' }).kind, 'unknown');
  assert.equal(classifyPaymentResponse(409, { ok: false, retrySafe: false, code: 'INVOICE_CAPTURE_PENDING' }).kind, 'unknown');
  assert.equal(classifyPaymentResponse(200, checkout, true).kind, 'checkout');
  for (const data of [{ ...checkout, paymentLinkId: '' }, { ...checkout, url: 'javascript:alert(1)' }, { ...checkout, ok: false }]) {
    assert.equal(classifyPaymentResponse(200, data, true).kind, 'unknown');
  }
});

test('ref guard excludes all methods and allows reset only after confirmed completion or checkout', () => {
  for (const kind of ['completed', 'submitted', 'checkout', 'unknown', 'rejected'] as const) {
    const guard = createPaymentGuard();
    assert.equal(guard.begin('ach'), true);
    assert.equal(guard.begin('card'), false);
    assert.equal(guard.begin('checkout'), false);
    assert.equal(guard.submit('card'), false);
    assert.equal(guard.submit('ach'), true);
    assert.equal(guard.submit('ach'), false);
    assert.equal(guard.authorizationFailed('ach'), false);
    guard.finish({ kind, message: '' });
    assert.equal(guard.resetConfirmed(), kind === 'completed' || kind === 'checkout');
    assert.equal(guard.begin('card'), !['unknown', 'submitted'].includes(kind));
  }
});

for (const [amount, total] of [['100', 103.50], ['100.30', 103.81], ['0.01', 0.01], ['3', 3.11]] as const) {
  test(`public actual card handler preserves 3.5% fee in cents: ${amount} => ${total}`, async () => {
    const h = await harness('public', amount);
    const initial = h.render();
    const card = button(initial, 'Pay by Card');
    const bank = button(initial, 'Pay by E-check');
    void card.props.onClick();
    void card.props.onClick();
    void bank.props.onClick();
    assert.equal(h.tokens.length, 1);
    assert.equal(h.bankCalls.length, 0);
    h.tokens[0].resolve({ status: 'OK', token: 'synthetic-card-token' });
    await h.settle();
    assert.equal(h.requests.length, 1);
    assert.deepEqual(JSON.parse(String(h.requests[0].options.body)), {
      amount: total, invoicePrincipal: Number(amount), sourceId: 'synthetic-card-token', token: 'synthetic-link-token',
      customerName: 'Synthetic Customer', invoiceNumber: 'INV-SYNTHETIC-1',
      note: `Card payment for invoice INV-SYNTHETIC-1. Invoice amount $${Number(amount).toFixed(2)} plus 3.5% card fee $${(total - Number(amount)).toFixed(2)}.`,
    });
    h.requests[0].resolve(Response.json(completed));
    const tree = await h.settle();
    assert.match(content(tree), /Card payment captured/);
    assert.equal(button(tree, 'Pay by Card').props.disabled, true);
    void card.props.onClick();
    void bank.props.onClick();
    assert.equal(h.tokens.length, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timerCount, 0);
  });
}

for (const page of ['public', 'tech'] as const) {
  for (const status of ['PENDING', 'APPROVED']) {
    for (const http of [200, 409]) {
      test(`${page}: actual card handler shows ${http} ${status} as submitted and locked`, async () => {
        const h = await harness(page);
        void h.card();
        h.tokens[0].resolve({ status: 'OK', token: 'synthetic-card-token' });
        await h.settle();
        h.requests[0].resolve(Response.json({ ...completed, status, ok: http === 200, code: http === 409 ? 'CAPTURE_PENDING' : undefined }, { status: http }));
        const tree = await h.settle();
        assert.match(content(tree), /Payment submitted, not yet captured/);
        assert.doesNotMatch(content(tree), /payment captured|View receipt|Square receipt ready/i);
        assert.equal(button(tree, page === 'public' ? 'Pay by Card' : 'Charge Card').props.disabled, true);
        assert.ok(!nodes(tree).some(node => node.type === 'button' && /New payment/.test(content(node))));
        void h.card();
        assert.equal(h.tokens.length, 1);
        assert.equal(h.requests.length, 1);
      });
    }
  }
  for (const failure of ['network', 'json', 'missingId', 'falseOk', 'missingStatus', 'failed', 'unmarked400', 'review409', '500', '503retrySafe']) {
    test(`${page}: ${failure} locks the real card handler and every alternate method`, async () => {
      const h = await harness(page);
      const initial = h.render();
      const card = button(initial, page === 'public' ? 'Pay by Card' : 'Charge Card');
      const other = button(initial, page === 'public' ? 'Pay by E-check' : 'Create Square Payment Link');
      void card.props.onClick();
      h.tokens[0].resolve({ status: 'OK', token: 'synthetic-card-token' });
      await h.settle();
      if (failure === 'network') h.requests[0].reject(new Error('Synthetic lost response'));
      else if (failure === 'json') h.requests[0].resolve(new Response('not JSON'));
      else if (failure === 'missingId') h.requests[0].resolve(Response.json({ ...completed, paymentId: null }));
      else if (failure === 'falseOk') h.requests[0].resolve(Response.json({ ...completed, ok: false }));
      else if (failure === 'missingStatus') h.requests[0].resolve(Response.json({ ...completed, status: null }));
      else if (failure === 'failed') h.requests[0].resolve(Response.json({ ...completed, status: 'FAILED' }));
      else h.requests[0].resolve(Response.json({ error: 'Synthetic rejection', retrySafe: failure === '503retrySafe' }, {
        status: failure === 'unmarked400' ? 400 : failure === 'review409' ? 409 : failure === '500' ? 500 : 503,
      }));
      const tree = await h.settle();
      assert.match(content(tree), /Payment status is uncertain.*Check payment status with the office/);
      assert.doesNotMatch(content(tree), /payment captured/i);
      assert.equal(button(tree, page === 'public' ? 'Pay by Card' : 'Charge Card').props.disabled, true);
      assert.equal(button(tree, page === 'public' ? 'Pay by E-check' : 'Create Square Payment Link').props.disabled, true);
      assert.ok(!nodes(tree).some(node => node.type === 'button' && /New payment/.test(content(node))));
      void card.props.onClick();
      void other.props.onClick();
      assert.equal(h.tokens.length, 1);
      assert.equal(h.requests.length, 1);
      assert.equal(h.timerCount, 0);
      if (page === 'tech') {
        h.setListFails();
        void button(tree, 'Refresh').props.onClick();
        assert.match(content(await h.settle()), /Payment status is uncertain/);
      }
    });
  }

  test(`${page}: explicit retrySafe permits only manual retry; invalid tokenization also releases`, async () => {
    const h = await harness(page);
    void h.card();
    h.tokens[0].resolve({ status: 'INVALID' });
    await h.settle();
    assert.equal(h.requests.length, 0);
    void h.card();
    h.tokens[1].resolve({ status: 'OK', token: 'synthetic-card-token-1' });
    await h.settle();
    h.requests[0].resolve(Response.json({ ok: false, retrySafe: true, error: 'Synthetic definite rejection' }, { status: 402 }));
    assert.match(content(await h.settle()), /Synthetic definite rejection/);
    assert.equal(h.requests.length, 1);
    void h.card();
    h.tokens[2].resolve({ status: 'OK', token: 'synthetic-card-token-2' });
    await h.settle();
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve(Response.json(completed));
    await h.settle();
  });

  for (const stalled of ['fetch', 'json']) {
    test(`${page}: 30s bounds ${stalled}, ignores late completion and never retries`, async () => {
      const h = await harness(page);
      void h.card();
      h.tokens[0].resolve({ status: 'OK', token: 'synthetic-card-token' });
      await h.settle();
      const body = deferred<any>();
      if (stalled === 'json') h.requests[0].resolve({ status: 200, json: () => body.promise } as Response);
      await h.settle();
      assert.equal(h.timerCount, 1);
      h.advance(PAYMENT_DEADLINE_MS - 1);
      await h.settle();
      assert.equal(h.requests[0].options.signal!.aborted, false);
      h.advance(1);
      assert.match(content(await h.settle()), /Payment status is uncertain/);
      assert.equal(h.requests[0].options.signal!.aborted, true);
      h.requests[0].resolve(Response.json(completed));
      body.resolve(completed);
      const tree = await h.settle();
      assert.match(content(tree), /Payment status is uncertain/);
      assert.doesNotMatch(content(tree), /payment captured/i);
      void h.card();
      assert.equal(h.tokens.length, 1);
      assert.equal(h.requests.length, 1);
      assert.equal(h.timerCount, 0);
    });
  }
}

for (const status of ['PENDING', 'APPROVED']) {
  test(`ACH lifecycle and duplicate callbacks: ${status} stays submitted, without receipt or capture claim`, async () => {
    const h = await harness('public');
    const initial = h.render();
    void button(initial, 'Pay by E-check').props.onClick();
    void button(initial, 'Pay by E-check').props.onClick();
    void button(initial, 'Pay by Card').props.onClick();
    await h.settle();
    assert.equal(h.tokens.length, 0);
    assert.equal(h.bankCalls.length, 1);
    assert.equal(h.bankCalls[0].amount, '100.00');
    assert.equal(h.bankCalls[0].intent, 'CHARGE');
    assert.equal(h.bankOptions.redirectURI, 'https://example.invalid/pay');
    assert.ok(h.stored.has(`hearth-ach-${h.bankOptions.transactionId}`));
    assert.equal(h.requests.length, 0, 'Tokenize resolution alone does not submit ACH');
    void h.bankEvent();
    void h.bankEvent();
    await h.settle();
    assert.equal(h.requests.length, 1);
    assert.equal(JSON.parse(String(h.requests[0].options.body)).amount, 100);
    h.requests[0].resolve(Response.json({ ...completed, ok: false, code: 'CAPTURE_PENDING', status }, { status: 409 }));
    const tree = await h.settle();
    assert.match(content(tree), /Payment submitted, not yet captured/);
    assert.doesNotMatch(content(tree), /payment captured|View receipt/i);
    assert.equal(button(tree, 'Pay by E-check').props.disabled, true);
    void h.bankEvent();
    assert.equal(h.requests.length, 1);
  });
}

test('ACH cancellation before request allows another method; unsolicited callbacks never charge', async () => {
  const h = await harness('public');
  await h.bankEvent();
  assert.equal(h.requests.length, 0);
  void h.bank();
  await h.bankEvent({ error: { message: 'Synthetic cancellation' } });
  assert.match(content(await h.settle()), /Synthetic cancellation/);
  void h.card();
  h.tokens[0].resolve({ status: 'OK', token: 'synthetic-card-token' });
  await h.settle();
  h.requests[0].resolve(Response.json(completed));
  await h.settle();
});

test('ACH duplicate token from a rejected attempt cannot hijack the next bank authorization', async () => {
  const h = await harness('public');
  void h.bank();
  void h.bankEvent();
  h.requests[0].resolve(Response.json({ ok: false, retrySafe: true, error: 'Synthetic rejection' }, { status: 402 }));
  await h.settle();
  void h.bank();
  await h.bankEvent();
  assert.equal(h.requests.length, 1);
  void h.bankEvent({ tokenResult: { status: 'OK', token: 'synthetic-new-bank-token' } });
  assert.equal(h.requests.length, 2);
  h.requests[1].reject(new Error('Synthetic unknown outcome'));
  const tree = await h.settle();
  assert.match(content(tree), /Payment status is uncertain/);
  await h.bankEvent({ error: { message: 'Late authorization error' } });
  void h.card();
  assert.equal(h.tokens.length, 0);
  assert.match(content(h.render()), /Payment status is uncertain/);
});

test('tech completion locks same invoice; explicit new payment clears draft and permits unrelated invoice', async () => {
  const h = await harness('tech');
  const initial = h.render();
  void button(initial, 'Charge Card').props.onClick();
  void button(initial, 'Charge Card').props.onClick();
  void button(initial, 'Create Square Payment Link').props.onClick();
  assert.equal(h.tokens.length, 1);
  h.tokens[0].resolve({ status: 'OK', token: 'synthetic-card-token' });
  await h.settle();
  assert.equal(h.requests.length, 1);
  assert.equal(JSON.parse(String(h.requests[0].options.body)).amount, 100);
  h.requests[0].resolve(Response.json({ ...completed, invoicePayment: { recorded: true, qbExportStatus: 'review_required' } }));
  let tree = await h.settle();
  assert.match(content(tree), /Square payment captured/);
  assert.match(content(tree), /QuickBooks export needs office review/);
  assert.equal(button(tree, 'Charge Card').props.disabled, true);
  button(tree, 'New payment for another invoice').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree).find(node => node.props.placeholder === 'Amount')!.props.value, '');
  h.change('Amount', '25');
  h.change('Invoice number (optional)', 'INV-SYNTHETIC-1');
  void h.card();
  assert.equal(h.tokens.length, 1);
  h.change('Invoice number (optional)', 'INV-SYNTHETIC-2');
  void h.card();
  assert.equal(h.tokens.length, 2);
  h.tokens[1].resolve({ status: 'OK', token: 'synthetic-card-token-2' });
  await h.settle();
  assert.equal(JSON.parse(String(h.requests[1].options.body)).invoiceNumber, 'INV-SYNTHETIC-2');
  h.requests[1].resolve(Response.json(completed));
  await h.settle();
});

test('tech checkout is mutually exclusive, truthful and cannot be created twice for same form', async () => {
  const h = await harness('tech');
  const initial = h.render();
  void button(initial, 'Create Square Payment Link').props.onClick();
  void button(initial, 'Create Square Payment Link').props.onClick();
  void button(initial, 'Charge Card').props.onClick();
  assert.equal(h.tokens.length, 0);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(Response.json(checkout));
  const tree = await h.settle();
  assert.match(content(tree), /Payment has not been captured/);
  assert.equal(h.opened.length, 1);
  assert.equal(button(tree, 'Charge Card').props.disabled, true);
  assert.equal(button(tree, 'Create Square Payment Link').props.disabled, true);
  assert.ok(button(tree, 'New payment for another invoice'));
});

test('tech checkout deadline locks form and ignores a late URL', async () => {
  const h = await harness('tech');
  void h.checkout();
  h.advance(PAYMENT_DEADLINE_MS);
  await h.settle();
  h.requests[0].resolve(Response.json(checkout));
  const tree = await h.settle();
  assert.match(content(tree), /Payment status is uncertain/);
  assert.equal(h.opened.length, 0);
  assert.ok(!nodes(tree).some(node => node.type === 'button' && /New payment/.test(content(node))));
  void h.card();
  void h.checkout();
  assert.equal(h.tokens.length, 0);
  assert.equal(h.requests.length, 1);
});
