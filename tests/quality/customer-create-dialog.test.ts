import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

type Node = { type: string; props: Record<string, any> };
type Request = { url: string; options: { method: string; headers: object; body: string; signal: AbortSignal }; resolve: (response: Response) => void; reject: (error: Error) => void };
const localId = '00000000-0000-4000-8000-000000000001';
const success = { success: true, customer: { id: 'QB-SYNTHETIC-1', localId, displayName: 'Synthetic Customer' } };

async function harness() {
  let cursor = 0;
  const values: any[] = [];
  const requests: Request[] = [];
  const created: unknown[] = [];
  let now = 0;
  let nextTimer = 0;
  const timers = new Map<number, { due: number; run: () => void }>();
  let tree: Node;
  let focused = '';
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; nodes(tree).find(node => node.type === 'dialog')!.props.onClose(); },
    querySelector(selector: string) { return { focus() { focused = selector; } }; },
  };
  const fixture = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (value: any) => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    jsx(type: string | ((props: object) => unknown), props: any) {
      if (typeof type === 'function') return type(props);
      if (props.ref && type === 'dialog') props.ref.current = dialog;
      if (props.ref && type === 'button') props.ref.current = { focus() { focused = 'trigger'; } };
      return { type, props };
    },
  };
  const mocks: Record<string, string> = {
    react: 'export const useState = fixture.useState; export const useRef = fixture.useRef; export const useId = () => "synthetic-dialog";',
    'react/jsx-runtime': 'export const jsx = fixture.jsx; export const jsxs = fixture.jsx; export const Fragment = "fragment";',
    'next/link': 'export default props => fixture.jsx("a", props);',
    'lucide-react': 'const icon = () => null; export { icon as Plus, icon as RefreshCw, icon as X };',
  };
  const result = await build({ entryPoints: ['src/components/customers/CreateCustomerDialog.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    plugins: [{ name: 'synthetic-customer-create', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const loaded = { exports: {} as { default: (props: object) => Node } };
  runInNewContext(result.outputFiles[0].text, {
    module: loaded, exports: loaded.exports, fixture, AbortController,
    setTimeout(run: () => void, delay: number) {
      const id = ++nextTimer;
      timers.set(id, { due: now + delay, run });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
    fetch: (url: string, options: Request['options']) => {
      assert.equal(url, '/api/quickbooks/customers', 'Only the new contract may be called');
      assert.equal(options.method, 'POST');
      return new Promise<Response>((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  });
  function render() {
    cursor = 0;
    tree = loaded.exports.default({ onCreated: (customer: unknown) => created.push(customer) });
    return tree;
  }
  return {
    render, requests, created, dialog,
    get timerCount() { return timers.size; },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.due <= now) { timers.delete(id); timer.run(); }
      }
    },
    get focused() { return focused; },
    change(name: string, value: string) {
      nodes(render()).find(node => node.type === 'input' && node.props.name === name)!.props.onChange({ target: { value } });
      return render();
    },
    submit() { nodes(render()).find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} }); return render(); },
    async settle() { await new Promise(setImmediate); return render(); },
  };
}

function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Node;
  return [node, ...nodes(node.props?.children)];
}
function content(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? content((tree as Node).props?.children) : String(tree);
}
function button(tree: Node, label: string) {
  const found = nodes(tree).find(node => node.type === 'button' && (content(node).trim() === label || node.props['aria-label'] === label));
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
function locked(tree: Node) { return nodes(tree).find(node => node.type === 'fieldset')?.props.disabled; }

test('native modal has a named trigger, associated labels, bounded fields and close/ESC focus return', async () => {
  const h = await harness();
  let tree = h.render();
  assert.equal(button(tree, 'New customer').props['aria-haspopup'], 'dialog');
  button(tree, 'New customer').props.onClick();
  tree = h.render();
  assert.equal(h.dialog.open, true);
  assert.equal(button(tree, 'New customer').props['aria-expanded'], true);
  const modal = nodes(tree).find(node => node.type === 'dialog')!;
  assert.equal(modal.props['aria-labelledby'], 'synthetic-dialog-title');
  const inputs = nodes(tree).filter(node => node.type === 'input');
  assert.equal(inputs.length, 11);
  for (const input of inputs) {
    assert.ok(input.props.maxLength > 0);
    assert.ok(nodes(tree).some(node => node.type === 'label' && node.props.htmlFor === input.props.id));
  }
  h.change('displayName', 'Unsubmitted draft');
  let prevented = false;
  modal.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.dialog.open, false);
  assert.equal(h.focused, 'trigger');
  button(h.render(), 'New customer').props.onClick();
  assert.equal(nodes(h.render()).find(node => node.props.name === 'displayName')?.props.value, 'Unsubmitted draft');
  button(h.render(), 'Close new customer').props.onClick();
  assert.equal(h.focused, 'trigger');
  assert.equal(h.requests.length, 0);
});

