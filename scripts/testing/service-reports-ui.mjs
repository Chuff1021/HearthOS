import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// No Next server, environment loading, provider clients, or production API execution.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const bundledModules = path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(bundledModules, 'playwright'))); }
const output = await mkdtemp(path.join(tmpdir(), 'service-report-ui-'));
const report = {
  ok: false, mode: 'actual-components-synthetic-http', output,
  checks: [], failures: [], screenshots: [], requests: [], console: [], pageErrors: [],
  unexpectedNetwork: [], serverErrors: [], sourceChanges: [],
  coverage: [
    '390x844 and 1440x1000: gas, wood, pellet create/prefill; no default satisfactory conditions.',
    'Failed save retains local text without changing stored draft; explicit retry persists it.',
    'Required fields, invalid calendar service dates, short photo exceptions, NI explanations, and D evidence block finalization.',
    'Actual Camera and Gallery filechooser events; capture attribute, JPEG compression, caption and correct slot.',
    'Explicit finalize confirmation, read-only saved result, unchanged job status, PDF route and persisted history.',
    'Recipient confirmation/cancel/edit, one explicit synthetic email, provider acceptance wording.',
    'Owner/admin-only explicit synthetic storage diagnostic; ordinary technician fixture cannot invoke it.',
    'Actual technician checklist Add Photo with mounted refs; object/string synthetic rows use the production legacy decoder; atomic append preserves existing and concurrent photos.',
    'Source SHA-256 manifest, denied unexpected network, browser console, responsive screenshots, server cleanup.',
  ],
  limitations: [
    'Synthetic HTTP only: no database, authentication, object storage, real PDF generation, or email delivery acceptance.',
    'Desktop Chromium emulates 390px and 1440px; native iOS camera/HEIC and operating-system permissions are not exercised.',
    'No agent-browser CLI found on the execution host; Playwright captures browser console and filechooser events.',
    'The production domain validator is reused, so independent domain correctness belongs to the domain test suite.',
    'Light theme only; this is not exhaustive accessibility, visual-diff, or cross-browser coverage.',
  ],
};

async function hashes() {
  const result = {};
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) result[path.relative(root, file)] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
  }
  await walk(path.join(root, 'src'));
  return result;
}

