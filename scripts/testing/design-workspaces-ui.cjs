#!/usr/bin/env node
'use strict';

// Real page components, synthetic HTTP only. No Next server, auth, DB or providers.
// Usage: WORKSPACE_SMOKE_VIEWS=todos,team OUTPUT=/tmp/hearth-audit node scripts/testing/design-workspaces-ui.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const requireApp = createRequire(path.join(root, 'package.json'));
const { build } = requireApp('esbuild');
const ts = requireApp('typescript');
const postcss = requireApp('postcss');
const tailwind = requireApp('@tailwindcss/postcss');
const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || '/Users/fireplace/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightModule);
const F = require('./design-workspaces-fixtures.cjs');
const output = path.resolve(process.env.OUTPUT || process.env.WORKSPACE_SMOKE_OUTPUT || '/tmp/hearth-workspaces-qa');
const outputAllowed = output !== root && !output.startsWith(root + path.sep);
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; });
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const ownedViews = ['todos', 'website-inbox', 'service-map', 'dispatch', 'meeks', 'inventory', 'vendors', 'vendors/[id]', 'expenses', 'reports', 'reports/ar-aging', 'reports/ap-aging', 'reports/sales-by-customer', 'reports/sales-by-item', 'reports/profit-by-job', 'reports/cash-flow', 'team', 'settings', 'integrations/quickbooks', 'admin', 'admin/time', 'admin/gabe-audit', 'admin/settings', 'admin/content', 'admin/integrations', 'gabe', 'tech', 'tech/expenses', 'tech/inbox', 'tech/manuals', 'tech/profile', 'tech/time-history', 'tech/estimate', 'tech/payments', 'tech/job/[jobId]', 'tech/gabe'];
const delegatedViews = {
  '': 'Parent core dashboard audit', schedule: 'Schedule owner / parent core audit', jobs: 'Parent core jobs audit',
  projects: 'scripts/testing/design-projects-customers-ui.mjs', customers: 'scripts/testing/design-projects-customers-ui.mjs', 'customers/[id]': 'scripts/testing/design-projects-customers-ui.mjs',
  invoices: 'scripts/testing/design-billing-ui.mjs', payments: 'scripts/testing/design-billing-ui.mjs', estimates: 'scripts/testing/design-billing-ui.mjs', 'purchase-orders': 'scripts/testing/design-billing-ui.mjs',
};
const excludedViews = new Set(['banking', 'pay', 'accept-estimate', 'sign-in/[[...sign-in]]', 'sign-up/[[...sign-up]]', 'tech/job/[jobId]/report']);
const asyncViews = new Set(['meeks', 'admin/settings', 'admin/content', 'admin/integrations']);
const slug = value => value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'home';
const routePath = view => '/' + view.replace('[id]', 'offline-vendor').replace('[jobId]', 'offline-job');
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { mode: 'actual-components-synthetic-http', startedAt: new Date().toISOString(), root, output, viewports, themes: ['light', 'dark'], checks: [], snapshots: [], requests: [], externalRequests: [], errors: [], consoleErrors: [], expectedConsoleErrors: [], coverage: [], sourceHashes: {}, liveProviderAcceptance: false, limits: [
  'Offline component rendering, not Next hydration, authentication, authorization or production end-to-end acceptance.',
  'Async admin reads use an in-memory organization adapter; server actions are never submitted. Meeks access is synthetic-approved.',
  'Tech uses the layout presentation wrapper but does not mount auth, GPS, runtime or PWA providers.',
  'All HTTP writes return 503, including trim preview and AI generation. No successful persistence, invitations, provider sync, payments or delivery are claimed.',
  'Maps retain real Leaflet geometry and controls but use blank synthetic tiles. No real location or map provider is contacted.',
  'Core and billing routes are inventoried but delegated, not passed by this audit. Screenshots are evidence, not pixel-baseline comparisons.',
  'The browser clock is fixed at 2026-09-09; source files are bundled once and must be rerun after concurrent edits.',
] };

