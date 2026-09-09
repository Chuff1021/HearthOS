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

// Actual pages, synthetic GET responses, no Next server, env loading, or provider clients.
// PLAYWRIGHT_MODULE_PATH=/path/to/playwright node scripts/testing/design-projects-customers-ui.mjs
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const output = path.resolve(process.env.QUALITY_SCREENSHOT_DIR || '/tmp/hearthos-projects-customers-qa');
assert.ok(output !== root && !output.startsWith(root + path.sep), 'Keep QA output outside the source tree');
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 1000 }];
const ownedFiles = ['src/app/customers/page.tsx', 'src/app/customers/[id]/page.tsx',
  'src/app/jobs/page.tsx', 'src/app/projects/page.tsx', 'src/app/schedule/page.tsx',
  'src/components/scheduling/OperationsStyles.tsx'];
const hashes = async () => Object.fromEntries(await Promise.all(ownedFiles.map(async file =>
  [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])));
const initialHashes = await hashes();
const customerId = '11111111-1111-4111-8111-111111111111';
const customer = {
  id: customerId, qbCustomerId: 'SYNTHETIC-1001', displayName: 'Example Hearth Customer and Property Services',
  firstName: 'Example', lastName: 'Customer', companyName: 'Example Property Services',
  email: 'property-maintenance@example.invalid', phone: '555-0100', phoneAlt: '555-0101',
  addressLine1: '100 Example Street', addressLine2: 'Building 2, Suite 105', city: 'Test City', state: 'PA', zip: '17000',
  source: 'quickbooks', isActive: true, notes: 'Synthetic customer notes. Side entrance and equipment-room access required.', tags: [],
};
const detail = {
  customer,
  summary: { invoiceCount: 2, openInvoiceCount: 1, invoiceOpenBalance: 123456.78,
    invoiceTotalBilled: 223456.78, paymentCount: 1, totalReceived: 100000, lastActivity: '2026-09-08' },
  transactions: [
    { type: 'invoice', id: 'fixture-invoice-open', number: 'INV-QA-1001', date: '2026-01-01', status: 'sent', total: 123456.78, balance: 123456.78 },
    { type: 'invoice', id: 'fixture-invoice-paid', number: 'INV-QA-1002', date: '2026-09-08', status: 'paid', total: 100000, balance: 0 },
    { type: 'payment', id: 'fixture-payment', number: 'PAY-QA-1001', date: '2026-09-08', status: 'completed', total: 100000, balance: 0, paymentMethod: 'check' },
  ],
};
const stages = ['new', 'parts_needed', 'parts_ordered', 'ready', 'scheduled', 'complete', 'in_progress'];
const projects = stages.map((stage, index) => ({
  id: `fixture-project-${index}`, sourceType: index % 2 ? 'invoice' : 'estimate', sourceId: `fixture-source-${index}`,
  sourceNumber: `${index % 2 ? 'INV' : 'EST'}-QA-${1001 + index}`,
  sourceUrl: index % 2 ? `/invoices?id=fixture-source-${index}` : `/estimates?id=fixture-source-${index}`,
  customerId, customerName: index === 0 ? customer.displayName : `Example Project Customer ${index + 1}`,
  title: index === 0 ? 'Fireplace installation with venting and finished surround' : `Synthetic installation phase ${index + 1}`,
  stage, priority: index === 1 ? 'urgent' : 'normal', totalAmount: index === 0 ? 1234567 : 4500 + index * 350,
  targetDate: '2026-09-24', scheduledJobId: stage === 'scheduled' ? 'fixture-job' : null,
  partsStatus: ['not_ordered', 'backordered', 'partial', 'received', 'ordered', 'received', 'received'][index],
  partsOrderedAt: '2026-09-01', partsExpectedAt: '2026-09-15', partsReceivedAt: null,
  poNumber: index === 0 ? 'QA-PO-2026-LONG-REFERENCE-1001' : `QA-PO-${1001 + index}`,
  notes: 'Synthetic procurement notes. Confirm venting dimensions and finishing materials before scheduling.',
  parts: [{ id: 'fixture-part-1', sku: 'QA-VENT-42', name: 'Venting kit', quantity: 2,
    description: 'Venting assembly with wall pass-through and exterior termination' },
  { id: 'fixture-part-2', sku: 'QA-SURROUND', name: 'Surround', quantity: 1, description: 'Finishing surround, brushed metal' }],
  updatedAt: '2026-09-08T12:00:00Z',
}));
const fixtures = {
  '/api/quickbooks/status': { connected: true },
  '/api/dispatch': { techs: [], jobs: [], stats: { activeTechs: 0, onJob: 0, available: 0, offline: 0, unassigned: 0 } },
  '/api/techs': { techs: [] }, '/api/projects': { projects },
  '/api/invoices': { invoices: [{ id: 'fixture-source-1', invoiceNumber: 'INV-QA-1002', customerName: 'Example Invoice Customer',
    jobTitle: 'Synthetic invoiced installation', totalAmount: 4850, balance: 4850, issueDate: '2026-09-08' }] },
  '/api/estimates': { estimates: [
    { Id: 'fixture-source-0', DocNumber: 'EST-QA-1001', CustomerRef: { name: customer.displayName }, TotalAmt: 1234567,
      TxnDate: '2026-09-08', Line: [{ Description: projects[0].title }] },
    { Id: 'fixture-source-available', DocNumber: 'EST-QA-2001', CustomerRef: { name: 'Available Synthetic Estimate' },
      TotalAmt: 3500, TxnDate: '2026-09-08', Line: [{ Description: 'Synthetic estimate, not imported' }] },
  ] },
  [`/api/customers/${customerId}`]: detail,
};
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
  '@clerk/nextjs': `export const useUser=()=>({isLoaded:true,isSignedIn:true,user:{id:'fixture-user',fullName:'Synthetic Operator',firstName:'Synthetic',lastName:'Operator'}});
    export const useClerk=()=>({signOut:async()=>{}});`,
};
const apiRequests = [], blockedExternal = [], blockedBrowserWrites = [], errors = [], screenshots = [], checks = [], observations = [];
const minimumTextContrast = 4.5;
function luminance(channels) {
  return channels.slice(0, 3).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
let browser, server, deadline;

async function run() {
  await mkdir(output, { recursive: true });
  const bundle = await build({ absWorkingDir: root, stdin: { contents: `import React,{Suspense} from 'react';
    import{createRoot}from'react-dom/client';import{usePathname}from'next/navigation';
    import Projects from './src/app/projects/page';import Customer from './src/app/customers/[id]/page';
    const params=Promise.resolve({id:${JSON.stringify(customerId)}});
    function App(){const route=usePathname();return <Suspense fallback={<p>Loading synthetic preview...</p>}>{route==='/projects'?<Projects/>:
      route===${JSON.stringify(`/customers/${customerId}`)}?<Customer params={params}/>:<main><h1>Fixture destination</h1></main>}</Suspense>}
    createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, metafile: true, outdir: '/tmp/hearthos-projects-customers-bundle',
    platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY': '"fixture-only"' },
    plugins: [{ name: 'synthetic-identity-navigation', setup(builder) {
      builder.onResolve({ filter: /^(next\/(navigation|link)|@clerk\/nextjs)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: root }));
    } }],
  });
  assert.deepEqual(Object.keys(bundle.metafile.inputs).filter(file => /src\/(app\/api|db)\/|src\/lib\/(?:db|quickbooks\/client)/.test(file)), [], 'No backend in test bundle');
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = (await postcss([tailwind()]).process(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'),
    { from: path.join(root, 'src/app/globals.css') })).css;
  const moduleCss = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '';
  const fonts = '@font-face{font-family:QualityGeist;src:url(/fixture-font.woff2) format("woff2");font-weight:100 900;font-display:swap}:root{--font-geist-sans:QualityGeist;--font-geist-mono:monospace}';
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== 'GET') {
        apiRequests.push({ method: req.method, path: url.pathname, status: 405 });
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Read-only synthetic harness: writes denied' }));
      } else if (url.pathname.startsWith('/api/')) {
        const body = fixtures[url.pathname];
        apiRequests.push({ method: 'GET', path: url.pathname, status: body ? 200 : 503 });
        res.writeHead(body ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body || { error: 'No synthetic response configured; live fallback forbidden' }));
      } else if (url.pathname === '/fixture.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(js);
      } else if (url.pathname === '/fixture.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(css + '\n' + moduleCss + '\n' + fonts);
      } else if (url.pathname === '/fixture-font.woff2') {
        res.writeHead(200, { 'Content-Type': 'font/woff2' });
        res.end(await readFile(path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2')));
      } else if (/\.(png|jpg|webp|svg|ico)$/.test(url.pathname)) {
        const publicRoot = path.join(root, 'public');
        const file = path.resolve(publicRoot, '.' + url.pathname);
        assert.ok(file.startsWith(publicRoot + path.sep), 'Asset traversal denied');
        res.end(await readFile(file));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html',
          'Content-Security-Policy': "object-src 'none'; base-uri 'none'; form-action 'none'" });
        res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
      }
    } catch {
      res.writeHead(404); res.end('Synthetic asset unavailable');
    }
  });
  server.on('upgrade', (_req, socket) => socket.destroy());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Bounded synthetic Projects/customer-detail verification: ${base}`);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
    try {
      await context.addInitScript(value => localStorage.setItem('theme', value), theme);
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) { blockedExternal.push(url.origin); await route.abort(); return; }
        if (request.method() !== 'GET') {
          blockedBrowserWrites.push({ method: request.method(), path: url.pathname });
          await route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"Read-only synthetic harness"}' }); return;
        }
        await route.continue();
      });
      await context.routeWebSocket('**/*', socket => socket.close());
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      page.on('pageerror', error => errors.push(error.message));
      const capture = async name => {
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: document overflow`);
        const file = path.join(output, `${name}-${viewport.width}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: name === 'projects-board', animations: 'disabled' }); screenshots.push(file);
      };
      const setTheme = async () => {
        await page.evaluate(async value => {
          document.documentElement.setAttribute('data-theme', value);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        }, theme);
        assert.equal(await page.locator('.ops-production').first().evaluate(el => getComputedStyle(el).colorScheme), theme);
      };
      const inspectText = async (name, locator) => {
        const colors = await locator.evaluateAll(elements => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d');
          const rgba = value => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            return Array.from(context.getImageData(0, 0, 1, 1).data);
          };
          return elements.map(el => {
            let background = el;
            while (background.parentElement && rgba(getComputedStyle(background).backgroundColor)[3] === 0) background = background.parentElement;
            const color = getComputedStyle(el).color, backgroundColor = getComputedStyle(background).backgroundColor;
            return { text: el.textContent.trim().slice(0, 80), color, background: backgroundColor,
              foregroundRGBA: rgba(color), backgroundRGBA: rgba(backgroundColor) };
          });
        });
        assert.ok(colors.length > 0, `${name}: contrast target missing`);
        for (const color of colors) {
          assert.equal(color.foregroundRGBA[3], 255, `${name}: expected opaque text`);
          assert.equal(color.backgroundRGBA[3], 255, `${name}: expected opaque backing surface`);
          const foreground = luminance(color.foregroundRGBA), background = luminance(color.backgroundRGBA);
          color.contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        }
        observations.push({ name, width: viewport.width, theme, minimumRequired: minimumTextContrast, colors });
        for (const color of colors) assert.ok(color.contrast >= minimumTextContrast,
          `${name}: "${color.text}" at ${viewport.width}px ${theme} has ${color.contrast.toFixed(2)}:1 contrast; requires >=${minimumTextContrast}:1`);
      };

      await page.goto(base + '/projects');
      await page.locator('.ops-project-card').first().waitFor();
      await setTheme();
      assert.equal(await page.locator('.ops-project-column').count(), 6);
      assert.equal(await page.locator('.ops-project-card').count(), 7);
      await capture('projects-board');
      await inspectText('project-source-labels', page.locator('.ops-project-card > div:first-child > div:first-child > div:first-child'));
      await page.locator('.ops-source-tabs').getByRole('button', { name: 'Invoices', exact: true }).click();
      assert.match(await page.locator('.ops-source-button').first().innerText(), /INV-QA-1002/);
      assert.equal(await page.locator('.ops-source-button').first().isDisabled(), true);
      await page.locator('.ops-source-tabs').getByRole('button', { name: 'Estimates', exact: true }).click();
      assert.equal(await page.locator('.ops-source-button').count(), 2);
      const search = page.getByRole('textbox', { name: 'Search projects, customers, or purchase orders' });
      await search.fill('QA-PO-2026-LONG');
      assert.equal(await page.locator('.ops-project-card').count(), 1);
      await search.fill('NO-SYNTHETIC-MATCH');
      assert.equal(await page.locator('.ops-project-card').count(), 0);
      await search.fill('');
      const firstCard = page.locator('.ops-project-card').first();
      await firstCard.scrollIntoViewIfNeeded();
      await capture('projects-board-scrolled');
      await firstCard.click();
      const modal = page.locator('.ops-modal');
      await modal.waitFor();
      await capture('project-procurement');
      await inspectText('project-source-link', modal.getByRole('link', { name: 'Open source document', exact: true }));
      assert.equal(await modal.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), true, 'Project drawer fits viewport');
      const field = label => modal.locator('label').filter({ has: page.locator('span').filter({ hasText: new RegExp(`^${label}$`) }) }).locator('input, select, textarea');
      for (const label of ['Project title', 'Stage', 'Parts status', 'Ordered', 'Expected', 'Received', 'Target install date', 'PO / order number', 'Internal notes']) {
        assert.equal(await field(label).count(), 1, `Missing procurement field: ${label}`);
      }
      assert.equal(await field('Stage').locator('option').count(), 7);
      assert.equal(await field('Parts status').locator('option').count(), 6);
      assert.equal(await field('PO / order number').inputValue(), projects[0].poNumber);
      assert.match(await modal.locator('.ops-parts-list').innerText(), /QA-VENT-42/);
      await modal.getByLabel('Scheduled date', { exact: true }).scrollIntoViewIfNeeded();
      await capture('project-scheduling');
      await inspectText('project-scheduling-label', modal.locator('.ops-project-scheduling > div:first-child'));
      for (const name of ['Save Project', 'Complete', 'Remove', 'Create Job on Schedule']) {
        assert.equal(await modal.getByRole('button', { name, exact: true }).count(), 1);
      }
      await page.getByRole('button', { name: 'Close project', exact: true }).click();
      assert.equal(await modal.count(), 0);
      await page.locator('.ops-project-card').filter({ hasText: projects[4].title }).click();
      const scheduledLink = modal.getByRole('link', { name: 'View scheduled job', exact: true });
      await scheduledLink.scrollIntoViewIfNeeded();
      await capture('project-scheduled-link');
      await inspectText('project-scheduled-link', scheduledLink);
      await page.getByRole('button', { name: 'Close project', exact: true }).click();

      await page.goto(base + `/customers/${customerId}`);
      await page.getByRole('heading', { name: customer.displayName, exact: true }).waitFor();
      await setTheme();
      assert.equal(await page.locator('.ops-profile-table tbody tr').count(), 3);
      await capture('customer-transactions');
      const tabs = page.locator('.ops-profile-tabs');
      await tabs.getByRole('button', { name: /^Invoices/ }).click();
      assert.equal(await page.locator('.ops-profile-table tbody tr').count(), 2);
      await tabs.getByRole('button', { name: /^Payments/ }).click();
      assert.equal(await page.locator('.ops-profile-table tbody tr').count(), 1);
      await tabs.getByRole('button', { name: /^All transactions/ }).click();
      await page.locator('.ops-profile-table').evaluate(table => {
        table.closest('main').scrollTop = table.offsetTop;
        table.parentElement.scrollLeft = table.scrollWidth;
      });
      await capture('customer-transaction-balances');
      await tabs.getByRole('button', { name: 'Profile', exact: true }).click();
      await page.getByRole('heading', { name: 'Contact', exact: true }).scrollIntoViewIfNeeded();
      assert.match(await page.locator('main.ops-production').innerText(), /SYNTHETIC-1001/);
      assert.equal(await page.locator('main.ops-production a[href="mailto:property-maintenance@example.invalid"]').count(), 3);
      await capture('customer-profile');
      checks.push({ viewport, theme, boardStages: 6, projectRecords: 7, procurementFields: 9, sourceTabs: true,
        projectSearch: true, projectDrawerFits: true, customerTabs: true, pageOverflow: false, textContrastAtLeast: minimumTextContrast });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  assert.deepEqual(apiRequests.filter(request => request.status !== 200), [], 'No unexpected API endpoints or writes');
  assert.deepEqual(blockedBrowserWrites, [], 'Read-only UI checks must not initiate mutations');
  assert.deepEqual(blockedExternal, [], 'No external dependencies needed for page rendering');
  assert.deepEqual(await hashes(), initialHashes, 'Owned production source remains frozen');
}

let failure;
try {
  await Promise.race([run(), new Promise((_, reject) => {
    deadline = setTimeout(() => reject(new Error('Verification exceeded the 120-second bound')), 120000);
  })]);
} catch (error) { failure = error.message; process.exitCode = 1; }
finally {
  clearTimeout(deadline);
  await browser?.close();
  server?.closeAllConnections();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  const report = { ok: !failure, failure, mode: 'actual-components-synthetic-read-only', viewports,
    checks, screenshots, observations, apiRequests, blockedExternal, blockedBrowserWrites, consoleErrors: errors,
    textContrastThreshold: minimumTextContrast,
    productionSourceUnchanged: JSON.stringify(await hashes()) === JSON.stringify(initialHashes),
    externalRequestsAllowed: false, providerWritesAllowed: false, liveProviderAcceptance: false };
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, apiRequests: apiRequests.length, observations: observations.length }, null, 2));
}