// A missing UI is awaited, never replaced by a sidecar implementation.
for (let attempt = 0; ; attempt++) {
  try { await access(path.join(root, 'src/components/service-reports/ServiceReportEditor.tsx')); break; }
  catch { assert.ok(attempt < 60, 'UI owner has not created ServiceReportEditor.tsx after two minutes'); await delay(2000); }
}
const before = await hashes();
const adapters = {
  'next/navigation': `export const useParams=()=>({jobId:'22222222-2222-4222-8222-222222222222'});`,
  'next/link': `import React from 'react';export default function Link({children,href,prefetch,replace,...props}){return <a {...props} href={href}>{children}</a>}`,
};
const bundle = await build({
  absWorkingDir: root, entryPoints: ['tests/fixtures/service-reports-ui.tsx'],
  bundle: true, write: false, outdir: '/tmp/service-report-ui-bundle', platform: 'browser',
  format: 'iife', jsx: 'automatic', metafile: true, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'service-report-local-routing', setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'service-report' }));
    builder.onLoad({ filter: /.*/, namespace: 'service-report' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: root }));
  } }],
});
assert.ok(!Object.keys(bundle.metafile.inputs).some(file => /(?:src\/app\/api\/|service-reports\/(?:server|store|storage)\.)/.test(file)), 'Production server modules must never enter the fixture');
const domainBundle = await build({
  absWorkingDir: root, stdin: { contents: `export {validateReport} from './src/lib/service-reports/domain';export {getServiceTemplate} from './src/lib/service-reports/templates';export {getChecklistTemplate,inferChecklistTemplateId} from './src/lib/job-checklists';export {decodeLegacyJob} from './src/lib/service-reports/legacy-photos';`, resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { validateReport, getServiceTemplate, getChecklistTemplate, inferChecklistTemplateId, decodeLegacyJob } = await import(`data:text/javascript;base64,${Buffer.from(domainBundle.outputFiles[0].text).toString('base64')}`);
const css = (await postcss([tailwind()]).process(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const moduleCss = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '';
const font = await readFile(path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2'));
const fixtureCss = `${css}\n${moduleCss}\n@font-face{font-family:ServiceReportFixture;src:url(/fixture-font.woff2) format("woff2");font-weight:100 900;font-display:swap}:root{--font-geist-sans:ServiceReportFixture;--font-geist-mono:monospace}`;
const contextData = {
  jobId: '22222222-2222-4222-8222-222222222222', jobNumber: 'SYNTHETIC-100',
  customerId: '11111111-1111-4111-8111-111111111111', customerName: 'Synthetic Hearth Customer',
  address: '100 Example Street, Test City', serviceDate: '2026-09-10', equipment: 'Synthetic appliance',
  technicianName: 'Synthetic Technician', technicianId: 'fixture-tech', suggestedFuel: 'gas', email: 'customer@example.invalid',
};
const timestamp = '2026-09-10T15:00:00.000Z';
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const cases = new Map();
const clone = value => structuredClone(value);
function newState() {
  return {
    reports: [], uploads: [], emails: [], operations: [], photoBytes: new Map(), failNextSave: false, canVerifyStorage: false, legacyPayloadForm: 'object',
    storageResponse: { upload: true, download: true, integrity: true, syntheticObjectRemoved: true },
    job: {
      id: contextData.jobId, jobNumber: contextData.jobNumber, customerId: contextData.customerId,
      customerName: contextData.customerName, propertyAddress: contextData.address,
      title: 'Gas service', jobType: 'service', status: 'in_progress',
      fireplaceUnit: { type: 'gas', nickname: 'Synthetic appliance', model: 'Synthetic model' },
      scheduledDate: '2026-09-10', scheduledTimeStart: '09:00', notes: 'Synthetic test record', photos: [], checklistItems: {},
    },
  };
}
const prefix = '/api/tech/service-reports';
let base;
function reply(res, status, body, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(contentType === 'application/json' ? JSON.stringify(body) : body);
}
async function handler(req, res) {
  const url = new URL(req.url, base);
  const caseId = /(?:^|;\s*)service-report-case=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const state = cases.get(caseId);
  if (req.method === 'GET' && url.pathname === '/fixture.js') return reply(res, 200, js, 'application/javascript');
  if (req.method === 'GET' && url.pathname === '/fixture.css') return reply(res, 200, fixtureCss, 'text/css');
  if (req.method === 'GET' && url.pathname === '/fixture-font.woff2') return reply(res, 200, font, 'font/woff2');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === `/tech/job/${contextData.jobId}`)) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-src 'self'");
    return reply(res, 200, '<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic service report verification</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>', 'text/html');
  }
  const unknown = () => {
    report.unexpectedNetwork.push({ caseId, method: req.method, path: url.pathname });
    reply(res, 501, { error: 'Unconfigured synthetic endpoint' });
  };
  if (!state) return unknown();
  report.requests.push({ caseId, method: req.method, path: url.pathname });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const body = req.headers['content-type']?.includes('application/json') ? JSON.parse(bytes.toString()) : {};
  if (url.pathname === '/api/jobs') {
    if (req.method === 'GET') {
      assert.equal(url.searchParams.get('id'), contextData.jobId);
      const job = decodeLegacyJob(state.legacyPayloadForm === 'string' ? JSON.stringify(state.job) : clone(state.job));
      assert.deepEqual(job, state.job, 'Object and JSON-string rows produce the same canonical API job');
      return reply(res, 200, { jobs: [job] });
    }
    return unknown();
  }
  if (url.pathname === '/api/tech/job-photos' && req.method === 'POST') {
    assert.equal(body.jobId, contextData.jobId);
    assert.deepEqual(Object.keys(body).sort(), ['jobId', 'photos']);
    assert.ok(Array.isArray(body.photos) && body.photos.length > 0 && body.photos.length <= 10);
    assert.equal(body.photos.length, 1, 'Legacy picker must append only the new selection, not replace the photo list');
    const job = decodeLegacyJob(state.legacyPayloadForm === 'string' ? JSON.stringify(state.job) : clone(state.job));
    assert.ok(job, 'Production legacy decoder accepts this synthetic stored representation');
    for (const photo of body.photos) {
      assert.match(photo.uri, /^data:image\/jpeg;base64,/);
      if (!job.photos.some(existing => existing.uri === photo.uri && existing.checklistItemId === photo.checklistItemId)) job.photos.push(photo);
    }
    state.job = job;
    state.operations.push('legacy-photo');
    return reply(res, 200, { job: state.job });
  }
  if (url.pathname === prefix) {
    if (req.method === 'GET') {
      assert.equal(url.searchParams.get('jobId'), contextData.jobId);
      return reply(res, 200, { reports: state.reports, context: { ...contextData, canVerifyStorage: state.canVerifyStorage } });
    }
    if (req.method === 'POST' && !body.action) {
      assert.equal(body.jobId, contextData.jobId);
      assert.ok(['gas', 'wood', 'pellet'].includes(body.fuel));
      const record = {
        id: `synthetic-report-${state.reports.length + 1}`, jobId: body.jobId, customerId: contextData.customerId,
        revision: 1, status: 'draft', createdAt: timestamp, updatedAt: timestamp,
        data: { fuel: body.fuel, answers: {}, photoExceptions: {}, customerAcknowledgment: '' }, photos: [],
      };
      state.reports.unshift(record); state.operations.push('create');
      return reply(res, 201, { report: record });
    }
    if (req.method === 'POST' && body.action === 'check-storage') {
      assert.equal(state.canVerifyStorage, true, 'Ordinary technician cannot run the storage diagnostic');
      assert.deepEqual(body, { action: 'check-storage' });
      state.operations.push('check-storage');
      await delay(150);
      return reply(res, 200, state.storageResponse);
    }
    const record = state.reports.find(item => item.id === body.id);
    assert.ok(record, 'Mutation must identify an existing synthetic report');
    if (req.method === 'PUT') {
      assert.equal(record.status, 'draft'); assert.equal(body.revision, record.revision);
      if (state.failNextSave) { state.failNextSave = false; state.operations.push('save-failed'); return reply(res, 503, { error: 'Synthetic save failure; draft was not persisted' }); }
      record.data = clone(body.data); record.revision++; state.operations.push('save');
      return reply(res, 200, { report: record });
    }
    if (req.method === 'POST' && body.action === 'finalize') {
      assert.equal(record.status, 'draft'); assert.equal(body.revision, record.revision);
      const errors = validateReport(record.data, record.photos);
      if (errors.length) return reply(res, 422, { error: 'Synthetic validation refused finalization', errors });
      Object.assign(record, { status: 'finalized', revision: record.revision + 1, technicianName: contextData.technicianName, finalizedAt: timestamp });
      state.operations.push('finalize'); return reply(res, 200, { report: record });
    }
    if (req.method === 'POST' && body.action === 'email') {
      assert.equal(record.status, 'finalized'); assert.match(body.email, /@example\.invalid$/); assert.ok(body.actionId);
      state.emails.push(clone(body)); record.emailStatus = 'accepted'; state.operations.push('email');
      return reply(res, 200, { status: 'accepted' });
    }
    return unknown();
  }
  const match = /^\/api\/tech\/service-reports\/([^/]+)\/(photos|pdf)(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) return unknown();
  const record = state.reports.find(item => item.id === match[1]);
  assert.ok(record);
  if (match[2] === 'pdf' && req.method === 'GET') {
    assert.equal(record.status, 'finalized');
    // Only verifies the link target and authenticated route, not the production PDF renderer.
    return reply(res, 200, '%PDF-1.4\n% Synthetic route response only\n%%EOF', 'application/pdf');
  }
  if (match[2] === 'photos' && req.method === 'POST' && !match[3]) {
    assert.equal(record.status, 'draft');
    const form = await new Request(base, { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: bytes }).formData();
    assert.equal(Number(form.get('revision')), record.revision);
    const slotId = form.get('slotId'), file = form.get('file'), caption = form.get('caption');
    assert.ok(getServiceTemplate(record.data.fuel).photoSlots.some(slot => slot.id === slotId));
    assert.equal(file.type, 'image/jpeg'); assert.ok(file.size > 0 && file.size <= 350_000);
    const photo = { id: `photo-${record.photos.length + 1}`, slotId, caption };
    record.photos.push(photo); record.revision++;
    state.photoBytes.set(photo.id, Buffer.from(await file.arrayBuffer()));
    state.uploads.push({ ...photo, size: file.size, type: file.type }); state.operations.push('photo');
    return reply(res, 201, { report: record });
  }
  if (match[2] === 'photos' && req.method === 'GET' && state.photoBytes.has(match[3])) return reply(res, 200, state.photoBytes.get(match[3]), 'image/jpeg');
  return unknown();
}
const server = createServer((req, res) => { void handler(req, res).catch(error => {
  report.serverErrors.push(error.stack); if (!res.headersSent) reply(res, 500, { error: 'Synthetic handler assertion failed' }); else res.end();
}); });
let browser;
const shot = async (page, name) => {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file }); report.screenshots.push(file);
};
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fieldControl = (page, field) => page.locator('label').filter({
  has: page.locator('span').filter({ hasText: new RegExp(`^${escape(field.label)}\\s*\\*?$`) }),
}).locator(':scope > input, :scope > textarea, :scope > select');
async function expandSections(page, template) {
  for (const section of template.sections) {
    const summary = page.locator('summary').filter({ hasText: new RegExp(`^${escape(section.title)}$`) });
    if (!(await summary.evaluate(element => element.parentElement.open))) await summary.click();
  }
}
async function checkDialog(dialog) {
  assert.equal(await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = getComputedStyle(element).backgroundColor; context.fillRect(0, 0, 1, 1);
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && context.getImageData(0, 0, 1, 1).data[3] === 255;
  }), true, 'Confirmation dialog fits viewport and has an opaque background');
}
async function checkOverflow(page) {
  const overflow = await page.locator('input:not([type=file]), textarea, select, button').evaluateAll(elements => elements.filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
  }).map(element => ({ text: element.getAttribute('aria-label') || element.textContent.slice(0, 100), rect: element.getBoundingClientRect().toJSON() })));
  assert.deepEqual(overflow, [], 'Fields and controls stay inside the viewport');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow');
}
const photoSection = (page, slot) => page.getByRole('region', { name: 'Report photos', exact: true }).locator(':scope > div').filter({ has: page.getByRole('button', { name: `Camera: ${slot.label}`, exact: true }) });
function validAnswers(template) {
  const answers = {};
  for (const field of template.sections.flatMap(section => section.fields)) {
    if (field.required) answers[field.id] = field.type === 'condition' ? 'S' : field.options?.[0] || 'Synthetic recorded observation';
  }
  Object.assign(answers, { serviceDate: contextData.serviceDate, acknowledgmentStatus: 'Unavailable', acknowledgmentDelivery: 'Synthetic email handoff on 2026-09-10' });
  if (template.id === 'wood') Object.assign(answers, { totalFlues: '1', scan: 'Not performed', scanReason: 'Synthetic Level 1 scope; no internal scan requested' });
  return answers;
}
async function scenario(name, width, work) {
  const state = newState(); cases.set(name, state);
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, serviceWorkers: 'block', timezoneId: 'America/Chicago' });
  await context.addCookies([{ name: 'service-report-case', value: name, url: base }]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { report.unexpectedNetwork.push({ caseId: name, url: url.href }); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => report.pageErrors.push({ caseId: name, error: error.message }));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) report.console.push({ caseId: name, type: message.type(), text: message.text(), location: message.location() }); });
  try { await work(page, state); report.checks.push({ name, width, passed: true }); console.log(`PASS ${name}`); }
  catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    report.failures.push({ name, error: error.stack });
    await shot(page, `${name}-failure`).catch(() => {});
    await writeFile(path.join(output, `${name}-failure.txt`), await page.locator('body').innerText().catch(() => 'Page unavailable'));
  } finally { await context.close(); cases.delete(name); }
}

