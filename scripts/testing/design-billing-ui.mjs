import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Production UI and handlers, synthetic HTTP only. No Next server, env files, or providers.
// node scripts/testing/design-billing-ui.mjs [--serve] [--port=0] [--output=/tmp/...]
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const argument = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const serveOnly = process.argv.includes('--serve') || process.argv.includes('--serve-only');
const output = path.resolve(argument('output', '/tmp/hearthos-design-billing-qa'));
const port = Number(argument('port', '0'));
assert.ok(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid --port');
const viewports = [{ width: 1440, height: 1000 }, { width: 1600, height: 1100 }, { width: 390, height: 844 }];
const today = new Date().toISOString().slice(0, 10);
const largeAmount = 1234567.89;
const customer = {
  id: '11111111-1111-4111-8111-111111111111', qbCustomerId: 'fixture-customer',
  displayName: 'Example Hearth Customer', email: 'customer@example.invalid', phone: '555-0100',
  address: { line1: '100 Example Street', line2: 'Lot 5', city: 'Test City', state: 'PA', zip: '17000' },
};
const otherCustomer = { ...customer, id: '11111111-1111-4111-8111-111111111112', displayName: 'Second Fixture Customer' };
const item = { Id: 'fixture-item', Name: '42 Apex', Sku: 'APEX-42', UnitPrice: 12345.67 };
const estimate = {
  Id: 'fixture-estimate', DocNumber: 'EST-QA-1001', TxnDate: today, ExpirationDate: today,
  CustomerRef: { value: customer.id, name: customer.displayName }, TotalAmt: largeAmount,
  BillEmail: { Address: customer.email }, PrivateNote: 'Synthetic estimate, never save to a provider.',
  Line: [{ Amount: largeAmount, Description: '42 Apex fireplace installation with a long product description and finishing materials',
    DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { Qty: 1, UnitPrice: largeAmount, ItemRef: { value: item.Id, name: item.Name, sku: item.Sku } } }],
};
const estimates = [estimate, { ...estimate, Id: 'fixture-estimate-2', DocNumber: 'EST-QA-1002', TotalAmt: 250,
  CustomerRef: { value: otherCustomer.id, name: otherCustomer.displayName } }];
const invoice = {
  id: '22222222-2222-4222-8222-222222222221', invoiceNumber: 'INV-QA-1001',
  customerId: customer.id, customerName: customer.displayName, jobTitle: '42 Apex fireplace installation',
  issueDate: today, dueDate: today, status: 'sent', subtotal: largeAmount, taxRate: 0, taxAmount: 0,
  totalAmount: largeAmount, balance: largeAmount, createdAt: today, updatedAt: today,
  lineItems: [{ id: 'fixture-line', description: '42 Apex fireplace installation with finishing materials',
    itemId: item.Id, itemName: item.Name, partNumber: item.Sku, qty: 1, unitPrice: largeAmount, total: largeAmount }],
};
const invoices = [invoice,
  { ...invoice, id: '22222222-2222-4222-8222-222222222222', invoiceNumber: 'INV-QA-1002', status: 'paid', balance: 0, customerName: otherCustomer.displayName, customerId: otherCustomer.id },
  { ...invoice, id: '22222222-2222-4222-8222-222222222223', invoiceNumber: 'INV-QA-1003', status: 'overdue' },
];
const payments = ['completed', 'pending', 'failed'].map((status, index) => ({
  id: `fixture-payment-${index}`, invoiceId: invoices[index].id, invoiceNumber: invoices[index].invoiceNumber,
  customerId: invoices[index].customerId, customerName: invoices[index].customerName,
  amount: largeAmount, status, method: 'credit_card', paymentDate: `${today}T12:00:00Z`,
}));
const purchaseOrder = { Id: 'fixture-po', DocNumber: 'PO-QA-1001', TxnDate: today,
  VendorRef: { name: 'Example Hearth Supply Company' }, TotalAmt: largeAmount };
const estimatePurchaseOrder = { ...purchaseOrder, Id: 'fixture-po-estimate', DocNumber: 'EST-QA-1001' };
// Match GET /api/purchase-orders/[id]: local row, vendor summary, ordered DB lines.
const purchaseOrderDetails = record => ({
  purchaseOrder: {
    id: record.Id, orgId: 'fixture-org', vendorId: 'fixture-vendor', qbPurchaseOrderId: 'fixture-qb-po',
    poNumber: record.DocNumber, status: 'open', issueDate: today, expectedDate: today, receivedDate: null,
    subtotal: String(largeAmount), taxAmount: '0.00', totalAmount: String(largeAmount),
    shipAddress: '100 Example Street\nLot 5\nTest City, PA 17000',
    vendorMessage: 'Deliver synthetic fixture items to the side entrance.', privateNote: 'Read-only QA purchase order.',
    emailStatus: null, lastSyncedAt: null, createdAt: `${today}T12:00:00Z`, updatedAt: `${today}T12:00:00Z`,
  },
  vendor: { id: 'fixture-vendor', name: record.VendorRef.name, email: 'vendor@example.invalid', phone: '555-0120' },
  lineItems: [
    { id: 'fixture-po-line-1', purchaseOrderId: record.Id, qbItemId: item.Id, qbAccountId: null,
      description: '42 Apex fixture fireplace package', quantity: '2.0000', unitCost: '600000.0000', total: '1200000.00', receivedQty: '1.0000', order: 0 },
    { id: 'fixture-po-line-2', purchaseOrderId: record.Id, qbItemId: 'fixture-pipe', qbAccountId: null,
      description: 'Fixture venting and finishing materials', quantity: '1.0000', unitCost: '34567.8900', total: '34567.89', receivedQty: '0.0000', order: 1 },
  ],
});
const aiResponse = {
  matchedProduct: '42 Apex', basedOnInvoices: 2, matchCount: 1, notes: 'Synthetic estimator response.',
  lineItems: [
    { itemId: item.Id, itemName: item.Name, partNumber: item.Sku, description: '42 Apex synthetic fireplace', quantity: 2, unitPrice: 12345.67, total: 24691.34 },
    { itemId: 'fixture-labor', itemName: 'Installation', partNumber: 'LABOR', description: 'Synthetic installation labor', quantity: 1, unitPrice: 800, total: 800 },
  ],
  sourceInvoices: [{ docNumber: invoice.invoiceNumber, customer: customer.displayName, date: today, total: largeAmount, type: 'invoice' }],
};
const fixtures = {
  '/api/quickbooks/status': { connected: true },
  '/api/dispatch': { techs: [], jobs: [], stats: { activeTechs: 0, onJob: 0, available: 0, offline: 0, unassigned: 0 } },
  '/api/estimates': { estimates }, '/api/items/local': { items: [item] },
  '/api/invoices': { invoices }, '/api/quickbooks/invoices': { invoices },
  '/api/quickbooks/items': { items: [item] }, '/api/inventory': { items: [item] },
  '/api/customers': { customers: [customer, otherCustomer] },
  '/api/quickbooks/customers': { customers: [customer, otherCustomer] },
  '/api/square/transactions': { payments },
  '/api/purchase-orders': { purchaseOrders: [purchaseOrder, estimatePurchaseOrder] },
  '/api/purchase-orders/fixture-po': purchaseOrderDetails(purchaseOrder),
  '/api/purchase-orders/fixture-po-estimate': purchaseOrderDetails(estimatePurchaseOrder),
  '/api/vendors': { items: [{ id: 'fixture-vendor', displayName: purchaseOrder.VendorRef.name,
    email: 'vendor@example.invalid', addressLine1: '200 Example Road', city: 'Test City', state: 'PA', zip: '17000' }] },
};
const apiRequests = [];
const fixtureFailures = new Map();
function fixtureApi(method, url, body) {
  if (method === 'POST' && url.pathname === '/api/estimator/learn') {
    return { status: 200, disposition: 'synthetic-noop', body: { ok: true, synthetic: true } };
  }
  if (method === 'POST' && url.pathname === '/api/estimator/ai-generate') {
    const valid = typeof body?.prompt === 'string' && body.prompt.trim() && typeof body?.customerName === 'string';
    return valid
      ? { status: 200, disposition: 'synthetic-estimator', body: aiResponse }
      : { status: 400, disposition: 'invalid-fixture-request', body: { error: 'Expected prompt and customerName' } };
  }
  if (method !== 'GET') return { status: 405, disposition: 'denied-write', body: { error: 'Synthetic preview: all provider and persistence writes are disabled.' } };
  if (fixtureFailures.has(url.pathname)) return { ...fixtureFailures.get(url.pathname), disposition: 'synthetic-failure' };
  let result = fixtures[url.pathname];
  if (url.pathname === '/api/customer-lookup') {
    const query = (url.searchParams.get('q') || '').toLowerCase();
    result = { customers: [customer, otherCustomer].filter(entry => entry.displayName.toLowerCase().includes(query)), source: 'fixture' };
  }
  if (url.pathname === '/api/estimates' && url.searchParams.has('id')) {
    result = { estimate: estimates.find(entry => entry.Id === url.searchParams.get('id')) || null };
  }
  if (url.pathname === '/api/search') result = { customers: [{ id: customer.id, title: customer.displayName,
    subtitle: '100 Example Street', href: `/customers/${customer.id}`, type: 'customer' }], jobs: [], invoices: [] };
  return result ? { status: 200, disposition: 'synthetic-read', body: result }
    : { status: 503, disposition: 'unconfigured-api', body: { error: 'Unconfigured synthetic endpoint; no fallback to live data.' } };
}

const adapters = {
  'next/navigation': `import {useMemo,useSyncExternalStore} from 'react';
    const subscribe=f=>{addEventListener('popstate',f);return()=>removeEventListener('popstate',f)};
    const current=()=>location.pathname+location.search;
    export function usePathname(){return useSyncExternalStore(subscribe,current,current).split('?')[0]}
    export function useSearchParams(){const url=useSyncExternalStore(subscribe,current,current);return useMemo(()=>new URLSearchParams(url.split('?')[1]||''),[url])}
    const go=(url,replace=false)=>{history[replace?'replaceState':'pushState']({},'',url);dispatchEvent(new PopStateEvent('popstate'))};
    export const useRouter=()=>({push:go,replace:url=>go(url,true),back:()=>history.back(),refresh:()=>dispatchEvent(new PopStateEvent('popstate'))});`,
  'next/link': `import React from 'react';export default function Link({children,href,onClick,prefetch,replace,...props}){
    return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey){event.preventDefault();history[replace?'replaceState':'pushState']({},'',href);dispatchEvent(new PopStateEvent('popstate'))}}}>{children}</a>}`,
  '@clerk/nextjs': `export const useUser=()=>({isLoaded:true,isSignedIn:true,user:{id:'fixture-user',fullName:'Synthetic Operator',firstName:'Synthetic',lastName:'Operator'}});`,
};
const bundle = await build({ absWorkingDir: root, stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';
  import{usePathname}from'next/navigation';import Estimates from './src/app/estimates/page';import Invoices from './src/app/invoices/page';
  import Payments from './src/app/payments/page';import PurchaseOrders from './src/app/purchase-orders/page';
  const pages={'/estimates':Estimates,'/invoices':Invoices,'/payments':Payments,'/purchase-orders':PurchaseOrders};
  function App(){const route=usePathname();const Page=pages[route];return Page?<Page/>:<main><h1>Fixture destination</h1><p>{route}</p></main>}
  createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, metafile: true, outdir: '/tmp/hearthos-design-billing-bundle',
  platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  plugins: [{ name: 'billing-isolated-adapters', setup(builder) {
    builder.onResolve({ filter: /^(next\/(navigation|link)|@clerk\/nextjs)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: root }));
  } }],
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const globalCssPath = path.join(root, 'src/app/globals.css');
const css = (await postcss([tailwind({ base: root })]).process(await readFile(globalCssPath, 'utf8'), { from: globalCssPath })).css
  + '\n' + (bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '')
  + '\n@font-face{font-family:QualityGeist;src:url(/fixture-font.woff2) format("woff2");font-weight:100 900;font-display:swap}:root{--font-geist-sans:QualityGeist;--font-geist-mono:monospace}';
const font = await readFile(path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2'));
const guard = `window.fixtureExternalAttempts=[];
  const local=url=>{try{return new URL(url,location.href).origin===location.origin}catch{return false}};
  const open=window.open;window.open=function(url,...args){if(!local(url)){window.fixtureExternalAttempts.push(String(url));return null}return open.call(this,url,...args)};
  document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link&&!local(link.href)){event.preventDefault();event.stopImmediatePropagation();window.fixtureExternalAttempts.push(link.href)}},true);`;
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'";
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 65536) throw new Error('Oversize fixture request'); }
      let body;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = null; }
      const result = fixtureApi(req.method, url, body);
      apiRequests.push({ method: req.method, path: url.pathname, query: url.search, body,
        status: result.status, disposition: result.disposition, safetyProbe: req.headers['x-fixture-safety-probe'] === '1' });
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const assets = { '/fixture.js': ['application/javascript', js], '/fixture.css': ['text/css', css],
      '/fixture-guard.js': ['application/javascript', guard], '/fixture-font.woff2': ['font/woff2', font] };
    if (assets[url.pathname]) {
      const [type, bytes] = assets[url.pathname]; res.setHeader('Content-Type', type); res.end(bytes); return;
    }
    if (/\.(png|jpg|webp|svg)$/.test(url.pathname)) {
      const publicRoot = path.join(root, 'public');
      const file = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(404); res.end(); return; }
      const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
      try { const bytes = await readFile(file); res.setHeader('Content-Type', types[path.extname(file)]); res.end(bytes); }
      catch { res.writeHead(404); res.end(); }
      return;
    }
    if (!['/', '/estimates', '/invoices', '/payments', '/purchase-orders', '/jobs'].includes(url.pathname)
      && !url.pathname.startsWith('/customers/')) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Billing synthetic QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture-guard.js"></script><script src="/fixture.js"></script></body></html>');
  } catch (error) {
    if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(output, { recursive: true });
const closeServer = () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
const provenance = { bundleSha256: createHash('sha256').update(js).update(css).digest('hex'),
  inputs: Object.keys(bundle.metafile.inputs).filter(file => file.startsWith('src/')), builtAt: new Date().toISOString() };
if (serveOnly) {
  console.log(JSON.stringify({ mode: 'serve-only-synthetic', base, routes: ['/estimates', '/invoices', '/payments', '/purchase-orders'],
    providerWrites: false, externalNetwork: 'CSP deny, external links and popups blocked', provenance }, null, 2));
  await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  await closeServer();
  await writeFile(path.join(output, 'serve-api-requests.json'), JSON.stringify(apiRequests, null, 2));
  process.exit(0);
}

const checks = [], screenshots = [], errors = [], consoleErrors = [], expectedConsoleErrors = [], externalRequests = [];
let browser;
async function screenshot(page, name) {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }); screenshots.push(file); return file;
}
async function check(page, name, run) {
  const width = page.viewportSize().width;
  try { const details = await run(); checks.push({ name, width, ok: true, details }); console.log(`PASS ${width} ${name}`); return true; }
  catch (error) {
    const file = await screenshot(page, `FAIL-${width}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`).catch(() => null);
    checks.push({ name, width, ok: false, error: error.message, screenshot: file }); console.error(`FAIL ${width} ${name}: ${error.message}`); return false;
  }
}
async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function visit(page, route, title) {
  await page.goto(base + route);
  await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
  await settled(page);
}
async function geometry(page, name) {
  await check(page, `${name}: page and panel overflow`, async () => {
    const issues = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push({ type: 'document-overflow', width: document.documentElement.scrollWidth });
      for (const el of document.querySelectorAll('.billing-shell,.billing-main,.billing-invoice-content,.billing-invoice-list,.billing-invoice-detail,.billing-metrics,.billing-filters,.billing-heading,.billing-recent')) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (box.left < -1 || box.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2) {
          issues.push({ element: el.className, left: box.left, right: box.right, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth });
        }
      }
      return issues;
    });
    assert.ok(issues.length === 0, JSON.stringify(issues));
  });
  await check(page, `${name}: numeric text fits`, async () => {
    const issues = await page.evaluate(() => {
      const issues = [];
      for (const el of document.querySelectorAll('.billing-surface *')) {
        if (el.children.length || !/^\$[\d,]+(?:\.\d+)?$/.test(el.textContent.trim())) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const range = document.createRange(); range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        if (rects.some(rect => rect.left < box.left - 1 || rect.right > box.right + 1)
          || new Set(rects.map(rect => Math.round(rect.top))).size > 1) {
          issues.push({ text: el.textContent.trim(), element: el.className, width: box.width, textWidth: range.getBoundingClientRect().width, lines: rects.length });
        }
      }
      return issues;
    });
    assert.ok(issues.length === 0, JSON.stringify(issues));
  });
}
async function drawer(page) {
  await check(page, 'mobile navigation: focus, trap, dismissal and route', async () => {
    const trigger = page.getByRole('button', { name: 'More navigation', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'All navigation', exact: true });
    await dialog.waitFor();
    assert.equal(await page.getByRole('button', { name: 'Close navigation' }).evaluate(el => el === document.activeElement), true, 'Close button receives initial focus');
    assert.equal(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }), true, 'Drawer fits viewport');
    for (const key of ['Shift+Tab', 'Tab']) {
      await page.keyboard.press(key);
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Focus stays inside drawer');
    }
    await screenshot(page, `navigation-${page.viewportSize().width}`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Focus returns to trigger');
    await trigger.click();
    await dialog.getByRole('link', { name: 'Purchase Orders', exact: true }).click();
    await page.waitForURL('**/purchase-orders');
    await dialog.waitFor({ state: 'hidden' });
    await trigger.click();
    await page.setViewportSize({ width: 1100, height: 900 });
    await dialog.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 390, height: 844 });
  });
}