test('required name, email format and every field length are validated before any request', async () => {
  const h = await harness();
  h.change('displayName', '   ');
  assert.match(content(h.submit()), /Enter a display name/);
  assert.equal(h.focused, '[name="displayName"]');
  h.change('displayName', 'Synthetic Customer');
  h.change('email', 'invalid@');
  assert.match(content(h.submit()), /Enter a valid email/);
  h.change('email', '');
  for (const input of nodes(h.render()).filter(node => node.type === 'input')) {
    h.change(input.props.name, 'x'.repeat(input.props.maxLength + 1));
    const tree = h.submit();
    assert.equal(nodes(tree).find(node => node.props.name === input.props.name)?.props['aria-invalid'], true);
    h.change(input.props.name, input.props.name === 'displayName' ? 'Synthetic Customer' : '');
  }
  assert.equal(h.requests.length, 0);
});

test('201 success sends exact nested payload once, locks pending, reloads parent and links local UUID', async () => {
  const h = await harness();
  for (const [name, value] of Object.entries({ displayName: ' Synthetic Customer ', firstName: 'Synthetic', lastName: 'Customer', companyName: 'Test Only', email: 'offline@example.invalid', phone: '555-0100', line1: 'Test Line', line2: 'Test Unit', city: 'Fixture', state: 'ZZ', zip: '00000' })) h.change(name, value);
  let tree = h.submit();
  h.submit();
  assert.equal(h.requests.length, 1);
  assert.equal(locked(tree), true);
  assert.equal(button(tree, 'Creating customer...').props.disabled, true);
  const payload = JSON.parse(h.requests[0].options.body);
  assert.deepEqual(payload, { displayName: 'Synthetic Customer', firstName: 'Synthetic', lastName: 'Customer', companyName: 'Test Only', email: 'offline@example.invalid', phone: '555-0100', address: { line1: 'Test Line', line2: 'Test Unit', city: 'Fixture', state: 'ZZ', zip: '00000' } });
  h.requests[0].resolve(Response.json(success, { status: 201 }));
  tree = await h.settle();
  assert.equal(h.created.length, 1);
  assert.equal(nodes(tree).find(node => node.type === 'a')?.props.href, `/customers/${localId}`);
  assert.ok(nodes(tree).some(node => node.props.role === 'status' && /Customer created/.test(content(node))));
  h.submit();
  assert.equal(h.requests.length, 1);
  button(tree, 'Close').props.onClick();
  button(h.render(), 'New customer').props.onClick();
  assert.equal(locked(h.render()), false);
  assert.equal(nodes(h.render()).find(node => node.props.name === 'displayName')?.props.value, '');
});

test('normal 400 allows corrected create without automatic retry', async () => {
  const h = await harness();
  h.change('displayName', 'Synthetic Customer');
  h.submit();
  h.requests[0].resolve(Response.json({ error: 'Invalid details', code: 'INVALID_CUSTOMER' }, { status: 400 }));
  let tree = await h.settle();
  assert.equal(locked(tree), false);
  assert.match(content(tree), /Invalid details/);
  assert.equal(h.requests.length, 1);
  h.change('displayName', 'Corrected synthetic');
  tree = h.submit();
  assert.equal(locked(tree), true);
  assert.equal(JSON.parse(h.requests[1].options.body).displayName, 'Corrected synthetic');
});