async function editorFlow(page, state, fuel, width) {
  const name = `${fuel}-${width}`, template = getServiceTemplate(fuel);
  const fields = template.sections.flatMap(section => section.fields);
  await page.goto(base);
  await page.getByRole('radio', { name: fuel, exact: true }).check();
  assert.equal(await page.getByRole('button', { name: 'Check report file connection', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await page.getByRole('heading', { name: template.title, exact: true }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const finalize = page.getByRole('button', { name: 'Review and finalize', exact: true });
  assert.equal(await finalize.isDisabled(), true, 'Empty report must block finalization');
  assert.equal(state.reports[0].data.fuel, fuel);
  assert.equal(state.operations.filter(op => op === 'create').length, 1);
  for (const field of fields.filter(field => field.type === 'condition')) assert.equal(await fieldControl(page, field).inputValue(), '', 'No condition defaults to satisfactory');
  assert.equal(await fieldControl(page, fields.find(field => field.id === 'customerName')).inputValue(), contextData.customerName);
  await shot(page, `${name}-created`);
  await expandSections(page, template);

  const work = fields.find(field => field.id === 'workCompleted');
  const retained = `Synthetic ${fuel} draft survives failed save`;
  await fieldControl(page, work).fill(retained);
  state.failNextSave = true;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic save failure' }).waitFor();
  assert.equal(await fieldControl(page, work).inputValue(), retained);
  assert.equal(state.reports[0].data.answers.workCompleted, undefined, 'Failed write cannot mutate synthetic stored data');
  await fieldControl(page, work).scrollIntoViewIfNeeded();
  await shot(page, `${name}-save-error-retains-draft`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Report saved.', { exact: true }).waitFor();
  assert.equal(state.reports[0].data.answers.workCompleted, retained);

  const answers = { ...validAnswers(template), workCompleted: retained };
  for (const [id, answer] of Object.entries(answers)) {
    const field = fields.find(field => field.id === id);
    assert.ok(field, `Template field ${id} exists`);
    if (field.options) await fieldControl(page, field).selectOption(answer);
    else await fieldControl(page, field).fill(answer);
  }
  await page.getByLabel(/^Customer acknowledgment: receipt,/).fill('Customer unavailable; synthetic handoff recorded for test only.');
  assert.equal(await finalize.isDisabled(), true, 'Missing photo evidence still blocks a complete form');

  for (const [index, picker] of ['Camera', 'Gallery'].entries()) {
    const slot = template.photoSlots[index], section = photoSection(page, slot);
    const caption = `Synthetic ${fuel} ${slot.id} ${picker}`;
    await section.getByLabel('Caption', { exact: true }).fill(caption);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: `${picker}: ${slot.label}`, exact: true }).click();
    const chooser = await chooserPromise;
    assert.equal(await chooser.element().getAttribute('capture'), picker === 'Camera' ? 'environment' : null);
    await chooser.setFiles({ name: `${slot.id}.png`, mimeType: 'image/png', buffer: imageBytes });
    await section.getByRole('img', { name: caption, exact: true }).waitFor();
    assert.equal(state.uploads.at(-1).slotId, slot.id, `${picker} must upload to the clicked slot`);
    assert.equal(state.uploads.at(-1).caption, caption);
    assert.equal(await chooser.element().inputValue(), '', 'Picker resets after a selection');
    assert.equal(await section.getByRole('img', { name: caption, exact: true }).evaluate(img => img.complete && img.naturalWidth > 0), true);
    await section.scrollIntoViewIfNeeded();
    await shot(page, `${name}-${picker.toLowerCase()}-correct-slot`);
  }
  for (const slot of template.photoSlots.filter(slot => slot.required && !state.reports[0].photos.some(photo => photo.slotId === slot.id))) {
    await photoSection(page, slot).getByLabel(/^Exception reason/).fill('Synthetic evidence exception: access unavailable during test.');
  }
  assert.equal(await finalize.isEnabled(), true, 'Required answers, photos, and documented exceptions unblock finalization');
  const exceptionSlot = template.photoSlots.find(slot => slot.required && !state.reports[0].photos.some(photo => photo.slotId === slot.id));
  const exception = photoSection(page, exceptionSlot).getByLabel(/^Exception reason/);
  await exception.fill('short');
  assert.equal(await finalize.isDisabled(), true, 'Short photo exceptions must be rejected');
  await exception.fill('Synthetic evidence exception restored with sufficient detail.');
  await fieldControl(page, work).fill('');
  assert.equal(await finalize.isDisabled(), true, 'Removing a required field blocks finalization');
  await fieldControl(page, work).fill(retained);

  const serviceDate = fields.find(field => field.id === 'serviceDate');
  await fieldControl(page, serviceDate).fill('2026-02-30');
  assert.equal(await finalize.isDisabled(), true, 'Impossible calendar date blocks finalization');
  await fieldControl(page, serviceDate).fill(contextData.serviceDate);

  const condition = fields.find(field => field.type === 'condition');
  const notes = fields.find(field => field.id === `${condition.id}_notes`);
  await fieldControl(page, condition).selectOption('NI');
  assert.equal(await finalize.isDisabled(), true, 'Not-inspected condition requires an explanation');
  await fieldControl(page, notes).fill('Synthetic inaccessible item; no condition inferred.');
  assert.equal(await finalize.isEnabled(), true);
  await fieldControl(page, condition).selectOption('D');
  await fieldControl(page, fields.find(field => field.id === 'outcome')).selectOption(getServiceTemplate(fuel).sections.flatMap(section => section.fields).find(field => field.id === 'outcome').options[1]);
  assert.equal(await finalize.isDisabled(), true, 'Defect needs matching photo evidence or documented exception');
  const defectSlot = template.photoSlots.find(slot => slot.id === condition.id);
  await photoSection(page, defectSlot).getByLabel(/^Exception reason/).fill('Synthetic defect location inaccessible for photograph.');
  assert.equal(await finalize.isEnabled(), true);
  assert.equal(state.operations.includes('finalize'), false, 'No blocked state may send a finalize request');
  await checkOverflow(page);

  await finalize.click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor();
  await checkDialog(dialog);
  await shot(page, `${name}-finalize-confirmation`);
  assert.equal(state.operations.includes('finalize'), false, 'Review is not finalization');
  await dialog.getByRole('button', { name: 'Confirm and finalize', exact: true }).click();
  await page.getByText('Report finalized. Job status unchanged.', { exact: true }).waitFor();
  assert.equal(state.reports[0].status, 'finalized');
  assert.equal(state.job.status, 'in_progress');
  assert.equal(state.emails.length, 0, 'Finalizing must not send email');
  assert.equal(await fieldControl(page, work).isDisabled(), true, 'Finalized record is read-only');
  const pdf = page.getByRole('link', { name: 'View saved PDF', exact: true });
  assert.equal(await pdf.getAttribute('href'), `${prefix}/${state.reports[0].id}/pdf`);
  const pdfResponse = await page.context().request.get(new URL(await pdf.getAttribute('href'), base).href);
  assert.equal(pdfResponse.status(), 200); assert.match(pdfResponse.headers()['content-type'], /application\/pdf/);
  await pdf.scrollIntoViewIfNeeded(); await shot(page, `${name}-finalized`);
  await page.getByRole('button', { name: 'Email report', exact: true }).click();
  await page.locator('dialog[open]').waitFor();
  await checkDialog(page.locator('dialog[open]'));
  assert.equal(await page.getByLabel('Recipient', { exact: true }).inputValue(), contextData.email);
  assert.equal(state.emails.length, 0, 'Opening email dialog cannot send');
  await shot(page, `${name}-email-confirmation`);
  await page.getByRole('button', { name: 'Close email confirmation', exact: true }).click();
  assert.equal(state.emails.length, 0, 'Cancel cannot send');
  await page.getByRole('button', { name: 'Email report', exact: true }).click();
  await page.getByLabel('Recipient', { exact: true }).fill('alternate@example.invalid');
  await page.getByRole('button', { name: 'Confirm and send', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /^Email accepted by the provider\. Inbox delivery is not confirmed\.$/ }).waitFor();
  assert.equal(state.emails.length, 1); assert.equal(state.emails[0].email, 'alternate@example.invalid');
  await shot(page, `${name}-email-accepted`);
  await page.reload();
  await page.getByRole('link', { name: 'View saved PDF', exact: true }).waitFor();
  await expandSections(page, template);
  assert.equal(await fieldControl(page, work).inputValue(), retained, 'Finalized draft and history survive reload');
  assert.equal(await page.getByRole('button', { name: 'View report', exact: true }).count(), 1);
  assert.equal(state.operations.filter(op => op === 'finalize').length, 1);
  assert.equal(state.operations.includes('check-storage'), false, 'Ordinary technician never invokes diagnostic');
}

async function storageFlow(page, state, width) {
  state.canVerifyStorage = true;
  const originalJob = clone(state.job);
  await page.goto(base);
  const button = page.getByRole('button', { name: 'Check report file connection', exact: true });
  await button.waitFor();
  assert.deepEqual(state.operations, [], 'Admin diagnostic must not run automatically');
  await button.dblclick();
  await page.getByRole('status').filter({ hasText: /^Private report storage verified$/ }).waitFor();
  assert.deepEqual(state.operations, ['check-storage'], 'Double-click issues one explicit diagnostic');
  await shot(page, `admin-storage-${width}-verified`);
  for (const flag of Object.keys(state.storageResponse)) {
    state.storageResponse = { upload: true, download: true, integrity: true, syntheticObjectRemoved: true, [flag]: false };
    await button.click();
    await page.getByRole('alert').filter({ hasText: /^Report file connection check failed:/ }).waitFor();
    assert.equal(await page.getByText('Private report storage verified', { exact: true }).count(), 0, `${flag} must be verified before success`);
  }
  assert.equal(state.operations.length, 5);
  assert.deepEqual(state.reports, [], 'Diagnostic cannot create a report');
  assert.deepEqual(state.job, originalJob, 'Diagnostic cannot mutate job data');
  await checkOverflow(page);
  await shot(page, `admin-storage-${width}-unverified`);
}

async function legacyFlow(page, state, width, representation) {
  state.legacyPayloadForm = representation;
  state.job.photos.push({ id: 'existing-photo', checklistItemId: 'previous-item', uri: `data:image/png;base64,${imageBytes.toString('base64')}`, label: 'Synthetic existing photo' });
  await page.goto(`${base}/tech/job/${contextData.jobId}`);
  await page.getByRole('button', { name: 'checklist', exact: true }).click();
  await page.getByRole('radio', { name: 'gas', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Generate PDF', exact: true }).count(), 0, 'Primary checklist cannot generate the obsolete PDF');
  await shot(page, `current-checklist-${width}-${representation}`);
  await page.getByRole('button', { name: 'Previous checklist', exact: true }).click();
  const addPhoto = page.getByRole('button', { name: 'Add Photo', exact: true }).first();
  await addPhoto.waitFor();
  assert.ok(await page.locator('input[type=file]').count() >= 2, 'Picker refs stay mounted outside the Photos tab');
  const template = getChecklistTemplate(inferChecklistTemplateId({ jobType: state.job.jobType, fireplaceType: 'gas', title: state.job.title }));
  const target = template.sections.flatMap(section => section.fields).find(field => field.type === 'checkbox');
  // This evidence arrived after the page loaded and must survive an atomic append.
  state.job.photos.push({ id: 'concurrent-photo', checklistItemId: 'concurrent-item', uri: `data:image/png;base64,${imageBytes.toString('base64')}`, label: 'Synthetic concurrent photo' });
  const chooserPromise = page.waitForEvent('filechooser');
  await addPhoto.click();
  const chooser = await chooserPromise;
  assert.equal(await chooser.element().getAttribute('capture'), 'environment');
  await chooser.setFiles({ name: 'checklist.png', mimeType: 'image/png', buffer: imageBytes });
  await page.getByText(`Photo saved for checklist item: ${target.label}`, { exact: true }).waitFor();
  assert.equal(state.job.photos.length, 3);
  assert.deepEqual(state.job.photos.slice(0, 2).map(photo => photo.id), ['existing-photo', 'concurrent-photo']);
  assert.equal(state.job.photos.at(-1).checklistItemId, target.id);
  assert.match(state.job.photos.at(-1).uri, /^data:image\/jpeg;base64,/);
  await page.getByRole('button', { name: 'Add Photo (1)', exact: true }).scrollIntoViewIfNeeded();
  await shot(page, `legacy-checklist-${width}-${representation}`);
  await page.getByRole('button', { name: 'photos', exact: true }).click();
  const savedImage = page.locator('img').last();
  await savedImage.waitFor();
  assert.equal(await page.locator('img').count(), 3, 'UI adopts all canonical photos returned by atomic append');
  await savedImage.evaluate(img => img.decode());
  assert.equal(await savedImage.evaluate(img => img.complete && img.naturalWidth > 0), true);
  await shot(page, `legacy-photos-${width}-${representation}`);
  await page.getByRole('button', { name: 'checklist', exact: true }).click();
  await page.getByRole('radio', { name: 'gas', exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Service report editor', exact: true }).count(), 1, 'Actual tech Report tab mounts the editor');
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Synthetic service report browser verification: ${base}\nArtifacts: ${output}`);
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    for (const fuel of ['gas', 'wood', 'pellet']) await scenario(`${fuel}-${width}`, width, (page, state) => editorFlow(page, state, fuel, width));
    for (const representation of ['object', 'string']) await scenario(`legacy-${width}-${representation}`, width, (page, state) => legacyFlow(page, state, width, representation));
    await scenario(`admin-storage-${width}`, width, (page, state) => storageFlow(page, state, width));
  }
} catch (error) { report.failures.push({ name: 'runner', error: error.stack }); }
finally {
  try { if (browser) await browser.close(); }
  finally { if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
  report.serverClosed = !server.listening;
  const after = await hashes();
  report.sourceChanges = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
  report.sourceHashes = before;
  report.sourceStable = report.sourceChanges.length === 0;
  report.unexpectedConsole = report.console.filter(entry => entry.type === 'error' && !/Failed to load resource: the server responded with a status of 503/.test(entry.text));
  report.ok = report.failures.length === 0 && report.pageErrors.length === 0 && report.unexpectedConsole.length === 0 && report.unexpectedNetwork.length === 0 && report.serverErrors.length === 0 && report.sourceStable && report.serverClosed;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ ok: report.ok, checks: report.checks, failures: report.failures, sourceChanges: report.sourceChanges, unexpectedNetwork: report.unexpectedNetwork, consoleErrors: report.unexpectedConsole.length, serverErrors: report.serverErrors, serverClosed: report.serverClosed, output }, null, 2));
process.exitCode = report.ok ? 0 : 1;