async function assertDarkContrast(page) {
  const issues = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        function color(value) {
          context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].map(channel => channel / 255);
        }
        function background(el) {
          const ancestors = []; for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
          return ancestors.reduce((result, node) => {
            const rgba = color(getComputedStyle(node).backgroundColor);
            return result.map((channel, index) => rgba[index] * rgba[3] + channel * (1 - rgba[3]));
          }, [1, 1, 1]);
        }
        const luminance = rgb => rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
          .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
        const issues = [];
        for (const el of document.querySelectorAll('.billing-surface input:not(:disabled),.billing-surface select,.billing-surface textarea,.billing-surface button:not(:disabled),.billing-invoice-record span,.billing-invoice-detail span,.billing-line-scroll > div > .grid:first-child > div,.billing-table th,dialog.billing-surface p,dialog.billing-surface td,dialog.billing-surface th')) {
          if (!el.getClientRects().length || ['checkbox', 'radio'].includes(el.type)) continue;
          const text = el.value || el.textContent.trim() || el.placeholder;
          if (!text) continue;
          const style = getComputedStyle(el), fg = color(style.color), bg = background(el);
          const fgLum = luminance(fg.slice(0, 3)), bgLum = luminance(bg);
          const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
          const icon = /^[+x]$/.test(text.trim());
          const large = Number.parseFloat(style.fontSize) >= 24
            || (Number.parseFloat(style.fontSize) >= 18.667 && Number.parseInt(style.fontWeight, 10) >= 700);
          const minimum = icon || large ? 3 : 4.5;
          if (ratio < minimum) issues.push({ text: text.slice(0, 80), element: el.tagName.toLowerCase(), foreground: style.color,
            background: bg.map(channel => Math.round(channel * 255)), contrast: Number(ratio.toFixed(2)), minimum });
        }
        return issues;
  });
  assert.ok(issues.length === 0, JSON.stringify(issues));
}