async function routeInventory() {
  const entries = await fs.readdir(path.join(root, 'src/app'), { recursive: true });
  const routes = entries.filter(f => /(^|\/)page\.tsx$/.test(f)).map(f => f.replace(/\/?page\.tsx$/, '')).sort();
  const nav = ts.createSourceFile('navigation-model.ts', await fs.readFile(path.join(root, 'src/components/layout/navigation-model.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const hrefs = new Set();
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(nav) === 'href' && ts.isStringLiteral(node.initializer)) hrefs.add(node.initializer.text);
    ts.forEachChild(node, visit);
  }
  visit(nav);
  for (const view of routes) {
    const source = `src/app/${view ? view + '/' : ''}page.tsx`;
    const text = await fs.readFile(path.join(root, source), 'utf8');
    const classification = excludedViews.has(view) ? 'excluded' : view === 'tech/gabe' ? 'redirect' : asyncViews.has(view) ? 'async-server-component-adapted' : ownedViews.includes(view) ? (/^["']use client["']/.test(text) ? 'client-page' : 'static-server-component') : Object.hasOwn(delegatedViews, view) ? 'delegated' : 'UNCLASSIFIED';
    report.coverage.push({ route: '/' + view, source, sidebar: hrefs.has('/' + view), classification, owner: delegatedViews[view] || null, expectedRedirect: view === 'tech/gabe' ? '/tech' : null, rendered: false });
  }
  assert.equal(report.coverage.filter(r => r.classification === 'UNCLASSIFIED').length, 0, 'New route needs explicit classification');
  for (const href of hrefs) assert.ok(report.coverage.some(r => r.route === href), `Sidebar route has no page: ${href}`);
  for (const view of ownedViews) assert.ok(routes.includes(view), `Audit route no longer exists: ${view}`);
  return routes;
}

const adapters = {
  'next/navigation': `import {useMemo,useSyncExternalStore} from 'react';const subscribe=f=>{addEventListener('popstate',f);return()=>removeEventListener('popstate',f)};const current=()=>location.pathname+location.search;export function usePathname(){return useSyncExternalStore(subscribe,current,current).split('?')[0]}export function useSearchParams(){const value=useSyncExternalStore(subscribe,current,current);return useMemo(()=>new URLSearchParams(value.split('?')[1]||''),[value])}export const useParams=()=>({id:'offline-vendor',jobId:'offline-job'});const go=href=>location.assign(href);const router={push:go,replace:href=>location.replace(href),back:()=>history.back(),refresh:()=>location.reload()};export const useRouter=()=>router;export const redirect=href=>{location.replace(href);throw Error('Offline redirect '+href)};`,
  'next/link': `import React from 'react';export default function Link({href,prefetch,replace,children,...props}){return <a {...props} href={typeof href==='string'?href:href.pathname}>{children}</a>}`,
  '@clerk/nextjs': `export const useUser=()=>({isLoaded:true,isSignedIn:true,user:{id:'offline-user',fullName:'Synthetic Office Coordinator',firstName:'Synthetic',lastName:'Coordinator',primaryEmailAddress:{emailAddress:'office@example.test'}}});export const useAuth=()=>({isLoaded:true,isSignedIn:true,userId:'offline-user',signOut:()=>{throw Error('Auth disabled')}});export const useClerk=()=>({signOut:()=>{throw Error('Auth disabled')}});`,
  '@/lib/meeks-auth': `export const getMeeksPortalAccess=async()=>({ok:true});`,
  '@/lib/security/crm-access': `export const requireCrmAdmin=async()=>({orgId:'offline-org',userId:'offline-user'});`,
  '@/db': `export const organizations={id:'synthetic-id',settings:{}};export const db={select:()=>({from:()=>({where:()=>({limit:async()=>[${JSON.stringify(F.organization)}]})})}),update:()=>{throw Error('Synthetic DB writes prohibited')}};`,
  'drizzle-orm': `export const eq=()=>null;export const sql=()=>{throw Error('Synthetic SQL execution prohibited')};`,
  'next/cache': `export const revalidatePath=()=>{throw Error('Server action prohibited')};`,
  '@/lib/mapbox': `export const hasMapboxTiles=()=>false;export const mapboxProviderLabel=()=> 'Synthetic tiles';export const createTrackingTileLayer=L=>{const layer=L.gridLayer();layer.createTile=()=>{const tile=document.createElement('div');tile.style.background='#e8edf1';tile.style.border='1px solid #d6e1ec';return tile;};return layer;};`,
};

async function buildAssets() {
  const layout = await fs.readFile(path.join(root, 'src/app/layout.tsx'), 'utf8');
  assert.ok(layout.includes('import "./globals.css"'), 'Root layout must load globals');
  const imports = ownedViews.map((v, i) => `import P${i} from './src/app/${v}/page';`).join('\n');
  const registry = ownedViews.map((v, i) => `${JSON.stringify(routePath(v))}:{Page:P${i},async:${asyncViews.has(v)}}`).join(',');
  const bundle = await build({ absWorkingDir: root, stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import './src/app/production-workspaces.css';${imports}
    import MeeksPanel from './src/components/meeks/MeeksSchedulePanel';import OperationsStyles from './src/components/scheduling/OperationsStyles';
    const pages={${registry},'/meeks-embedded':{Page:()=> <main className="ops-production"><OperationsStyles/><MeeksPanel internal/></main>}};
    const params=Promise.resolve({id:'offline-vendor',jobId:'offline-job'});
    class Boundary extends React.Component{state={error:null};static getDerivedStateFromError(error){return{error:String(error)}}render(){return this.state.error?<pre data-audit-crash>{this.state.error}</pre>:this.props.children}}
    async function render(){const entry=pages[location.pathname];if(!entry)throw Error('Unregistered offline route '+location.pathname);const Page=entry.Page;let element=entry.async?await Page():<Page params={params}/>;if(location.pathname.startsWith('/tech'))element=<div className="production-tech min-h-screen" style={{background:'var(--color-bg)',color:'var(--color-text-primary)'}}><div className="max-w-md mx-auto min-h-screen flex flex-col">{element}</div></div>;createRoot(document.getElementById('root')).render(<Boundary><React.Suspense fallback={<p>Loading synthetic route...</p>}>{element}</React.Suspense></Boundary>);window.auditMounted=true;}render().catch(e=>{window.auditBootError=String(e);throw e});`, resolveDir: root, loader: 'tsx' }, outdir: path.join(output, 'bundle'), bundle: true, write: false, metafile: true, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.png': 'dataurl', '.woff2': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, plugins: [{ name: 'offline-boundaries-only', setup(builder) {
    builder.onResolve({ filter: /^(next\/|@clerk\/|@\/db|drizzle-orm|@\/lib\/(meeks-auth|security\/crm-access|mapbox))/ }, args => {
      if (adapters[args.path]) return { path: args.path, namespace: 'offline' };
      return { errors: [{ text: `Unapproved server/provider import: ${args.path}` }] };
    });
    builder.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: adapters[args.path], resolveDir: root, loader: 'tsx' }));
  } }] });
  for (const file of Object.keys(bundle.metafile.inputs).filter(f => f.startsWith('src/'))) {
    report.sourceHashes[file] = sha(await fs.readFile(path.join(root, file)));
    assert.ok(!/^src\/(db|app\/api)\//.test(file), `Forbidden production boundary bundled: ${file}`);
  }
  const globalsSource = await fs.readFile(path.join(root, 'src/app/globals.css'), 'utf8');
  report.sourceHashes['src/app/globals.css'] = sha(globalsSource);
  const globals = (await postcss([tailwind({ base: root })]).process(globalsSource, { from: path.join(root, 'src/app/globals.css') })).css;
  const modules = bundle.outputFiles.find(f => f.path.endsWith('.css'))?.text || '';
  // Only emulate next/font's local font faces/variables. Never patch production CSS.
  const fonts = '@font-face{font-family:OfflineGeist;src:url(/font.woff2);font-weight:100 900}@font-face{font-family:OfflineGeistMono;src:url(/mono.woff2);font-weight:100 900}:root{--font-geist-sans:OfflineGeist;--font-geist-mono:OfflineGeistMono}';
  report.css = { order: ['globals.css', 'page-and-component-modules.css', 'local-next-font-adapter.css'], sourceRootLayout: 'src/app/layout.tsx', globalsSha256: sha(globals), modulesSha256: sha(modules), presentationOverrides: false, nextRuntimeOrderVerified: false };
  report.checks.push({ name: 'root globals import and offline CSS order', ok: true, note: 'Models root-before-page imports; no Next runtime/network CSS ordering claim.' });
  return new Map([
    ['/fixture.js', ['application/javascript', bundle.outputFiles.find(f => f.path.endsWith('.js')).text]],
    ['/globals.css', ['text/css', globals]], ['/modules.css', ['text/css', modules]], ['/fonts.css', ['text/css', fonts]],
    ['/font.woff2', ['font/woff2', await fs.readFile(path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2'))]],
    ['/mono.woff2', ['font/woff2', await fs.readFile(path.join(root, 'node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2'))]],
  ]);
}

// This function is serialized into the browser. Inspect all visible page/dialog
// controls, not only nodes carrying pw-* classes. Real scrollers are clipped to
// their visible client area; wide tables are reported separately, not exempted wholesale.
function measurePage() {
  const selector = el => {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = []; let node = el;
    while (node && node.id !== 'root' && parts.length < 5) {
      const classes = [...node.classList].filter(c => /^[a-z][a-z0-9-]*$/i.test(c)).slice(0, 2);
      parts.unshift(node.tagName.toLowerCase() + classes.map(c => '.' + c).join('') + (node.parentElement ? `:nth-child(${[...node.parentElement.children].indexOf(node) + 1})` : ''));
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const visible = el => {
    const r = rect(el), s = getComputedStyle(el);
    if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p), pr = rect(p);
      if (ps.display === 'none' || ps.visibility === 'hidden') return false;
      if (/auto|scroll|hidden|clip/.test(ps.overflowX)) { left = Math.max(left, pr.left); right = Math.min(right, pr.right); }
      if (/auto|scroll|hidden|clip/.test(ps.overflowY)) { top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); }
    }
    return right > left + .5 && bottom > top + .5;
  };
  const tokenColor = (el, token) => {
    const probe = document.createElement('span'); probe.style.color = `var(${token})`; el.append(probe);
    const value = getComputedStyle(probe).color; probe.remove(); return value;
  };
  const contrast = (foreground, background) => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3 || (channels[3] !== undefined && channels[3] !== 1)) return null;
      const linear = channels.slice(0, 3).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    };
    const a = luminance(foreground), b = luminance(background);
    return a === null || b === null ? null : (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
  const overlays = [...document.querySelectorAll('dialog[open],#root .fixed')].filter(el => visible(el) && el.querySelector('h2,input,select,textarea') && rect(el).width >= innerWidth * .7);
  const activeOverlay = overlays.at(-1);
  const controls = [...document.querySelectorAll('#root button,#root input,#root select,#root textarea,#root h1,#root h2,#root h3,#root [role="tab"],#root .pw-tabs,#root .pw-toolbar,#root dialog,#root [role="dialog"],#root .pw-dialog')].filter(el => visible(el) && (!activeOverlay || activeOverlay.contains(el)));
  const geometry = [], typography = [], styleFailures = [], horizontalScrollers = [], selection = [];
  for (const el of controls) {
    const s = getComputedStyle(el), r = rect(el), name = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '').slice(0, 120);
    const info = { selector: selector(el), tag: el.tagName, name, bounds: r };
    let xScroller = null;
    for (let p = el.parentElement; p; p = p.parentElement) {
      // A bounded table/control scroller is legitimate; a page-wide main with
      // overflow:auto must not conceal a layout defect elsewhere on the page.
      if (p.matches('html,body,#root,main,.pw-workspace,.billing-main,.production-tech')) break;
      if (/auto|scroll/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 2) { xScroller = p; break; }
    }
    const inMap = el.closest('.leaflet-container');
    if ((r.left < -2 || r.right > innerWidth + 2) && !inMap) {
      const sr = xScroller && rect(xScroller);
      if (sr && sr.left >= -2 && sr.right <= innerWidth + 2) horizontalScrollers.push({ ...info, scroller: selector(xScroller), intentionalTable: Boolean(xScroller.querySelector('table')) });
      else geometry.push({ ...info, kind: 'viewport-horizontal-overflow' });
    }
    if (el.matches('dialog,[role="dialog"],.pw-dialog') && (r.top < -2 || r.bottom > innerHeight + 2)) geometry.push({ ...info, kind: 'dialog-outside-viewport' });
    if (el.matches('button') && el.scrollWidth > el.clientWidth + 3 && !/auto|scroll/.test(s.overflowX)) geometry.push({ ...info, kind: 'button-content-overflow', scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    if (inMap || el.closest('[data-production-shell],.hearth-sidebar,.hearth-mobile-nav,.hearth-mobile-dock')) continue;
    if (!el.matches('button,input,select,textarea,h1,h2,h3')) continue;
    const sample = { ...info, font: s.fontFamily, size: parseFloat(s.fontSize), weight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, radius: s.borderTopLeftRadius, background: s.backgroundColor, color: s.color, border: s.borderColor, disabled: Boolean(el.disabled) };
    typography.push(sample);
    const failures = [];
    if (!/OfflineGeist/.test(s.fontFamily)) failures.push('shared-font');
    if (s.letterSpacing !== 'normal' && Math.abs(parseFloat(s.letterSpacing)) > .01) failures.push('letter-spacing');
    if (el.matches('h1') && (sample.size < 20 || sample.size > (innerWidth < 768 ? 23 : 25))) failures.push('heading-size');
    if (el.matches('h2,h3') && (sample.size < 12 || sample.size > 20)) failures.push('section-heading-size');
    if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]),select,textarea')) {
      if (parseFloat(s.borderTopLeftRadius) !== 6) failures.push('input-radius-6px');
      const expected = innerWidth < 768 ? 16 : 14;
      if (sample.size !== expected) failures.push(`input-size-${expected}px`);
      if (r.height < 39) failures.push('input-height-40px');
      const surfaces = [tokenColor(el.parentElement, '--color-surface-1')], texts = [tokenColor(el.parentElement, '--color-text-primary')];
      // To-Do deliberately owns a slightly different neutral palette. Validate
      // its actual semantic tokens, not an arbitrary RGB equality to globals.
      if (el.closest('.pw-todos,.pw-todo-dialog')) { surfaces.push(tokenColor(el.parentElement, '--pw-todos-surface')); texts.push(tokenColor(el.parentElement, '--pw-todos-text')); }
      if (el.matches('.billing-expense-filters select')) texts.push(tokenColor(el.parentElement, '--color-text-secondary'));
      // These are the four intentional ExpenseStatus statusTone colors, not a
      // blanket exemption for arbitrary inline colors or other billing pages.
      if (el.closest('.billing-page') && el.matches('select') && el.querySelector('option[value="submitted"]')) texts.push('rgb(180, 83, 9)', 'rgb(21, 115, 71)', 'rgb(29, 78, 216)', 'rgb(180, 35, 24)');
      if (!surfaces.includes(s.backgroundColor)) failures.push('input-surface-token');
      if (!texts.includes(s.color)) failures.push('input-text-token');
      sample.contrast = contrast(s.color, s.backgroundColor);
      if (!el.disabled && sample.contrast !== null && sample.contrast < 4.5) failures.push('input-text-contrast-4.5');
    }
    if (el.matches('button') && name && !el.querySelector('h1,h2,h3')) {
      if (sample.size < 12 || sample.size > 16) failures.push('button-size');
      if (parseFloat(s.borderTopLeftRadius) > 8 && r.width > r.height * 1.5) failures.push('button-radius');
    }
    if (failures.length) styleFailures.push({ ...sample, failures });
  }
  for (const el of [...document.querySelectorAll('.pw-tabs > button[aria-pressed],.pw-segmented > button[aria-pressed],.hearth-nav-link[data-active="true"]')].filter(visible)) {
    const s = getComputedStyle(el), selected = el.getAttribute('aria-pressed') === 'true' || el.dataset.active === 'true';
    const sample = { selector: selector(el), text: el.innerText, selected, background: s.backgroundColor, color: s.color, weight: s.fontWeight, radius: s.borderTopLeftRadius };
    selection.push(sample);
    if (selected && el.closest('.pw-tabs') && (s.backgroundColor !== tokenColor(el.parentElement, '--pw-selected') || s.color !== tokenColor(el.parentElement, '--pw-selected-text'))) styleFailures.push({ ...sample, failures: ['selected-tab-tokens'] });
    if (selected && el.closest('.pw-segmented') && (s.backgroundColor !== tokenColor(el.parentElement, '--pw-surface') || s.color !== tokenColor(el.parentElement, '--pw-selected-text') || parseFloat(s.borderTopLeftRadius) !== 4)) styleFailures.push({ ...sample, failures: ['selected-segment-tokens'] });
    if (selected && el.matches('.hearth-nav-link') && (s.color !== tokenColor(el.parentElement, '--color-nav-active') || Number(s.fontWeight) < 600)) styleFailures.push({ ...sample, failures: ['selected-sidebar-pattern'] });
  }
  const scrollers = [...document.querySelectorAll('#root *')].filter(el => visible(el) && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2).map(el => ({ selector: selector(el), bounds: rect(el), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  return { documentOverflow: document.documentElement.scrollWidth > innerWidth + 2, geometry, typography, styleFailures, horizontalScrollers, selection, scrollers, headings: [...document.querySelectorAll('h1,h2')].filter(visible).map(el => el.innerText), bodyText: document.body.innerText.slice(0, 18000), crash: document.querySelector('[data-audit-crash]')?.textContent || window.auditBootError || null, fontsLoaded: document.fonts.check('14px OfflineGeist') };
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
  await page.evaluate(async () => {
    // Assert settled tokens, not interpolated colors during finite transitions.
    const transitions = document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(transitions.map(animation => animation.finished.catch(() => {})));
  });
}

async function capture(page, view, theme, state) {
  await page.waitForFunction(() => Boolean(document.documentElement));
  await page.evaluate(t => { localStorage.setItem('theme', t); document.documentElement.dataset.theme = t; }, theme);
  await settle(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, 'Screenshot theme must match its label');
  const metrics = await page.evaluate(measurePage);
  const width = page.viewportSize().width;
  const name = `${slug(view)}-${width}-${theme}-${slug(state)}`;
  const screenshot = path.join(output, name + '.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  const expectedPath = view === 'tech/gabe' ? '/tech' : routePath(view);
  const rootNode = page.locator('#root');
  const renderFailure = new URL(page.url()).pathname !== expectedPath || !await rootNode.count() || (await rootNode.textContent()).trim().length < 40;
  const ok = !renderFailure && !state.endsWith('-ERROR') && !metrics.crash && metrics.fontsLoaded && !metrics.documentOverflow && !metrics.geometry.length && !metrics.styleFailures.length;
  const record = { view, route: page.url().replace(report.base, ''), theme, actualTheme: await page.evaluate(() => document.documentElement.dataset.theme), width, height: page.viewportSize().height, state, screenshot, ok, renderFailure, ...metrics };
  report.snapshots.push(record);
  console.log(JSON.stringify({ view, width, theme, state, ok, geometry: metrics.geometry.length, styles: metrics.styleFailures.length, screenshot }));
  return record;
}

async function scrollEvidence(page, view, theme, state) {
  const moved = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('dialog[open],dialog[open] *,[role="dialog"],[role="dialog"] *,.pw-dialog,.pw-workspace,.billing-main,.production-tech main,.fixed *')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width && r.height && r.top < innerHeight && r.bottom > 0 && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 5;
    });
    const target = candidates.sort((a, b) => (b.closest('.fixed,dialog,[role="dialog"]') ? 1 : 0) - (a.closest('.fixed,dialog,[role="dialog"]') ? 1 : 0))[0];
    if (target) { target.scrollTop = target.scrollHeight - target.clientHeight; return true; }
    if (document.documentElement.scrollHeight > innerHeight + 5) { scrollTo(0, document.documentElement.scrollHeight); return true; }
    return false;
  });
  if (moved) await capture(page, view, theme, state + '-scrolled');
  await page.evaluate(() => { scrollTo(0, 0); document.querySelectorAll('#root *').forEach(el => { if (el.scrollTop) el.scrollTop = 0; }); });
}

async function scenario(page, view, theme, name, action) {
  try { await action(); await capture(page, view, theme, name); await scrollEvidence(page, view, theme, name); report.checks.push({ name: `${view}: ${name}`, theme, width: page.viewportSize().width, ok: true }); }
  catch (error) { report.checks.push({ name: `${view}: ${name}`, theme, width: page.viewportSize().width, ok: false, error: error.stack }); await capture(page, view, theme, name + '-ERROR').catch(() => {}); }
}

async function interactions(page, view, theme, controls) {
  const shot = (name, action) => scenario(page, view, theme, name, action);
  const button = name => page.getByRole('button', { name, exact: true });
  const reset = async () => { await page.goto(report.base + routePath(view)); await settle(page); await page.evaluate(t => { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); }, theme); };
  if (view === 'settings') {
    for (const name of ['Organization', 'Notifications', 'Billing', 'Integrations']) await shot('tab-' + name, async () => { await button(name).click(); assert.equal(await button(name).getAttribute('aria-pressed'), 'true'); });
  }
  if (view === 'todos') {
    await shot('create-populated', async () => {
      await page.getByRole('button', { name: /New Task/ }).click();
      await page.getByPlaceholder('Additional details...').fill(F.longNote);
      await page.getByPlaceholder('Search customer name...').fill('Synthetic');
      await page.getByRole('button', { name: new RegExp(F.customerName) }).click();
      await page.getByPlaceholder('billing, follow-up, urgent').fill('extended-installation, scheduling, inspection');
    });
  }
  if (view === 'team') {
    await shot('member-detail', async () => { await page.getByRole('heading', { name: F.techName, exact: true }).click(); await button('Close team member details').waitFor(); });
    await reset();
    await shot('add-member-populated', async () => {
      await page.getByRole('button', { name: /Add Team Member/ }).first().click();
      const fields = page.locator('.pw-dialog input');
      await fields.nth(0).fill(F.techName); await fields.nth(1).fill('alexandria.montgomery-wellington@example.test'); await fields.nth(2).fill('(555) 010-1234');
    });
  }
  if (view === 'inventory') {
    await shot('item-detail', async () => { await page.getByText(F.itemName, { exact: true }).first().click(); await page.getByRole('heading', { name: F.itemName, exact: true }).waitFor(); });
    await reset();
    await shot('price-audit', async () => { await page.getByRole('button', { name: /Price audit/i }).first().click(); await page.getByRole('heading', { name: 'Price audit', exact: true }).waitFor(); });
    await reset();
    await shot('trim-form', async () => { await page.getByRole('button', { name: /Trim inventory/i }).first().click(); await page.getByRole('heading', { name: 'Trim inventory', exact: true }).waitFor(); });
    await shot('trim-preview-denied', async () => { await page.getByText('Synthetic audit: writes are disabled (503).', { exact: true }).waitFor(); assert.equal(await button('Apply trim').isDisabled(), true); });
  }
  if (view === 'website-inbox') {
    await shot('request-detail', async () => { await page.getByRole('heading', { name: F.customerName, exact: true }).first().click(); await page.getByRole('dialog').waitFor(); });
    await reset(); controls.fail = '/api/website-inbox';
    await shot('read-failure', async () => { await page.reload(); await page.getByRole('alert').waitFor(); await button('Retry').waitFor(); });
    controls.fail = null;
    await shot('retry-recovered', async () => { await button('Retry').click(); await page.getByRole('heading', { name: F.customerName, exact: true }).first().waitFor(); await page.getByRole('alert').waitFor({ state: 'hidden' }); });
  }
  if (['reports/ar-aging', 'reports/ap-aging'].includes(view)) await shot('expanded-record', async () => {
    // The AR customer name is a real navigation link; expand using its row cell.
    const row = page.locator('tbody tr').filter({ hasText: view.endsWith('ar-aging') ? F.customerName : F.vendorName }).first();
    await row.locator('td').last().click();
    await page.getByText('QA-DOC-2026-0000', { exact: false }).first().waitFor();
  });
  if (view === 'reports/profit-by-job') await shot('profit-detail', async () => { await page.getByText('QA-INV-0909-0', { exact: false }).first().click(); await button('View invoice').waitFor(); });
  if (view === 'vendors/[id]') for (const name of ['Bills', 'Purchase Orders', 'Profile']) await shot('tab-' + name, async () => { await page.getByRole('button', { name: new RegExp('^' + name) }).click(); });
  if (view === 'admin/time') {
    for (const name of ['Weekly Approval', 'Edit Requests', 'Time Off']) await shot('tab-' + name, async () => { await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click(); });
  }
  if (view === 'integrations/quickbooks') {
    controls.disconnected = true;
    await shot('reconnect-state', async () => { await page.reload(); await page.getByRole('link', { name: 'Reconnect QuickBooks', exact: true }).waitFor(); });
    controls.disconnected = false;
  }
  if (view === 'tech/job/[jobId]') for (const name of ['Checklist', 'Photos', 'Customer']) await shot('tab-' + name, async () => { await page.getByRole('button', { name: new RegExp('^' + name, 'i') }).first().click(); });
  if (view === 'tech') {
    controls.fail = '/api/tech/me';
    await shot('read-failure', async () => { await page.reload(); await page.getByText('Synthetic audit: read unavailable (503).', { exact: true }).waitFor(); });
    controls.fail = null;
  }
}

async function main() {
  assert.ok(outputAllowed, 'Evidence OUTPUT must be outside the shared repository');
  await fs.mkdir(output, { recursive: true });
  await routeInventory();
  const requested = process.env.WORKSPACE_SMOKE_VIEWS?.split(',').map(v => v.trim().replace(/^\//, '')).filter(Boolean) || [...ownedViews, 'meeks-embedded'];
  for (const view of requested) assert.ok(ownedViews.includes(view) || view === 'meeks-embedded', `Unsupported view ${view}; delegated routes use their existing audits`);
  report.requested = requested;
  report.auditHashes = {};
  for (const file of [__filename, path.join(__dirname, 'design-workspaces-fixtures.cjs')]) report.auditHashes[path.relative(root, file)] = sha(await fs.readFile(file));
  const assets = await buildAssets();
  let server, browser;
  try {
    const paths = new Set([...ownedViews.map(routePath), '/meeks-embedded']);
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Synthetic audit: writes are disabled (503).' })); return; }
      // Even if interception fails, the local server never proxies an API.
      if (url.pathname.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'API requires browser synthetic interception' })); return; }
      const asset = assets.get(url.pathname);
      if (asset) { res.writeHead(200, { 'Content-Type': asset[0] }); res.end(asset[1]); return; }
      if (!paths.has(url.pathname)) { res.writeHead(404); res.end('Unregistered offline asset or route'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'" });
      res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic workspace audit</title><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/modules.css"><link rel="stylesheet" href="/fonts.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    report.base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    for (const view of requested) for (const viewport of viewports) for (const theme of ['light', 'dark']) {
      if (interrupted) throw new Error('Audit interrupted; partial evidence retained and server closed');
      const controls = { fail: null, disconnected: false };
      const context = await browser.newContext({ viewport, colorScheme: theme, locale: 'en-US', timezoneId: 'America/Chicago', serviceWorkers: 'block', permissions: [] });
      const info = { view, width: viewport.width, theme };
      try {
        await context.addInitScript(({ theme }) => {
          localStorage.setItem('theme', theme);
          const applyTheme = () => { if (document.documentElement) document.documentElement.dataset.theme = theme; };
          applyTheme(); document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
          window.auditDeniedActions = [];
          document.addEventListener('submit', event => { if (event.target.getAttribute('action')?.startsWith('javascript:')) { event.preventDefault(); event.stopImmediatePropagation(); window.auditDeniedActions.push('server-action'); } }, true);
          window.open = href => { window.auditDeniedActions.push('window.open:' + href); return null; };
          if (navigator.geolocation) { navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'Synthetic audit: geolocation disabled' }); navigator.geolocation.watchPosition = () => 0; }
        }, { theme });
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin !== report.base) { report.externalRequests.push({ ...info, url: req.url(), method: req.method(), disposition: 'blocked' }); await route.abort('blockedbyclient'); return; }
          if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(req.method())) {
            const answer = F.fixtureApi(req.method(), url, controls);
            report.requests.push({ ...info, method: req.method(), path: url.pathname, query: url.search, status: answer.status, disposition: answer.disposition });
            await route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) }); return;
          }
          await route.continue();
        });
        if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => { report.externalRequests.push({ ...info, url: socket.url(), disposition: 'blocked-websocket' }); socket.close(); });
        const page = await context.newPage();
        page.setDefaultTimeout(6000);
        await page.clock.setFixedTime(new Date('2026-09-09T15:00:00Z'));
        page.on('pageerror', error => report.errors.push({ ...info, message: error.message, stack: error.stack }));
        page.on('console', message => {
          if (message.type() !== 'error') return;
          const entry = { ...info, message: message.text(), location: message.location() };
          if (/503/.test(entry.message) && report.requests.some(r => r.view === view && r.theme === theme && r.width === viewport.width && r.status === 503)) report.expectedConsoleErrors.push(entry); else report.consoleErrors.push(entry);
        });
        await page.goto(report.base + routePath(view));
        if (view === 'tech/gabe') { await page.waitForURL(report.base + '/tech'); report.checks.push({ ...info, name: 'tech/gabe redirects to /tech', ok: true }); }
        await settle(page);
        await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
        assert.equal(await page.locator('link[rel=stylesheet]').evaluateAll(els => els.map(el => el.getAttribute('href')).join(',')), '/globals.css,/modules.css,/fonts.css');
        assert.ok((await page.locator('#root').innerText()).trim().length > 40, 'Actual page must render nonempty content');
        const entry = report.coverage.find(r => r.route === '/' + view); if (entry) entry.rendered = true;
        await capture(page, view, theme, 'initial');
        await scrollEvidence(page, view, theme, 'initial');
        await interactions(page, view, theme, controls);
      } catch (error) { report.checks.push({ ...info, name: 'route execution', ok: false, error: error.stack }); }
      finally { await context.close(); }
      await fs.writeFile(path.join(output, 'report.partial.json'), JSON.stringify(report, null, 2));
    }
    let denied = 0;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) for (const endpoint of ['/api/techs', '/api/inventory/trim', '/api/inventory/price-audit/apply', '/api/quickbooks/connect', '/api/time/payroll', '/admin/settings']) {
      const response = await fetch(report.base + endpoint, { method }); assert.equal(response.status, 503); await response.arrayBuffer(); denied++;
    }
    report.checks.push({ name: 'local server independently denies all mutation probes', ok: true, probes: denied });
  } finally {
    try { if (browser) await browser.close(); }
    finally {
      if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      report.serverClosed = !server?.listening;
    }
  }
  const drift = [];
  for (const [file, hash] of Object.entries(report.sourceHashes)) if (sha(await fs.readFile(path.join(root, file))) !== hash) drift.push(file);
  report.sourceChangedDuringRun = drift;
  for (const [name, entries] of [['no runtime errors', report.errors], ['no unexpected console errors', report.consoleErrors], ['no unconfigured API reads', report.requests.filter(r => r.disposition === 'unconfigured-read')], ['no external requests attempted', report.externalRequests], ['bundle sources unchanged during run', drift]]) report.checks.push({ name, ok: entries.length === 0, entries });
}

main().catch(error => { report.checks.push({ name: 'harness execution', ok: false, error: error.stack }); }).finally(async () => {
  if (!outputAllowed) { console.error('OUTPUT must be outside the repository; no files written.'); process.exitCode = 1; return; }
  report.finishedAt = new Date().toISOString();
  report.ok = report.snapshots.length > 0 && report.snapshots.every(r => r.ok) && report.checks.every(r => r.ok);
  report.summary = { snapshots: report.snapshots.length, failedSnapshots: report.snapshots.filter(r => !r.ok).length, checks: report.checks.length, failedChecks: report.checks.filter(r => !r.ok).length, renderedRoutes: report.coverage.filter(r => r.rendered).length, inventoriedRoutes: report.coverage.length, typographySamples: report.snapshots.reduce((n, r) => n + r.typography.length, 0) };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, 'route-coverage.json'), JSON.stringify(report.coverage, null, 2));
  const lines = ['# Offline Workspace Audit', '', `Result: ${report.ok ? 'PASS' : 'FAIL'}`, '', 'This is synthetic component presentation evidence, not live functionality acceptance.', '', '| View | Width | Theme | State | Result | Evidence |', '| --- | ---: | --- | --- | --- | --- |', ...report.snapshots.map(r => `| ${r.view} | ${r.width} | ${r.theme} | ${r.state} | ${r.ok ? 'PASS' : 'FAIL'} | [Screenshot](${path.basename(r.screenshot)}) |`), '', '## Failed Checks', ...report.checks.filter(r => !r.ok).map(r => `- ${r.name}: ${r.error || JSON.stringify(r.entries).slice(0, 1000)}`), '', '## Limitations', ...report.limits.map(s => '- ' + s)];
  await fs.writeFile(path.join(output, 'index.md'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ ok: report.ok, ...report.summary, serverClosed: report.serverClosed, report: path.join(output, 'report.json'), failedChecks: report.checks.filter(r => !r.ok).map(r => ({ name: r.name, view: r.view, error: r.error?.split('\n')[0] })) }, null, 2));
  process.exitCode = report.ok ? 0 : 1;
});