test('20-second create and reconciliation deadlines lock the same payload without retries or late success', async () => {
  const h = await harness();
  h.change('displayName', 'Synthetic Customer');
  h.change('line2', 'Preserved unit');
  h.submit();
  assert.equal(h.timerCount, 1);
  h.advance(19_999);
  await h.settle();
  assert.equal(h.requests[0].options.signal.aborted, false);
  assert.equal(button(h.render(), 'Creating customer...').props.disabled, true);
  h.advance(1);
  let tree = await h.settle();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.timerCount, 0);
  assert.equal(locked(tree), true);
  assert.equal(h.requests.length, 1);
  button(tree, 'Close').props.onClick();
  button(h.render(), 'New customer').props.onClick();
  h.change('displayName', 'Forbidden change');
  h.submit();
  assert.equal(h.requests.length, 1);
  button(h.render(), 'Check creation status').props.onClick();
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { ...JSON.parse(h.requests[0].options.body), action: 'reconcile' });
  // The synthetic transport deliberately ignores abort and returns a stale success.
  h.requests[0].resolve(Response.json(success, { status: 201 }));
  tree = await h.settle();
  assert.equal(h.created.length, 0);
  assert.equal(button(tree, 'Checking creation status...').props.disabled, true);
  h.advance(20_000);
  tree = await h.settle();
  assert.equal(h.requests[1].options.signal.aborted, true);
  assert.equal(locked(tree), true);
  assert.equal(h.requests.length, 2);
  button(tree, 'Check creation status').props.onClick();
  assert.equal(h.requests[2].options.body, h.requests[1].options.body);
  h.requests[2].resolve(Response.json({ ...success, recovered: true }, { status: 200 }));
  await h.settle();
  assert.equal(h.created.length, 1);
  assert.equal(h.timerCount, 0);
  h.advance(20_000);
  assert.equal(h.requests[2].options.signal.aborted, false);
  assert.equal(h.requests.length, 3);
});

test('deadline also bounds a hanging response body', async () => {
  const h = await harness();
  h.change('displayName', 'Synthetic Customer');
  h.submit();
  h.requests[0].resolve({ status: 201, json: () => new Promise(() => {}) } as Response);
  await h.settle();
  h.advance(20_000);
  const tree = await h.settle();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(locked(tree), true);
  assert.ok(button(tree, 'Check creation status'));
  assert.equal(h.requests.length, 1);
  assert.equal(h.created.length, 0);
});

for (const rejection of [
  { status: 401, code: 'UNAUTHENTICATED' },
  { status: 403, code: 'FORBIDDEN' },
  { status: 409, code: 'QB_NOT_CONNECTED' },
  { status: 401, code: null },
  { status: 403, code: null },
]) {
  test(`preclaim ${rejection.status} ${rejection.code || 'non-JSON'} permits edits and only a manual create`, async () => {
    const h = await harness();
    h.change('displayName', 'Synthetic Customer');
    h.submit();
    h.requests[0].resolve(rejection.code
      ? Response.json({ error: 'Synthetic preclaim rejection', code: rejection.code }, { status: rejection.status })
      : new Response('Access denied', { status: rejection.status }));
    const tree = await h.settle();
    assert.equal(locked(tree), false);
    assert.equal(h.timerCount, 0);
    assert.ok(button(tree, 'Create customer'));
    assert.ok(!nodes(tree).some(node => node.type === 'button' && content(node).trim() === 'Check creation status'));
    assert.equal(h.created.length, 0);
    h.advance(20_000);
    assert.equal(h.requests[0].options.signal.aborted, false);
    assert.equal(h.requests.length, 1);
    h.change('displayName', 'Corrected synthetic');
    h.submit();
    assert.equal(h.requests.length, 2);
    assert.equal(JSON.parse(h.requests[1].options.body).displayName, 'Corrected synthetic');
    assert.equal(JSON.parse(h.requests[1].options.body).action, undefined);
  });
}

test('QB_NOT_CONNECTED on an ambiguous status still requires review', async () => {
  const h = await harness();
  h.change('displayName', 'Synthetic Customer');
  h.submit();
  h.requests[0].resolve(Response.json({ error: 'Synthetic failure', code: 'QB_NOT_CONNECTED' }, { status: 503 }));
  const tree = await h.settle();
  assert.equal(locked(tree), true);
  assert.ok(button(tree, 'Check creation status'));
  assert.equal(h.requests.length, 1);
  assert.equal(h.timerCount, 0);
});

test('confirmation arriving while closed survives reopen until explicitly dismissed', async () => {
  const h = await harness();
  button(h.render(), 'New customer').props.onClick();
  assert.equal(h.focused, '[name="displayName"]');
  h.change('displayName', 'Synthetic Customer');
  button(h.submit(), 'Close').props.onClick();
  h.requests[0].resolve(Response.json(success, { status: 200 }));
  await h.settle();
  assert.equal(h.dialog.open, false);
  button(h.render(), 'New customer').props.onClick();
  const tree = h.render();
  assert.match(content(tree), /Customer created/);
  assert.equal(nodes(tree).find(node => node.type === 'a')?.props.href, `/customers/${localId}`);
  h.submit();
  assert.equal(h.requests.length, 1);
  assert.equal(h.created.length, 1);
  button(tree, 'Close').props.onClick();
  button(h.render(), 'New customer').props.onClick();
  assert.equal(locked(h.render()), false);
});