async function verifyPurchaseOrderDetails(page, record, dark = false) {
  const start = apiRequests.length;
  const endpoint = `/api/purchase-orders/${record.Id}`;
  const trigger = page.getByRole('button', { name: `View purchase order ${record.DocNumber}`, exact: true });
  const before = await page.getByPlaceholder('Auto', { exact: true }).inputValue();
  const urlBefore = page.url();
  const responsePromise = page.waitForResponse(response => response.url() === base + endpoint && response.request().method() === 'GET');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Purchase order details', exact: true });
  await dialog.waitFor();
  try {
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.json(), purchaseOrderDetails(record));
    await dialog.getByText(new RegExp(`Purchase Order.*#${record.DocNumber}`)).waitFor();
    await dialog.getByRole('heading', { name: record.VendorRef.name, exact: true }).waitFor();
    await dialog.getByRole('heading', { name: 'Line items', exact: true }).waitFor();
    const rows = dialog.locator('tbody tr');
    assert.equal(await rows.count(), 2);
    const money = value => '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    for (const [index, line] of purchaseOrderDetails(record).lineItems.entries()) {
      const cells = rows.nth(index).getByRole('cell');
      assert.match(await cells.nth(0).innerText(), new RegExp(line.description));
      assert.deepEqual(await cells.allTextContents().then(text => text.slice(1)),
        [String(Number(line.quantity)), money(line.unitCost), String(Number(line.receivedQty)), money(line.total)]);
    }
    await dialog.getByText(money(largeAmount), { exact: true }).first().waitFor();
    await dialog.getByText('Read-only QA purchase order.', { exact: true }).waitFor();
    await check(page, `PO detail ${record.DocNumber} ${dark ? 'dark' : 'light'}: date-only values`, async () => {
      const expectedDate = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      assert.equal(await dialog.getByText(expectedDate, { exact: true }).count(), 2,
        `Issue and expected date must both display ${expectedDate} for API date ${today}`);
    });
    assert.equal(await dialog.evaluate(el => el.matches(':modal')), true, 'Uses native modal dialog');
    assert.equal(await dialog.locator('button').first().evaluate(el => el === document.activeElement), true, 'Close control initially focused');
    assert.equal(await dialog.locator('input,textarea,select').count(), 0, 'Read-only detail has no editing controls');
    assert.equal(await dialog.locator('button').count(), 1, 'Only close, no write action in detail');
    const panel = dialog.locator('.overflow-y-auto').first();
    assert.equal(await panel.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }), true, 'Detail panel fits viewport');
    await screenshot(page, `po-detail-${record.Id}-${dark ? 'dark' : 'light'}-${page.viewportSize().width}`);
    await geometry(page, `PO detail ${record.DocNumber} ${dark ? 'dark' : 'light'}`);
    if (dark) await assertDarkContrast(page);
    assert.equal(page.url(), urlBefore, 'Opening details does not navigate away');
    assert.equal(apiRequests.slice(start).some(req => req.method !== 'GET'), false, 'Opening details makes no POST or other write');
    await check(page, `PO detail ${record.DocNumber} ${dark ? 'dark' : 'light'}: focus containment`, async () => {
      for (const key of ['Shift+Tab', 'Tab']) {
        await page.keyboard.press(key);
        await settled(page);
        const focus = await dialog.evaluate(el => ({ inside: el.contains(document.activeElement),
          tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), documentFocused: document.hasFocus() }));
        assert.ok(focus.inside, `${key}: ${JSON.stringify(focus)}`);
      }
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Tab remains within the modal');
    });
  } finally {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  }
  await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label,
    `View purchase order ${record.DocNumber}`, { timeout: 1500 });
  assert.equal(await page.getByPlaceholder('Auto', { exact: true }).inputValue(), before, 'Existing draft unchanged');
  return { endpoint, label: record.DocNumber, lineCount: 2, readOnly: true };
}

