import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

type Node = { type: string; props: Record<string, any> };
type Effect = { deps: unknown[]; cleanup?: () => void; run?: () => (() => void) | void };

async function harness(initialQuery = '') {
  let cursor = 0;
  const values: unknown[] = [];
  const effects: Effect[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const requests: { url: string; signal: AbortSignal; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
  const fixture = {
    searchParams: new URLSearchParams(initialQuery),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (value: unknown) => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
    useEffect(run: Effect['run'], deps: unknown[]) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects[index] = { deps, cleanup: previous?.cleanup, run };
      }
    },
    jsx(type: string | ((props: object) => unknown), props: object) { return typeof type === 'function' ? type(props) : { type, props }; },
  };
  const mocks: Record<string, string> = {
    react: 'export const useState = fixture.useState; export const useEffect = fixture.useEffect; export const Suspense = ({children}) => children;',
    'react/jsx-runtime': 'export const jsx = fixture.jsx; export const jsxs = fixture.jsx; export const Fragment = "fragment";',
    'next/link': 'export default props => fixture.jsx("a", props);',
    'next/navigation': 'export const useSearchParams = () => fixture.searchParams;',
    'lucide-react': 'const icon = () => null; export {icon as ArrowDown, icon as ArrowRight, icon as ArrowUp, icon as Plus, icon as RefreshCw, icon as Search};',
    '@/components/layout/Sidebar': 'export default () => null;',
    '@/components/layout/Header': 'export default () => null;',
    '@/lib/avatar': 'export const colorFromName = () => "#555"; export const initialsFromName = () => "T";',
    '@/lib/quickbooks/browser-sync': 'export const syncQuickBooksEntity = async () => { throw new Error("Provider calls forbidden in offline tests"); };',
  };
  const result = await build({ entryPoints: ['src/app/customers/page.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    plugins: [{ name: 'customer-list-offline', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const loaded = { exports: {} as { default: () => Node } };
  runInNewContext(result.outputFiles[0].text, {
    module: loaded, exports: loaded.exports, fixture, URLSearchParams, AbortController,
    setTimeout: (callback: () => void) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, options: { signal: AbortSignal }) => new Promise<Response>((resolve, reject) => requests.push({ url, signal: options.signal, resolve, reject })),
  });
  function render() {
    cursor = 0;
    const tree = loaded.exports.default();
    for (const effect of effects) {
      if (effect?.run) {
        effect.cleanup?.();
        effect.cleanup = effect.run() || undefined;
        effect.run = undefined;
      }
    }
    return tree;
  }
  return {
    render, requests,
    navigate(query: string) { fixture.searchParams = new URLSearchParams(query); render(); return render(); },
    async settle() { await new Promise(setImmediate); return render(); },
    debounce() { for (const callback of timers.values()) callback(); timers.clear(); },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
  };
}

test('dashboard balance deep-link applies the filter to the first customer request', async () => {
  const h = await harness('filter=with_balance');
  const tree = h.render();
  assert.equal(new URL(h.requests[0].url, 'https://example.invalid').searchParams.get('filter'), 'with_balance');
  assert.equal(button(tree, 'Owe money').props['aria-pressed'], true);
  assert.equal(h.requests.length, 1);
  h.unmount();
});

test('URL filters accept only the supported values and otherwise default to active', async () => {
  for (const value of ['active', 'inactive', 'all', 'with_balance', '', 'unknown', 'ALL']) {
    const h = await harness(`filter=${value}&sort=name&dir=asc`);
    h.render();
    const params = new URL(h.requests[0].url, 'https://example.invalid').searchParams;
    assert.equal(params.get('filter'), ['active', 'inactive', 'all', 'with_balance'].includes(value) ? value : 'active');
    assert.equal(params.get('sort'), 'balance');
    assert.equal(params.get('dir'), 'desc');
    h.unmount();
  }
});

test('URL filter navigation updates selection while unchanged URLs preserve manual filters', async () => {
  const h = await harness('filter=with_balance');
  let tree = h.render();
  button(tree, 'All').props.onClick();
  tree = h.render();
  assert.equal(button(tree, 'All').props['aria-pressed'], true);
  const count = h.requests.length;
  tree = h.navigate('filter=with_balance&unrelated=changed');
  assert.equal(button(tree, 'All').props['aria-pressed'], true);
  assert.equal(h.requests.length, count);
  tree = h.navigate('filter=inactive');
  assert.equal(button(tree, 'Inactive').props['aria-pressed'], true);
  assert.match(h.requests.at(-1)!.url, /filter=inactive/);
  assert.equal(h.requests[count - 1].signal.aborted, true);
  tree = h.navigate('filter=invalid');
  assert.equal(button(tree, 'Active').props['aria-pressed'], true);
  h.navigate('filter=all');
  tree = h.navigate('');
  assert.equal(button(tree, 'Active').props['aria-pressed'], true);
  h.unmount();
});

function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Node;
  return [node, ...nodes(node.props?.children)];
}

function content(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? content((tree as Node).props?.children) : String(tree);
}

function button(tree: Node, label: string) {
  const found = nodes(tree).find(node => node.type === 'button' && content(node).trim() === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

function payload(label = 'Synthetic Customer') {
  return {
    items: [{ id: '00000000-0000-4000-8000-000000000001', displayName: label, isActive: true,
      address: { line1: 'TEST-ONLY LOCATION', line2: 'Synthetic Unit', city: 'Fixture City', state: 'ZZ', zip: '00000' },
      email: 'offline@example.invalid', phone: '555-0100', phoneAlt: '555-0101', balance: 0, totalRevenue: 0, openInvoiceCount: 0 }],
    totals: { customers: 1, balance: 0, openInvoices: 0, revenue: 0 },
    moneyBar: { totalDue: 0, openInvoiceCount: 0, overdueAmount: 0, overdueCount: 0, revenueYTD: 0, ytdInvoiceCount: 0 },
  };
}

test('failed initial load has retry, retry success displays API address and exact profile link', async () => {
  const h = await harness();
  h.render();
  h.requests[0].resolve(Response.json({}, { status: 503 }));
  let tree = await h.settle();
  assert.match(content(tree), /Could not load customers/);
  assert.doesNotMatch(content(tree), /No customers match/);
  button(tree, 'Retry').props.onClick();
  h.render();
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[1].resolve(Response.json(payload()));
  tree = await h.settle();
  assert.match(content(tree), /TEST-ONLY LOCATION, Synthetic Unit, Fixture City ZZ 00000/);
  assert.match(content(tree), /555-0101/);
  assert.equal(nodes(tree).find(node => node.type === 'a')?.props.href, '/customers/00000000-0000-4000-8000-000000000001');
  assert.doesNotMatch(content(tree), /Could not load/);
  h.unmount();
});

test('filter failure retains last good data, retry uses current query and unmount aborts', async () => {
  const h = await harness();
  h.render();
  h.requests[0].resolve(Response.json(payload()));
  let tree = await h.settle();
  button(tree, 'Inactive').props.onClick();
  h.render();
  tree = h.render();
  assert.match(content(tree), /Updating customers. Showing last loaded results/);
  assert.match(h.requests[1].url, /filter=inactive/);
  h.requests[1].reject(new Error('Synthetic network failure'));
  tree = await h.settle();
  assert.match(content(tree), /Showing last loaded results/);
  assert.match(content(tree), /Synthetic Customer/);
  button(tree, 'Retry').props.onClick();
  h.render();
  assert.match(h.requests[2].url, /filter=inactive/);
  h.unmount();
  assert.equal(h.requests[2].signal.aborted, true);
});

test('superseded response cannot replace newer data even when transport ignores abort', async () => {
  const h = await harness();
  const tree = h.render();
  const search = nodes(tree).find(node => node.type === 'input');
  search!.props.onChange({ target: { value: 'Synthetic new' } });
  h.render();
  h.debounce();
  h.render();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.match(h.requests[1].url, /q=Synthetic\+new/);
  h.requests[1].resolve(Response.json(payload('Synthetic new')));
  await h.settle();
  h.requests[0].resolve(Response.json(payload('Synthetic stale')));
  const updated = await h.settle();
  assert.match(content(updated), /Synthetic new/);
  assert.doesNotMatch(content(updated), /Synthetic stale|Could not load/);
  h.unmount();
});

test('malformed refresh preserves data and sorting is keyboard-operable', async () => {
  const h = await harness();
  h.render();
  h.requests[0].resolve(Response.json(payload()));
  let tree = await h.settle();
  button(tree, 'Customer').props.onClick();
  h.render();
  assert.match(h.requests[1].url, /sort=name&dir=asc/);
  h.requests[1].resolve(Response.json({ items: [] }));
  tree = await h.settle();
  assert.match(content(tree), /Synthetic Customer/);
  assert.match(content(tree), /Could not load customers/);
  assert.ok(nodes(tree).some(node => node.type === 'th' && node.props['aria-sort'] === 'ascending'));
  h.unmount();
});

test('unsupported creation control is removed: existing contracts cannot safely create a center record', async () => {
  const h = await harness();
  const tree = h.render();
  assert.ok(!nodes(tree).some(node => node.type === 'button' && /New customer/.test(content(node))));
  const legacy = readFileSync('src/lib/data-store.ts', 'utf8');
  const qb = readFileSync('src/app/api/quickbooks/customers/route.ts', 'utf8');
  assert.match(legacy, /id: `cust-/);
  assert.equal((qb.match(/await createCustomerInQuickBooks\(client, qbCustomer\)/g) || []).length, 2);
  h.unmount();
});

test('large lists render progressively in desktop rows and mobile cards without truncating totals', async () => {
  const h = await harness();
  h.render();
  const data = payload();
  data.items = Array.from({ length: 4916 }, (_, i) => ({ ...data.items[0], id: `synthetic-${i}` }));
  data.totals.customers = 4916;
  h.requests[0].resolve(Response.json(data));
  let tree = await h.settle();
  assert.equal(nodes(tree).filter(node => node.type === 'article').length, 50);
  assert.equal(nodes(tree).filter(node => node.type === 'tr').length, 51);
  assert.match(content(tree), /Showing\s+50\s+of\s+4,916/);
  button(tree, 'Show more').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree).filter(node => node.type === 'article').length, 100);
  assert.match(content(tree), /Showing\s+100\s+of\s+4,916/);
  assert.equal(nodes(tree).find(node => node.type === 'select')?.props['aria-label'], 'Sort customers');
  const main = nodes(tree).find(node => node.type === 'main');
  assert.equal(main?.props.style.background, 'var(--color-bg)');
  assert.ok(!Object.keys(main?.props.style).some(key => key.startsWith('--')));
  assert.ok(nodes(tree).some(node => node.props.className?.includes('grid-cols-2 lg:grid-cols-4')));
  assert.ok(nodes(tree).some(node => node.props.className?.includes('pb-[calc(6rem+env(safe-area-inset-bottom))]')));
  h.unmount();
});

test('mobile cards expose usable email, primary phone and alternate phone links', async () => {
  const h = await harness();
  h.render();
  h.requests[0].resolve(Response.json(payload()));
  const tree = await h.settle();
  const card = nodes(tree).find(node => node.type === 'article');
  const links = nodes(card).filter(node => node.type === 'a').map(node => node.props.href);
  assert.deepEqual(links, ['/customers/00000000-0000-4000-8000-000000000001', 'mailto:offline%40example.invalid', 'tel:555-0100', 'tel:555-0101']);
  h.unmount();
});