test('reopening a pending modal retains payload and cannot initiate another create', async () => {
  const h = await harness();
  h.change('displayName', 'Synthetic Customer');
  const tree = h.submit();
  button(tree, 'Close').props.onClick();
  button(h.render(), 'New customer').props.onClick();
  h.change('displayName', 'Forbidden change');
  h.submit();
  assert.equal(locked(h.render()), true);
  assert.equal(h.requests.length, 1);
  assert.equal(nodes(h.render()).find(node => node.props.name === 'displayName')?.props.value, 'Synthetic Customer');
});

for (const failure of ['review409', 'server500', 'server503', 'network', 'malformed', 'missingLocalId', 'invalidLocalId', 'falseSuccess', 'unexpectedStatus']) {
  test(`${failure} locks exact payload across close/reopen and permits only explicit reconciliation`, async () => {
    const h = await harness();
    h.change('displayName', 'Synthetic Customer');
    h.change('line2', 'Preserved unit');
    let tree = h.submit();
    button(tree, 'Close').props.onClick();
    if (failure === 'network') h.requests[0].reject(new Error('Synthetic transport failure'));
    else if (failure === 'malformed') h.requests[0].resolve(new Response('not JSON', { status: 201 }));
    else if (failure === 'missingLocalId') h.requests[0].resolve(Response.json({ success: true, customer: { id: 'QB-ONLY' } }, { status: 201 }));
    else if (failure === 'invalidLocalId') h.requests[0].resolve(Response.json({ success: true, customer: { id: 'QB-ONLY', localId: 'cust-legacy' } }, { status: 201 }));
    else if (failure === 'falseSuccess') h.requests[0].resolve(Response.json({ ...success, success: false }, { status: 201 }));
    else if (failure === 'unexpectedStatus') h.requests[0].resolve(Response.json(success, { status: 202 }));
    else h.requests[0].resolve(Response.json({ error: 'Synthetic failure', code: failure === 'review409' ? 'CUSTOMER_CREATE_REVIEW_REQUIRED' : 'UPSTREAM_ERROR' }, { status: failure === 'review409' ? 409 : failure === 'server500' ? 500 : 503 }));
    tree = await h.settle();
    assert.equal(h.created.length, 0);
    button(tree, 'New customer').props.onClick();
    tree = h.render();
    assert.equal(locked(tree), true);
    assert.equal(h.requests.length, 1);
    assert.ok(!nodes(tree).some(node => node.type === 'button' && content(node) === 'Create customer'));
    h.change('displayName', 'Forbidden change');
    h.submit();
    assert.equal(h.requests.length, 1);
    const check = button(h.render(), 'Check creation status');
    check.props.onClick();
    check.props.onClick();
    tree = h.render();
    assert.equal(h.requests.length, 2);
    assert.equal(button(tree, 'Checking creation status...').props.disabled, true);
    assert.deepEqual(JSON.parse(h.requests[1].options.body), { ...JSON.parse(h.requests[0].options.body), action: 'reconcile' });
    h.requests[1].resolve(Response.json({ ...success, recovered: true }, { status: 200 }));
    tree = await h.settle();
    assert.equal(h.created.length, 1);
    assert.match(content(tree), /Customer creation confirmed/);
    assert.equal(nodes(tree).find(node => node.type === 'a')?.props.href, `/customers/${localId}`);
  });
}

test('failed reconciliation including 400 never unlocks or resubmits create', async () => {
  const h = await harness();
  h.change('displayName', 'Synthetic Customer');
  h.submit();
  h.requests[0].reject(new Error('Synthetic failure'));
  await h.settle();
  for (const status of [409, 500, 400, 401, 403, 409]) {
    button(h.render(), 'Check creation status').props.onClick();
    h.requests.at(-1)!.resolve(Response.json({ error: 'Still unresolved', code: status === 409 ? 'QB_NOT_CONNECTED' : 'REVIEW_REQUIRED' }, { status }));
    const tree = await h.settle();
    assert.equal(locked(tree), true);
    assert.equal(JSON.parse(h.requests.at(-1)!.options.body).action, 'reconcile');
    const count = h.requests.length;
    h.submit();
    assert.equal(h.requests.length, count);
  }
  assert.equal(h.created.length, 0);
});

test('customer page keeps dialog mounted and refreshes its existing loader on creation', () => {
  const source = readFileSync('src/app/customers/page.tsx', 'utf8');
  assert.match(source, /import CreateCustomerDialog from "@\/components\/customers\/CreateCustomerDialog"/);
  assert.match(source, /<CreateCustomerDialog onCreated=\{\(\) => setRefresh\(\(value\) => value \+ 1\)\} \/>/);
  assert.match(source, /\[debounced, filter, sort, dir, refresh\]/);
});
