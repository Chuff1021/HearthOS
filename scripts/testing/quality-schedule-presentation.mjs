import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Point this at scripts/quality-ui.mjs --serve. Every API call is intercepted here.
const base = new URL(process.env.QUALITY_PREVIEW_URL);
assert.equal(base.hostname, '127.0.0.1', 'Only the isolated loopback preview is allowed');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = process.env.QUALITY_SCREENSHOT_DIR || '/tmp/hearthos-schedule-presentation';
await mkdir(output, { recursive: true });
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const techs = [
  { id: 'qa-blue', name: 'Example Technician', color: '#2674b8', active: true },
  { id: 'qa-green', name: 'Second Technician', color: '#13795d', active: true },
];
const jobs = [
  { id: 'qa-first', title: 'Annual inspection', scheduledTimeStart: '09:00', scheduledTimeEnd: '11:00' },
  { id: 'qa-overlap', title: 'Overlapping service', scheduledTimeStart: '09:30', scheduledTimeEnd: '10:30' },
  { id: 'qa-short', title: 'Short visit', scheduledTimeStart: '12:00', scheduledTimeEnd: '12:30' },
  { id: 'qa-urgent', title: 'Urgent service', scheduledTimeStart: '13:00', scheduledTimeEnd: '15:00', priority: 'urgent' },
].map((job, index) => ({
  jobNumber: `QA-${index}`, customerName: 'Example Hearth Customer', propertyAddress: '100 Example Street, Test City',
  scheduledDate: today, status: 'scheduled', notes: 'Synthetic record', assignedTechs: [techs[index % 2]], ...job,
}));
const browser = await chromium.launch({ headless: true });
const errors = [], writes = [];
try {
  for (const width of [320, 390, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base.origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (request.method() !== 'GET') {
        writes.push({ method: request.method(), body: request.postDataJSON() });
        return route.fulfill({ status: 503, json: { error: 'Synthetic failure; no live mutations' } });
      }
      const fixtures = {
        '/api/jobs': { jobs }, '/api/techs': { techs }, '/api/time-off-requests': { requests: [] },
        '/api/meeks/jobs': { jobs: [] }, '/api/quickbooks/status': { connected: false },
        '/api/customer-lookup': { customers: [], source: 'local' },
      };
      return route.fulfill({ status: 200, json: fixtures[url.pathname] || {} });
    });
    await page.goto(new URL('/schedule', base).href);
    await page.locator('.ops-tech-filter').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const workspace = page.locator('.ops-schedule');
    const controls = workspace.locator('.ops-schedule-actions');
    assert.equal(await workspace.locator('h1').evaluate(el => getComputedStyle(el).fontSize), '24px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const filter = page.locator('.ops-tech-filter').first();
    const selectedSize = await filter.boundingBox();
    assert.equal(await filter.getAttribute('aria-pressed'), 'true');
    assert.equal(await filter.evaluate(el => getComputedStyle(el).borderLeftWidth), '1px');
    await filter.click();
    assert.equal(await filter.getAttribute('aria-pressed'), 'false');
    assert.equal((await filter.boundingBox()).width, selectedSize.width, 'Selection must not resize filters');
    await filter.click();
    await controls.getByRole('button', { name: 'By Tech', exact: true }).click();
    await page.getByLabel('Technician schedule').selectOption(techs[1].id);
    await controls.getByRole('button', { name: 'Master', exact: true }).click();

    if (width >= 1024) {
      await page.locator('.ops-schedule-scroll').evaluate(el => { el.scrollTop = 0; });
      const events = page.locator('.ops-calendar-event');
      assert.equal(await events.count(), 4);
      const first = await events.nth(0).boundingBox(), overlap = await events.nth(1).boundingBox();
      assert.ok(first.x + first.width <= overlap.x, 'Overlapping appointments retain separate columns');
      assert.equal(await events.nth(0).evaluate(el => {
        const rect = el.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 8)?.closest('.ops-calendar-event') === el;
      }), true, 'Later hour backgrounds must not paint over multi-hour appointments');
      assert.equal(await events.nth(0).locator('.ops-event-title').evaluate(el => getComputedStyle(el).fontSize), '13px');
      assert.equal(await events.nth(0).evaluate(el => getComputedStyle(el).borderLeftColor), 'rgb(38, 116, 184)');
      assert.equal(await events.nth(3).evaluate(el => getComputedStyle(el).borderLeftColor), 'rgb(19, 121, 93)');
      assert.equal(await events.nth(3).evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(245, 158, 11)');
      assert.equal(await events.nth(3).locator('.ops-event-priority').count(), 1);
      assert.equal(await page.locator('.ops-calendar-event[data-short="true"] .ops-event-title').evaluate(el => {
        const title = el.getBoundingClientRect(), event = el.closest('.ops-calendar-event').getBoundingClientRect();
        return title.top >= event.top && title.bottom <= event.bottom;
      }), true, 'Short appointment title must remain visible');
      await page.screenshot({ path: path.join(output, `week-${width}.png`) });
      await events.nth(0).getByRole('button', { name: /^Open / }).click();
    } else {
      await page.locator('.ops-agenda-event').first().click();
    }
    const detail = page.getByRole('dialog', { name: 'Annual inspection', exact: true });
    await detail.waitFor();
    assert.equal(await detail.locator('h2').evaluate(el => getComputedStyle(el).fontSize), '14px');
    await page.screenshot({ path: path.join(output, `detail-${width}.png`) });
    await page.getByRole('button', { name: 'Close job details', exact: true }).click();
    await controls.getByRole('button', { name: 'Month', exact: true }).click();
    await page.waitForFunction(() => {
      const buttons = document.querySelector('.ops-schedule-controls').querySelectorAll('button');
      return getComputedStyle(buttons[1]).backgroundColor === 'rgb(255, 240, 230)' && getComputedStyle(buttons[0]).backgroundColor === 'rgba(0, 0, 0, 0)';
    });
    if (width >= 1024) {
      assert.equal(await page.locator('.ops-schedule-month-day').count(), 42);
      await page.screenshot({ path: path.join(output, `month-${width}.png`) });
    } else await page.getByRole('heading', { name: 'This month', exact: true }).waitFor();
    await controls.getByRole('button', { name: 'Week', exact: true }).click();
    await controls.getByRole('button', { name: 'New Job', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Add Scheduled Job', exact: true });
    await create.waitFor();
    assert.equal(await create.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    }), true, 'Creation form fits viewport');
    await create.getByRole('button', { name: 'Create Job', exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('schedule-job-title')).borderColor === 'rgb(180, 35, 65)');
    assert.equal(await page.getByLabel('Job title', { exact: true }).evaluate(el => getComputedStyle(el).borderColor), 'rgb(180, 35, 65)');
    await page.getByLabel('Job title', { exact: true }).fill('Unsaved synthetic job');
    await create.getByRole('checkbox').first().check();
    assert.equal(await create.locator('.ops-schedule-assignee').first().evaluate(el => getComputedStyle(el).borderLeftWidth), '1px');
    await create.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, `create-${width}.png`) });
    await page.getByRole('button', { name: 'Close new job', exact: true }).click();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.ops-schedule')).getPropertyValue('--schedule-tech-tint').trim() === '20%');
    await page.locator('.ops-schedule-scroll').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, `dark-${width}.png`) });
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, [], 'Validation and presentation checks must not submit data');
  console.log(JSON.stringify({ pass: true, viewports: [320, 390, 1024, 1440], consoleErrors: errors.length, mutations: writes.length, output }));
} finally {
  await browser.close();
}
