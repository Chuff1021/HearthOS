import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Uses the real schedule bundled by scripts/quality-ui.mjs --serve. No live APIs.
const base = new URL(process.env.QUALITY_PREVIEW_URL);
assert.equal(base.hostname, '127.0.0.1');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = path.resolve(process.env.QUALITY_SCREENSHOT_DIR || '/tmp/hearthos-schedule-colors');
assert.ok(!output.startsWith(process.cwd() + path.sep) && output !== process.cwd());
await mkdir(output, { recursive: true });
const sources = ['src/app/schedule/page.tsx', 'src/components/scheduling/schedule.css', 'src/components/scheduling/technician-colors.ts'];
const hashes = async () => {
  const entries = [];
  for (const file of sources) entries.push([file, createHash('sha256').update(await readFile(file)).digest('hex')]);
  return Object.fromEntries(entries);
};
const before = await hashes();
const techs = Array.from({ length: 7 }, (_, index) => ({ id: `tech-${index}`, name: `Technician ${index + 1}`, color: '#2563EB', active: true }));
const slots = [['07', '09'], ['07', '11'], ['08', '09'], ['09', '10'], ['10', '09'], ['10', '11'], ['11', '09']];
const jobs = techs.map((tech, index) => ({
  id: `job-${index}`, jobNumber: `QA-${index}`, title: `Service ${index + 1}`, customerName: `Example customer ${index + 1}`,
  scheduledDate: `2026-09-${slots[index][0]}`, scheduledTimeStart: `${slots[index][1]}:00`, scheduledTimeEnd: `${Number(slots[index][1]) + 2}:00`,
  propertyAddress: '100 Example Street', status: 'scheduled', priority: index === 6 ? 'urgent' : 'normal',
  assignedTechs: [{ ...tech, color: '#111111' }], notes: 'Synthetic presentation check',
}));
jobs[1].assignedTechs.push({ ...techs[2], color: '#111111' });
jobs.push({ ...jobs[3], id: 'unassigned', title: 'Unassigned visit', customerName: 'Example unassigned customer', scheduledTimeStart: '13:00', scheduledTimeEnd: '14:00', assignedTechs: [] });
const fixtures = {
  '/api/jobs': { jobs }, '/api/techs': { techs }, '/api/time-off-requests': { requests: [] },
  '/api/meeks/jobs': { jobs: [] }, '/api/quickbooks/status': { connected: false },
  '/api/dispatch': { techs: [], jobs: [], stats: { activeTechs: 7, onJob: 0, available: 7, offline: 0, unassigned: 1 } },
  '/api/customer-lookup': { customers: [], source: 'local' },
};
const browser = await chromium.launch({ headless: true });
const report = { checks: [], screenshots: [], errors: [], external: [], mutations: [], unknownReads: [] };
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(output, name + '.png') });
  report.screenshots.push(name + '.png');
};
try {
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.clock.install({ time: new Date('2026-09-09T09:00:00-05:00') });
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base.origin) { report.external.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (request.method() !== 'GET') { report.mutations.push(url.pathname); return route.fulfill({ status: 503, json: { error: 'Read-only QA' } }); }
      if (!fixtures[url.pathname]) { report.unknownReads.push(url.pathname); return route.fulfill({ status: 503, json: { error: 'Unconfigured synthetic read' } }); }
      return route.fulfill({ json: fixtures[url.pathname] });
    });
    await page.goto(new URL('/schedule', base).href);
    await page.locator('.ops-tech-filter').first().waitFor();
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const filters = page.locator('.ops-tech-filter');
    const palette = await filters.evaluateAll(elements => elements.map(el => ({ name: el.textContent.trim(), color: getComputedStyle(el).getPropertyValue('--schedule-tech-color').trim(), background: getComputedStyle(el).backgroundColor, width: el.getBoundingClientRect().width })));
    assert.equal(palette.length, 7);
    assert.equal(new Set(palette.map(tech => tech.color)).size, 7);
    assert.equal(new Set(palette.map(tech => tech.background)).size, 7);
    const eventSelector = width >= 1024 ? '.ops-calendar-event' : '.ops-agenda-event';
    for (const [index, tech] of techs.entries()) {
      const event = page.locator(eventSelector).filter({ hasText: `Service ${index + 1}` });
      assert.equal(await event.evaluate(el => getComputedStyle(el).getPropertyValue('--schedule-tech-color').trim()), palette.find(entry => entry.name === tech.name).color);
    }
    assert.equal(await page.locator(eventSelector).filter({ hasText: 'Unassigned visit' }).evaluate(el => getComputedStyle(el).getPropertyValue('--schedule-tech-color').trim()), '#64748b');
    const prior = await filters.first().boundingBox();
    await filters.first().click();
    assert.equal(await filters.first().getAttribute('aria-pressed'), 'false');
    assert.equal((await filters.first().boundingBox()).width, prior.width);
    await filters.first().click();
    await page.waitForTimeout(300);
    await shot(page, `week-${width}-${theme}`);
    const actions = page.locator('.ops-schedule-actions');
    await actions.getByRole('button', { name: 'By Tech', exact: true }).click();
    await page.getByLabel('Technician schedule').selectOption(techs[3].id);
    assert.equal(await page.locator(eventSelector).count(), 1);
    assert.equal(await page.locator(eventSelector).evaluate(el => getComputedStyle(el).getPropertyValue('--schedule-tech-color').trim()), palette[3].color);
    await actions.getByRole('button', { name: 'Master', exact: true }).click();
    await actions.getByRole('button', { name: 'Month', exact: true }).click();
    if (width >= 1024) {
      for (const [index, tech] of techs.entries()) {
        const event = page.locator('.ops-month-event').filter({ hasText: `Example customer ${index + 1}` });
        assert.equal(await event.evaluate(el => getComputedStyle(el).getPropertyValue('--schedule-tech-color').trim()), palette.find(entry => entry.name === tech.name).color);
      }
    }
    await shot(page, `month-${width}-${theme}`);
    await actions.getByRole('button', { name: 'Week', exact: true }).click();
    const event = page.locator(eventSelector).filter({ hasText: 'Service 4' });
    if (width >= 1024) await event.getByRole('button', { name: /^Open / }).click();
    else await event.click();
    const detail = page.getByRole('dialog', { name: 'Service 4', exact: true });
    await detail.waitFor();
    assert.equal(await detail.locator('h2').textContent(), 'Service 4');
    await shot(page, `detail-${width}-${theme}`);
    await page.getByRole('button', { name: 'Close job details', exact: true }).click();
    await actions.getByRole('button', { name: 'New Job', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Add Scheduled Job', exact: true });
    await create.waitFor();
    const assignees = create.locator('.ops-schedule-assignee');
    assert.deepEqual(await assignees.evaluateAll(elements => elements.map(el => getComputedStyle(el).getPropertyValue('--schedule-tech-color').trim())), palette.map(tech => tech.color));
    await assignees.nth(2).getByRole('checkbox').check();
    await shot(page, `create-${width}-${theme}`);
    await page.getByRole('button', { name: 'Close new job', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    report.checks.push({ width, theme, uniqueColors: 7, consistentAcrossViews: true, filterWidthStable: true, noPageOverflow: true });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.external, []);
  assert.deepEqual(report.mutations, []);
  assert.deepEqual(report.unknownReads, []);
  assert.deepEqual(await hashes(), before);
  report.ok = true;
} finally {
  await browser.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ ...report, sourceHashes: before }, null, 2));
}
console.log(JSON.stringify({ ok: report.ok, checks: report.checks, screenshots: report.screenshots.length, output }));