async function verifyPurchaseOrderFailure(page) {
  const start = apiRequests.length;
  const endpoint = '/api/purchase-orders/fixture-po';
  const trigger = page.getByRole('button', { name: `View purchase order ${purchaseOrder.DocNumber}`, exact: true });
  const dialog = page.getByRole('dialog', { name: 'Purchase order details', exact: true });
  fixtureFailures.set(endpoint, { status: 404, body: { error: 'Purchase order not found' } });
  try {
    const responsePromise = page.waitForResponse(response => response.url() === base + endpoint && response.request().method() === 'GET');
    await trigger.click();
    assert.equal((await responsePromise).status(), 404);
    await dialog.getByText('Failed to load: Purchase order not found', { exact: true }).waitFor();
    assert.equal(await dialog.locator('tbody tr').count(), 0, 'Failure does not display stale lines from the previous open');
    assert.equal(await dialog.getByText(purchaseOrder.VendorRef.name, { exact: true }).count(), 0);
    await screenshot(page, `po-detail-failure-${page.viewportSize().width}`);
    assert.equal(apiRequests.slice(start).some(req => req.method !== 'GET'), false, 'Failed read also makes no writes');
  } finally {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    fixtureFailures.delete(endpoint);
  }
  await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label,
    `View purchase order ${purchaseOrder.DocNumber}`, { timeout: 1500 });
}

async function darkMode(page, viewport) {
  await check(page, 'dark theme: production toggle and persisted preference', async () => {
    if (viewport.width < 640) await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark');
    await page.setViewportSize(viewport);
  });
  for (const [route, title, ready] of [
    ['/estimates?id=' + estimate.Id, 'Estimates', '.billing-recent button'],
    ['/invoices', 'Invoices', '.billing-invoice-record'],
    ['/payments', 'Payments', 'tbody tr'],
    ['/purchase-orders?estimateId=' + estimate.Id, 'Purchase Orders', '.billing-recent .text-right'],
  ]) {
    const slug = route.split('?')[0].slice(1);
    await check(page, `${slug} dark: populated render and contrast`, async () => {
      await visit(page, route, title);
      await page.locator(ready).first().waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      await screenshot(page, `${slug}-dark-${viewport.width}`);
      await assertDarkContrast(page);
    });
    await geometry(page, `${slug} dark`);
    if (slug === 'purchase-orders') {
      await check(page, 'purchase orders dark: read-only details and focus', () => verifyPurchaseOrderDetails(page, purchaseOrder, true));
    }
  }
}

try {
  const { chromium } = require(argument('playwright', '/Users/fireplace/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'));
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'America/Chicago', serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) { externalRequests.push({ url: url.href, method: route.request().method() }); await route.abort('blockedbyclient'); return; }
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    page.on('pageerror', error => errors.push({ width: viewport.width, route: page.url(), message: error.message }));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const entry = { width: viewport.width, route: page.url(), message: message.text(), location: message.location().url };
      const resource = entry.location ? new URL(entry.location, base) : null;
      if (resource?.origin === base && fixtureFailures.has(resource.pathname) && /^Failed to load resource:/.test(entry.message)) {
        expectedConsoleErrors.push(entry);
      } else consoleErrors.push(entry);
    });
    page.on('dialog', dialog => dialog.dismiss());
    await check(page, 'estimates: initial render', async () => {
      await visit(page, '/estimates', 'Estimates');
      await page.getByRole('button').filter({ hasText: estimate.DocNumber }).waitFor();
      const headers = page.locator('.billing-line-scroll [style*="--billing-table-head"] > :first-child');
      assert.ok(await headers.count() > 0);
      assert.equal(await headers.evaluateAll(elements => elements.every(el => getComputedStyle(el).paddingRight === '8px')), true, 'First header cell has the requested 8px separation');
      await screenshot(page, `estimates-${viewport.width}`);
    });
    await geometry(page, 'estimates initial');
    await check(page, 'estimates: customer search and real estimator handler', async () => {
      const start = apiRequests.length;
      const search = page.getByPlaceholder('Search customer', { exact: true });
      await search.fill('Example');
      await page.getByRole('button', { name: customer.displayName, exact: true }).click();
      await page.getByText(`Selected: ${customer.displayName}`, { exact: true }).waitFor();
      assert.ok(apiRequests.slice(start).some(req => req.path === '/api/customer-lookup' && new URLSearchParams(req.query).get('q') === 'Example'), 'Search handler requested the query');
      assert.equal(await page.getByRole('button').filter({ hasText: 'EST-QA-1002' }).count(), 0, 'Selected customer filters recent estimates');
      const prompt = 'Build a 42 Apex fireplace estimate with installation.';
      await page.getByPlaceholder(/^Example: build me a bid/).fill(prompt);
      const request = page.waitForRequest(req => req.url() === base + '/api/estimator/ai-generate' && req.method() === 'POST');
      await page.getByRole('button', { name: 'Generate Estimate', exact: true }).click();
      assert.deepEqual((await request).postDataJSON(), { prompt, customerName: customer.displayName });
      await page.getByText('Matched: 42 Apex', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('Part number', { exact: true }).count(), 2);
      assert.equal(await page.getByPlaceholder('Part number', { exact: true }).first().inputValue(), 'APEX-42');
      assert.equal(await page.locator('.billing-composer .billing-line-scroll .grid').nth(1).locator(':scope > :first-child').evaluate(el => getComputedStyle(el).paddingRight), '0px', 'Header padding does not affect body cells');
      await page.locator('.billing-composer .billing-totals').getByText('$25491.34', { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Add Line', exact: true }).click();
      assert.equal(await page.getByPlaceholder('Part number', { exact: true }).count(), 3);
      await page.getByRole('button', { name: 'Remove line', exact: true }).last().click();
      assert.equal(await page.getByPlaceholder('Part number', { exact: true }).count(), 2);
      await screenshot(page, `estimator-generated-${viewport.width}`);
      return { request: { prompt, customerName: customer.displayName }, total: 25491.34, response: 'fixture only' };
    });
    await geometry(page, 'estimator generated');
    await check(page, 'estimates: existing toolbar and edit controls', async () => {
      await page.getByRole('button').filter({ hasText: estimate.DocNumber }).click();
      await page.getByText('Estimate Total', { exact: true }).waitFor();
      for (const name of ['Send Estimate', 'Print', 'Download', 'Edit', 'P&L', 'Schedule', 'Convert to PO', 'Convert', 'Delete']) {
        const button = page.getByRole('button', { name, exact: true });
        await button.scrollIntoViewIfNeeded();
        assert.equal(await button.isVisible(), true, `${name} still present`);
        await button.click({ trial: true });
      }
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await screenshot(page, `estimate-selected-${viewport.width}`);
    });
    await geometry(page, 'estimate selected');
    await check(page, 'invoices: initial render', async () => {
      await visit(page, '/invoices', 'Invoices');
      await page.locator('.billing-invoice-list').getByText(invoice.invoiceNumber, { exact: true }).waitFor();
      await screenshot(page, `invoices-${viewport.width}`);
    });
    await geometry(page, 'invoices initial');
    await check(page, 'invoices: search, metric filter and selection', async () => {
      await page.getByRole('button').filter({ hasText: 'Paid Total' }).click();
      const list = page.locator('.billing-invoice-list');
      await list.getByText('INV-QA-1002', { exact: true }).waitFor();
      await list.getByText(invoice.invoiceNumber, { exact: true }).waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await page.getByPlaceholder('Search invoices...').fill(invoice.invoiceNumber);
      await page.waitForFunction(() => document.querySelectorAll('.billing-invoice-record').length === 1);
      await list.getByText(invoice.invoiceNumber, { exact: true }).click();
      const detail = page.locator('.billing-invoice-detail');
      await detail.getByRole('heading', { name: 'Invoice Details' }).waitFor();
      await detail.scrollIntoViewIfNeeded();
      assert.equal(await detail.getByText(invoice.invoiceNumber, { exact: true }).isVisible(), true);
      for (const name of ['Edit', 'P&L', 'Send Invoice', 'Print', 'Download', 'Create & Schedule Job', 'Pay Now (Square)', 'Record Check Payment', 'Void Invoice', 'Delete Invoice']) {
        await detail.getByRole('button', { name, exact: true }).click({ trial: true });
      }
      await detail.getByRole('heading', { name: 'Invoice Details' }).scrollIntoViewIfNeeded();
      await screenshot(page, `invoice-selected-${viewport.width}`);
    });
    await geometry(page, 'invoice selected');
    await check(page, 'payments: ledger, filters and invalid amount guard', async () => {
      await visit(page, '/payments', 'Payments');
      await page.getByRole('cell', { name: 'INV-QA-1001', exact: true }).waitFor();
      await screenshot(page, `payments-${viewport.width}`);
      const filter = page.getByPlaceholder(/^Search by customer or invoice/);
      await filter.fill('Second Fixture');
      assert.equal(await page.locator('tbody tr').count(), 1);
      await page.getByRole('cell', { name: 'INV-QA-1002', exact: true }).waitFor();
      await filter.fill('');
      await page.getByRole('button', { name: 'failed', exact: true }).click();
      await page.getByRole('cell', { name: 'INV-QA-1003', exact: true }).waitFor();
      assert.equal(await page.locator('tbody tr').count(), 1);
      await page.getByRole('button', { name: 'all', exact: true }).click();
      const start = apiRequests.length;
      await page.getByRole('button', { name: 'Send Payment Link Instead', exact: true }).click();
      await page.getByText('Enter an amount greater than 0.', { exact: true }).waitFor();
      assert.equal(apiRequests.slice(start).some(req => req.method !== 'GET'), false, 'Invalid amount never submits');
      await page.getByPlaceholder('0.00', { exact: true }).fill(String(largeAmount));
      assert.equal(await page.getByRole('button', { name: /^Charge Card/ }).isDisabled(), true, 'No Square SDK or credentials loaded');
    });
    await geometry(page, 'payments populated');
    await check(page, 'purchase orders: render and ship-to search', async () => {
      await visit(page, '/purchase-orders', 'Purchase Orders');
      await page.getByText(purchaseOrder.DocNumber, { exact: true }).waitFor();
      await screenshot(page, `purchase-orders-${viewport.width}`);
      await page.getByPlaceholder('Search customer or job', { exact: true }).fill('Example');
      await page.getByRole('button', { name: /^Example Hearth Customer/ }).click();
      assert.equal(await page.getByPlaceholder('Search customer or job', { exact: true }).inputValue(), customer.displayName);
      assert.match(await page.getByPlaceholder('Ship-to address', { exact: true }).inputValue(), /100 Example Street\nLot 5/);
    });
    await geometry(page, 'purchase orders populated');
    for (const record of [purchaseOrder, estimatePurchaseOrder]) {
      await check(page, `purchase orders: ${record.DocNumber} details, lines and focus`, () => verifyPurchaseOrderDetails(page, record));
    }
    await check(page, 'purchase orders: visible read failure and focus return', () => verifyPurchaseOrderFailure(page));
    await check(page, 'estimate to PO: real navigation and line prefill', async () => {
      await visit(page, '/estimates?id=' + estimate.Id, 'Estimates');
      await page.getByRole('button', { name: 'Convert to PO', exact: true }).click();
      await page.waitForURL('**/purchase-orders?estimateId=' + estimate.Id);
      await page.getByPlaceholder('Optional internal note').waitFor();
      await page.waitForFunction(doc => document.querySelector('input[placeholder="Optional internal note"]')?.value === `Copied from Estimate ${doc}`, estimate.DocNumber);
      assert.match(await page.getByPlaceholder('Description shown on the purchase order').first().inputValue(), /42 Apex/);
      assert.equal(await page.getByPlaceholder('Search customer or job').inputValue(), customer.displayName);
      await screenshot(page, `po-from-estimate-${viewport.width}`);
    });
    await geometry(page, 'PO from estimate');
    if (viewport.width < 1024) await drawer(page);
    await darkMode(page, viewport);
    await check(page, 'no unexpected external links or popups', async () => {
      assert.deepEqual(await page.evaluate(() => window.fixtureExternalAttempts), []);
    });
    await context.close();
  }
  const deniedEndpoints = ['/api/quickbooks/estimates', '/api/quickbooks/invoices', '/api/invoices', '/api/invoices/payments',
    '/api/purchase-orders', '/api/purchase-orders/fixture-po', '/api/square/payments', '/api/square/checkout', '/api/quickbooks/sync/estimates'];
  for (const endpoint of deniedEndpoints) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(base + endpoint, { method, headers: { 'X-Fixture-Safety-Probe': '1' } });
      assert.equal(response.status, 405, `${method} ${endpoint} must be denied`);
      await response.arrayBuffer();
    }
  }
  checks.push({ name: 'server denies provider/persistence mutations', ok: true, probes: deniedEndpoints.length * 4 });
  const unexpectedWrites = apiRequests.filter(req => !req.safetyProbe && req.method !== 'GET'
    && !['/api/estimator/learn', '/api/estimator/ai-generate'].includes(req.path));
  for (const [name, entries] of [['no unexpected UI writes', unexpectedWrites], ['all API reads explicitly configured', apiRequests.filter(req => req.disposition === 'unconfigured-api')],
    ['no external requests', externalRequests], ['no runtime errors', errors], ['no browser console errors', consoleErrors]]) {
    checks.push({ name, ok: entries.length === 0, entries });
  }
} catch (error) {
  checks.push({ name: 'harness execution', ok: false, error: error.stack });
} finally {
  if (browser) await browser.close();
  await closeServer();
  const report = { ok: checks.every(check => check.ok), mode: 'production-components-synthetic-http',
    base, viewports, provenance, checks, screenshots, apiRequests, errors, consoleErrors, expectedConsoleErrors, externalRequests,
    liveProviderAcceptance: false, limits: ['No real estimator server, provider SDK, persistence, or delivery exercised.',
      'CSS and production components are bundled once at startup; rerun after concurrent source edits.',
      'No screenshot baseline comparison: screenshots plus explicit geometry and interaction assertions.'] };
  const reportFile = path.join(output, 'report.json');
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, passed: checks.filter(check => check.ok).length,
    failed: checks.filter(check => !check.ok).map(({ name, width, error }) => ({ name, width, error })), reportFile, screenshots: screenshots.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
