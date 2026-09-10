import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { withCenterPostgres } from './center-local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orgA = id(1), orgB = id(2), employeeA = id(11), employeeB = id(12);
const jobA = id(21), jobB = id(22), customerA = id(31), customerB = id(32);
const actorA = { orgId: orgA, employeeId: employeeA, role: 'technician', name: 'Fixture Technician', email: 'tech@example.invalid', clerkUserId: 'fixture-a' };
const actorB = { ...actorA, orgId: orgB, employeeId: employeeB, clerkUserId: 'fixture-b' };
const photoBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x12, 0x34]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const originalTables = ['organizations', 'users', 'customers', 'hearth_jobs_store', 'invoices', 'payments'];

async function bundle(fixture) {
  const routes = 'src/app/api/tech/service-reports';
  const files = {
    store: 'src/lib/service-reports/store.ts', domain: 'src/lib/service-reports/domain.ts',
    templates: 'src/lib/service-reports/templates.ts', server: 'src/lib/service-reports/server.ts',
    legacy: 'src/lib/service-reports/legacy-photos.ts', legacyRoute: 'src/app/api/tech/job-photos/route.ts',
    policy: 'src/lib/security/access-policy.ts', route: `${routes}/route.ts`,
    pdfRoute: `${routes}/[id]/pdf/route.ts`, uploadRoute: `${routes}/[id]/photos/route.ts`,
    photoRoute: `${routes}/[id]/photos/[photoId]/route.ts`,
  };
  const adapters = {
    empty: '',
    postgres: 'export default function(url) { if (url !== "offline-fixture") throw Error("Non-fixture database forbidden"); return __fixture.sql; }',
    auth: 'export const authorizeCrmApi = async (...args) => __fixture.authorize ? __fixture.authorize(...args) : __fixture.denied; export const requireCrmActor = async () => __fixture.requireActor ? __fixture.requireActor() : __fixture.actor;',
    storage: 'export const putReportObject = (...args) => __fixture.deps.put(...args); export const getReportObject = (...args) => __fixture.deps.get(...args); export const verifyReportStorage = (...args) => __fixture.deps.verifyStorage(...args);',
    pdf: 'export const renderServiceReportPdf = (...args) => __fixture.deps.render(...args);',
    smtp: 'export const isSmtpConfigured = () => __fixture.mailConfigured; export const sendSmtpEmail = async input => { __fixture.smtp.push(input); };',
    canvas: 'export const loadImage = async () => ({ width: 2, height: 2 }); export const createCanvas = () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toBuffer: () => __fixture.photoBytes });',
  };
  const aliases = {
    'server-only': 'empty', postgres: 'postgres', canvas: 'canvas',
    '../security/crm-access': 'auth', '../email/smtp': 'smtp', './storage': 'storage', './pdf': 'pdf',
    '@/lib/security/crm-access': 'auth',
    '../security/access-policy': 'policy', '@/lib/security/access-policy': 'policy',
    '@/lib/service-reports/server': 'server', '@/lib/service-reports/store': 'store',
    '@/lib/service-reports/legacy-photos': 'legacy',
    '@/lib/service-reports/storage': 'storage',
    './store': 'store', './domain': 'domain', './templates': 'templates', './legacy-photos': 'legacy',
    ...Object.fromEntries(Object.keys(files).map(name => [`fixture:${name}`, name])),
  };
  const output = await build({
    stdin: { contents: Object.keys(files).map(name => `export * as ${name} from "fixture:${name}";`).join('\n'), resolveDir: root, loader: 'ts' },
    absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'service-reports-offline-boundary', setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: specifier }) => {
        const name = aliases[specifier];
        if (!name) throw new Error(`Unapproved service-report dependency: ${specifier}`);
        return { path: name, namespace: 'report-fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'report-fixture' }, async ({ path: name }) => ({
        contents: name in adapters ? adapters[name] : await readFile(path.join(root, files[name]), 'utf8'), loader: 'ts',
      }));
    } }],
  });
  const compiledModule = { exports: {} };
  new Function('module', 'exports', '__fixture', 'process', 'fetch', output.outputFiles[0].text)(
    compiledModule, compiledModule.exports, fixture, { env: { DATABASE_URL: 'offline-fixture' } },
    () => { throw new Error('Network access forbidden in service-report tests'); },
  );
  return compiledModule.exports;
}

function dependencies(api) {
  const objects = new Map();
  const calls = { context: [], put: [], get: [], render: [], send: [] };
  const fail = { put: false, get: false, render: false, send: false };
  const contexts = new Map([
    [jobA, { orgId: orgA, customerId: customerA, employeeId: employeeA }],
    [jobB, { orgId: orgB, customerId: customerB, employeeId: employeeB }],
  ]);
  const deps = {
    async context(actor, jobId) {
      calls.context.push({ actor, jobId });
      const found = contexts.get(jobId);
      if (!found || found.orgId !== actor.orgId || (actor.role === 'technician' && actor.employeeId !== found.employeeId)) {
        throw new api.store.ReportError('Job not found.', 404);
      }
      return { jobId, customerId: found.customerId, jobNumber: 'FIXTURE-21', customerName: 'Synthetic Customer',
        address: '123 Test Street', serviceDate: '2026-09-10', equipment: 'Fixture gas unit',
        technicianId: actor.employeeId, technicianName: actor.name, suggestedFuel: 'gas', email: 'customer@example.invalid' };
    },
    async put(key, bytes, type) {
      calls.put.push({ key, bytes: Buffer.from(bytes), type });
      if (fail.put) throw new Error('Synthetic object write failure');
      assert.equal(objects.has(key), false, 'immutable object keys must never be overwritten');
      objects.set(key, Buffer.from(bytes));
      return digest(bytes);
    },
    async get(key, checksum) {
      calls.get.push({ key, checksum });
      if (fail.get) throw new Error('Synthetic object read failure');
      assert.ok(objects.has(key), 'only fixture objects may be read');
      const bytes = objects.get(key);
      assert.equal(digest(bytes), checksum, 'stored checksum must match retrieved bytes');
      return Buffer.from(bytes);
    },
    async render(snapshot, photos) {
      calls.render.push({ snapshot: clone(snapshot), photos });
      if (fail.render) throw new Error('Synthetic renderer failure');
      return Buffer.from(`%PDF-1.7\n${JSON.stringify(snapshot)}\n${photos.map(p => digest(p.bytes)).join('\n')}\n%%EOF`);
    },
    async send(input) {
      calls.send.push({ ...input, bytes: Buffer.from(input.bytes) });
      if (fail.send) throw new Error('Synthetic mail acceptance unknown');
    },
  };
  return { deps, objects, calls, fail, contexts };
}

function validData(api, fuel = 'gas') {
  const template = api.templates.getServiceTemplate(fuel);
  const answers = {};
  for (const field of template.sections.flatMap(section => section.fields)) {
    if (field.required) answers[field.id] = field.options?.[0] ?? 'Synthetic fixture record';
  }
  Object.assign(answers, { serviceDate: '2026-09-10', customerRepresentative: 'Fixture Customer', acknowledgmentDateTime: '2026-09-10T12:00:00Z' });
  if (fuel === 'wood') Object.assign(answers, { totalFlues: '1', scan: 'Not performed', scanReason: 'No scan requested for this fixture visit.' });
  const data = { fuel, answers, photoExceptions: Object.fromEntries(template.photoSlots.filter(slot => slot.required)
    .map(slot => [slot.id, 'Synthetic fixture: evidence unavailable for this recorded requirement.'])),
  customerAcknowledgment: 'Fixture customer receipt recorded and findings explained.' };
  assert.deepEqual(api.domain.validateReport(data, []), [], `${fuel} fixture must satisfy the real domain`);
  return data;
}

async function seed(sql) {
  await sql.unsafe(`CREATE TABLE organizations (id uuid PRIMARY KEY, slug text, payload jsonb);
    CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid REFERENCES organizations(id), first_name text, payload jsonb);
    CREATE TABLE customers (id uuid PRIMARY KEY, org_id uuid REFERENCES organizations(id), qb_customer_id text, email text, payload jsonb);
    CREATE TABLE hearth_jobs_store (id text PRIMARY KEY, payload jsonb, updated_at timestamptz NOT NULL DEFAULT '2026-09-01T00:00:00Z');
    CREATE TABLE invoices (id uuid PRIMARY KEY, payload jsonb);
    CREATE TABLE payments (id uuid PRIMARY KEY, payload jsonb);`);
  await sql`INSERT INTO organizations VALUES (${orgA},'default','{"preserve":"organization-a"}'),(${orgB},'foreign','{"preserve":"organization-b"}')`;
  await sql`INSERT INTO users VALUES (${employeeA},${orgA},'Fixture A','{"preserve":"user-a"}'),(${employeeB},${orgB},'Fixture B','{"preserve":"user-b"}')`;
  await sql`INSERT INTO customers VALUES (${customerA},${orgA},'QB-A','customer@example.invalid','{"preserve":"customer-a"}'),(${customerB},${orgB},'QB-B','foreign@example.invalid','{"preserve":"customer-b"}')`;
  for (const [job, customer, employee] of [[jobA, customerA, employeeA], [jobB, customerB, employeeB]]) {
    const payload = { customerId: customer, assignedTechs: [{ id: employee }], title: 'Synthetic gas service', jobNumber: 'FIXTURE', customerName: 'Fixture Customer', propertyAddress: '123 Test Street', scheduledDate: '2026-09-10', fireplaceUnit: { type: 'gas', brand: 'Synthetic', model: 'Fixture' }, untouchedNotes: 'Must not change' };
    // The production default job uses a JSONB string containing JSON, not a JSONB object.
    await sql`INSERT INTO hearth_jobs_store (id,payload) VALUES (${job},${sql.json(job === jobA ? JSON.stringify(payload) : payload)})`;
  }
  const representations = await sql`SELECT id,jsonb_typeof(payload) AS type FROM hearth_jobs_store ORDER BY id`;
  assert.deepEqual(Array.from(representations), [{ id: jobA, type: 'string' }, { id: jobB, type: 'object' }]);
  await sql`INSERT INTO invoices VALUES (${id(41)},'{"preserve":"invoice","balance":123}')`;
  await sql`INSERT INTO payments VALUES (${id(51)},'{"preserve":"payment","amount":45}')`;
}

async function fingerprint(sql, tables = originalTables) {
  const result = {};
  for (const table of tables) result[table] = Array.from(await sql`SELECT to_jsonb(t) AS row FROM ${sql(table)} t ORDER BY to_jsonb(t)::text`);
  return result;
}

test('service reports: disposable PostgreSQL persistence and security', { timeout: 120_000 }, async t => {
  const fixture = { actor: actorA, denied: null, mailConfigured: true, smtp: [], photoBytes };
  const api = await bundle(fixture);
  await withCenterPostgres(async ({ sql }) => {
    fixture.sql = sql;
    await seed(sql);
    const original = await fingerprint(sql);
    const migration = await readFile(path.join(root, 'scripts/sql/service-reports.sql'), 'utf8');
    const connection = await sql.reserve();
    try { await connection.unsafe(migration); await connection.unsafe(migration); }
    finally { connection.release(); }
    await t.test('migration is repeatable, additive, and has no TCP listener', async () => {
      assert.deepEqual(await fingerprint(sql), original);
      const [settings] = await sql`SELECT current_setting('listen_addresses') AS listeners`;
      assert.equal(settings.listeners, '');
      for (const table of ['hearth_service_reports', 'hearth_service_report_photos', 'hearth_service_report_delivery']) {
        const [count] = await sql`SELECT count(*)::int AS total FROM ${sql(table)}`;
        assert.equal(count.total, 0);
      }
    });
    const rejects = (operation, status, pattern) => assert.rejects(operation, error => {
      assert.ok(error instanceof api.store.ReportError, `expected ReportError, received ${error}`);
      assert.equal(error.status, status);
      if (pattern) assert.match(error.message, pattern);
      return true;
    });
    function harness() {
      const h = dependencies(api);
      return { ...h, store: api.store.createServiceReportStore(sql, h.deps) };
    }
    const stored = async report => (await sql`SELECT * FROM hearth_service_reports WHERE id=${report.id}`)[0];
    async function ready(h, fuel = 'gas', actor = actorA, job = jobA) {
      const report = await h.store.create(actor, job, fuel);
      return h.store.save(actor, report.id, report.revision, validData(api, fuel));
    }
    async function finalized(h, actor = actorA, job = jobA) {
      const draft = await ready(h, 'gas', actor, job);
      return h.store.finalize(actor, draft.id, draft.revision);
    }

    await t.test('all templates persist valid drafts and create distinct reports', async () => {
      const h = harness();
      const ids = new Set();
      for (const fuel of ['gas', 'wood', 'pellet']) {
        const draft = await h.store.create(actorA, jobA, fuel);
        ids.add(draft.id);
        assert.equal(draft.revision, 0);
        assert.equal(draft.status, 'draft');
        assert.deepEqual(draft.data, { fuel, answers: {}, photoExceptions: {}, customerAcknowledgment: '' });
        const data = validData(api, fuel);
        const saved = await h.store.save(actorA, draft.id, 0, data);
        assert.equal(saved.revision, 1);
        assert.deepEqual((await stored(saved)).data, data);
        const final = await h.store.finalize(actorA, saved.id, saved.revision);
        assert.equal(final.status, 'finalized');
        assert.ok((await h.store.list(actorA, { customerId: customerA })).some(item => item.id === final.id));
      }
      assert.equal(ids.size, 3);
    });

    await t.test('concurrent optimistic saves have one winner and stale writes do not overwrite', async () => {
      const h = harness();
      const draft = await h.store.create(actorA, jobA, 'gas');
      const inputs = ['First editor notes', 'Second editor notes'].map(workCompleted => ({ ...validData(api), answers: { ...validData(api).answers, workCompleted } }));
      const results = await Promise.allSettled(inputs.map(data => h.store.save(actorA, draft.id, 0, data)));
      const winner = results.findIndex(result => result.status === 'fulfilled');
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results[1 - winner].reason.status, 409);
      const before = await stored(draft);
      assert.deepEqual(before.data, inputs[winner]);
      await rejects(h.store.save(actorA, draft.id, 0, inputs[1 - winner]), 409);
      await rejects(h.store.finalize(actorA, draft.id, 0), 409);
      await rejects(h.store.addPhoto(actorA, draft.id, 0, 'overview', '', photoBytes), 409);
      assert.deepEqual(await stored(draft), before);
      assert.equal(h.calls.put.length, 0);
    });

    await t.test('missing required answers, acknowledgment, and photo evidence reject finalization', async () => {
      const h = harness();
      for (const fuel of ['gas', 'wood', 'pellet']) {
        const template = api.templates.getServiceTemplate(fuel);
        const field = template.sections.flatMap(section => section.fields).find(item => item.required);
        for (const kind of ['answer', 'acknowledgment', 'photo']) {
          const data = validData(api, fuel);
          if (kind === 'answer') delete data.answers[field.id];
          if (kind === 'acknowledgment') data.customerAcknowledgment = '';
          if (kind === 'photo') delete data.photoExceptions.overview;
          const draft = await h.store.create(actorA, jobA, fuel);
          const saved = await h.store.save(actorA, draft.id, 0, data);
          const before = await stored(saved);
          await rejects(h.store.finalize(actorA, saved.id, saved.revision), 400, kind === 'photo' ? /overview/i : undefined);
          assert.deepEqual(await stored(saved), before);
        }
      }
      assert.equal(h.calls.render.length, 0);
      assert.equal(h.calls.put.length, 0);
    });

    await t.test('foreign organization IDs cannot list, create, save, finalize, email, upload, or read files', async () => {
      const h = harness();
      let draft = await ready(h);
      draft = await h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', 'Private evidence', photoBytes);
      const final = await finalized(h);
      const before = await fingerprint(sql, ['hearth_service_reports', 'hearth_service_report_photos', 'hearth_service_report_delivery']);
      const accesses = { put: h.calls.put.length, get: h.calls.get.length, send: h.calls.send.length };
      for (const actor of [actorB, { ...actorB, role: 'admin' }]) {
        assert.deepEqual(await h.store.list(actor, { jobId: jobA }), []);
        assert.deepEqual(await h.store.list(actor, { customerId: customerA }), []);
        await rejects(h.store.create(actor, jobA, 'gas'), 404);
        await rejects(h.store.save(actor, draft.id, draft.revision, validData(api)), 404);
        await rejects(h.store.finalize(actor, draft.id, draft.revision), 404);
        await rejects(h.store.addPhoto(actor, draft.id, draft.revision, 'overview', '', photoBytes), 404);
        await rejects(h.store.removePhoto(actor, draft.id, draft.photos[0].id, draft.revision), 404);
        await rejects(h.store.file(actor, final.id), 404);
        await rejects(h.store.file(actor, draft.id, draft.photos[0].id), 404);
        await rejects(h.store.email(actor, final.id, randomUUID(), 'foreign@example.invalid'), 404);
      }
      assert.deepEqual(await fingerprint(sql, ['hearth_service_reports', 'hearth_service_report_photos', 'hearth_service_report_delivery']), before);
      assert.deepEqual({ put: h.calls.put.length, get: h.calls.get.length, send: h.calls.send.length }, accesses);
      const foreignDraft = await ready(h, 'gas', actorB, jobB);
      await rejects(h.store.file(actorA, foreignDraft.id, draft.photos[0].id), 404);
      const another = await ready(h);
      await rejects(h.store.file(actorA, another.id, draft.photos[0].id), 404);
      await rejects(h.store.file(actorA, draft.id, randomUUID()), 404);
      await rejects(h.store.file(actorA, draft.id), 409);
    });

    await t.test('revoked technician assignment denies every existing report access', async () => {
      const h = harness();
      let draft = await ready(h);
      draft = await h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', '', photoBytes);
      const final = await finalized(h);
      h.contexts.get(jobA).employeeId = employeeB;
      for (const operation of [() => h.store.list(actorA, { jobId: jobA }), () => h.store.save(actorA, draft.id, draft.revision, draft.data),
        () => h.store.finalize(actorA, draft.id, draft.revision), () => h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', '', photoBytes),
        () => h.store.removePhoto(actorA, draft.id, draft.photos[0].id, draft.revision),
        () => h.store.file(actorA, draft.id, draft.photos[0].id), () => h.store.file(actorA, final.id),
        () => h.store.email(actorA, final.id, randomUUID(), 'customer@example.invalid')]) await rejects(operation, 404);
    });

    await t.test('office history, files, and delivery remain accessible after a job is deleted', async () => {
      const h = harness();
      const draft = await ready(h);
      const withPhoto = await h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', 'Archived evidence', photoBytes);
      const final = await h.store.finalize(actorA, draft.id, withPhoto.revision);
      const before = await stored(final);
      h.contexts.delete(jobA);
      const office = { ...actorA, role: 'admin' };
      const contextCalls = h.calls.context.length;
      assert.ok((await h.store.list(office, { customerId: customerA })).some(report => report.id === final.id));
      assert.deepEqual((await h.store.file(office, final.id)).bytes, h.objects.get(before.pdf_key));
      assert.deepEqual((await h.store.file(office, final.id, withPhoto.photos[0].id)).bytes, photoBytes);
      assert.deepEqual(await h.store.email(office, final.id, randomUUID(), 'customer@example.invalid'), { status: 'accepted' });
      assert.deepEqual(await h.store.finalize(office, final.id, withPhoto.revision), { ...final, emailStatus: 'accepted' });
      assert.equal(h.calls.context.length, contextCalls, 'office reads must not depend on a live job');
      await rejects(h.store.file(actorA, final.id), 404);
      await rejects(h.store.file({ ...actorB, role: 'admin' }, final.id), 404);
      assert.deepEqual(await stored(final), before);
    });

    await t.test('500-character captions are retained; 501 characters reject before SQL or object writes', async () => {
      const h = harness();
      const draft = await ready(h);
      const caption = `${'c'.repeat(499)}!`;
      const uploaded = await h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', caption, photoBytes);
      assert.equal(uploaded.revision, draft.revision + 1);
      assert.equal(uploaded.photos[0].caption, caption);
      const [photo] = await sql`SELECT caption FROM hearth_service_report_photos WHERE report_id=${draft.id}`;
      assert.equal(photo.caption, caption);
      const tables = ['hearth_service_reports', 'hearth_service_report_photos'];
      const before = await fingerprint(sql, tables);
      const puts = h.calls.put.length;
      const contexts = h.calls.context.length;
      const objects = [...h.objects.keys()];
      let sqlAccesses = 0;
      const guardedSql = new Proxy(sql, {
        apply() { sqlAccesses++; throw new Error('Oversized caption reached SQL'); },
        get() { sqlAccesses++; throw new Error('Oversized caption reached a SQL method'); },
      });
      const guardedStore = api.store.createServiceReportStore(guardedSql, h.deps);
      await rejects(guardedStore.addPhoto(actorA, draft.id, uploaded.revision, 'after', `${caption}!`, photoBytes), 400, /500/);
      assert.equal(sqlAccesses, 0);
      assert.equal(h.calls.put.length, puts);
      assert.equal(h.calls.context.length, contexts);
      assert.deepEqual([...h.objects.keys()], objects);
      assert.deepEqual(await fingerprint(sql, tables), before);
      const final = await h.store.finalize(actorA, draft.id, uploaded.revision);
      assert.equal((await stored(final)).snapshot.photos[0].caption, caption);
    });

    await t.test('photo removal is draft-only, revision-checked, scoped, and restores missing-photo validation', async () => {
      const h = harness();
      const data = validData(api);
      delete data.photoExceptions.overview;
      let draft = await h.store.create(actorA, jobA, 'gas');
      draft = await h.store.save(actorA, draft.id, 0, data);
      draft = await h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', 'Remove this draft evidence', photoBytes);
      const photo = draft.photos[0];
      const before = await stored(draft);
      const other = await ready(h);
      await rejects(h.store.removePhoto(actorA, other.id, photo.id, other.revision), 404);
      await rejects(h.store.removePhoto(actorA, draft.id, randomUUID(), draft.revision), 404);
      await rejects(h.store.removePhoto(actorA, draft.id, photo.id, draft.revision - 1), 409);
      assert.deepEqual(await stored(draft), before);
      const objectKeys = [...h.objects.keys()];
      const removed = await h.store.removePhoto(actorA, draft.id, photo.id, draft.revision);
      assert.equal(removed.revision, draft.revision + 1);
      assert.deepEqual(removed.photos, []);
      assert.deepEqual(removed.data, draft.data);
      assert.deepEqual([...h.objects.keys()], objectKeys, 'private objects must remain retained');
      await rejects(h.store.file(actorA, draft.id, photo.id), 404);
      await rejects(h.store.removePhoto(actorA, draft.id, photo.id, removed.revision), 404);
      await rejects(h.store.finalize(actorA, draft.id, removed.revision), 400, /overview/i);
      const replacement = await h.store.addPhoto(actorA, draft.id, removed.revision, 'overview', 'Replacement evidence', photoBytes);
      const final = await h.store.finalize(actorA, draft.id, replacement.revision);
      const finalizedBefore = await stored(final);
      await rejects(h.store.removePhoto(actorA, final.id, replacement.photos[0].id, final.revision), 409);
      assert.deepEqual(await stored(final), finalizedBefore);
      assert.deepEqual((await h.store.file(actorA, final.id, replacement.photos[0].id)).bytes, photoBytes);
    });

    await t.test('uploaded draft evidence survives validation, upload, retrieval, rendering, and PDF storage errors', async () => {
      const h = harness();
      const data = validData(api);
      delete data.photoExceptions.overview;
      let draft = await h.store.create(actorA, jobA, 'gas');
      draft = await h.store.save(actorA, draft.id, 0, data);
      draft = await h.store.addPhoto(actorA, draft.id, draft.revision, 'before', 'Wrong requirement does not satisfy overview', photoBytes);
      await rejects(h.store.finalize(actorA, draft.id, draft.revision), 400, /overview/i);
      draft = await h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', 'Linked overview evidence', photoBytes);
      assert.equal(draft.photos[1].slotId, 'overview');
      assert.deepEqual(api.domain.validateReport(draft.data, draft.photos), []);
      const before = await stored(draft);
      const photosBefore = await sql`SELECT * FROM hearth_service_report_photos WHERE report_id=${draft.id} ORDER BY id`;
      await rejects(h.store.addPhoto(actorA, draft.id, draft.revision, 'unknown-slot', '', photoBytes), 400);
      h.fail.put = true;
      await assert.rejects(h.store.addPhoto(actorA, draft.id, draft.revision, 'after', '', photoBytes), /Synthetic object write failure/);
      h.fail.put = false;
      for (const failure of ['get', 'render', 'put']) {
        h.fail[failure] = true;
        await assert.rejects(h.store.finalize(actorA, draft.id, draft.revision), /Synthetic/);
        h.fail[failure] = false;
        assert.deepEqual(await stored(draft), before);
        assert.deepEqual(await sql`SELECT * FROM hearth_service_report_photos WHERE report_id=${draft.id} ORDER BY id`, photosBefore);
        for (const photo of draft.photos) assert.deepEqual((await h.store.file(actorA, draft.id, photo.id)).bytes, photoBytes);
      }
      const final = await h.store.finalize(actorA, draft.id, draft.revision);
      assert.equal(final.status, 'finalized');
      assert.deepEqual(h.calls.render.at(-1).photos.map(p => p.slotId), draft.photos.map(p => p.slotId));
      assert.deepEqual(h.calls.render.at(-1).photos[1].bytes, photoBytes);
    });

    await t.test('changed customer cannot finalize a report against the old customer', async () => {
      const h = harness();
      const draft = await ready(h);
      const before = await stored(draft);
      h.contexts.get(jobA).customerId = customerB;
      await rejects(h.store.finalize(actorA, draft.id, draft.revision), 409, /customer changed/i);
      assert.deepEqual(await stored(draft), before);
      assert.equal(h.calls.render.length, 0);
    });

    await t.test('defects require evidence linked to that condition, not an unrelated photo', async () => {
      const h = harness();
      for (const fuel of ['gas', 'wood', 'pellet']) {
        const condition = api.templates.getServiceTemplate(fuel).sections.flatMap(section => section.fields).find(field => field.type === 'condition');
        const data = validData(api, fuel);
        data.answers[condition.id] = 'D';
        data.answers[`${condition.id}_notes`] = 'Synthetic defect requires correction before further use.';
        data.answers.outcome = api.templates.outcomeOptions[1];
        let draft = await h.store.create(actorA, jobA, fuel);
        draft = await h.store.save(actorA, draft.id, 0, data);
        draft = await h.store.addPhoto(actorA, draft.id, draft.revision, 'overview', 'Not linked to the defect', photoBytes);
        await rejects(h.store.finalize(actorA, draft.id, draft.revision), 400, new RegExp(condition.id));
        draft = await h.store.addPhoto(actorA, draft.id, draft.revision, condition.id, 'Evidence for this defect', photoBytes);
        const final = await h.store.finalize(actorA, draft.id, draft.revision);
        assert.equal(final.status, 'finalized');
        assert.ok((await stored(final)).snapshot.photos.some(photo => photo.slotId === condition.id));
      }
    });

    await t.test('actual visit date, edited address, and model reach the rendered and persisted snapshot', async () => {
      const h = harness();
      const before = await fingerprint(sql);
      for (const fuel of ['gas', 'pellet']) {
        const data = validData(api, fuel);
        Object.assign(data.answers, { serviceDate: '2024-02-29', serviceAddress: '  456 Actual Visit Avenue  ',
          makeModel: '  Actual Appliance Model  ', jobNumber: 'Edited job number must not replace linked job',
          customerName: 'Edited customer must not replace linked customer', technicianName: 'Untrusted form technician' });
        const draft = await h.store.create(actorA, jobA, fuel);
        const saved = await h.store.save(actorA, draft.id, draft.revision, data);
        const final = await h.store.finalize(actorA, draft.id, saved.revision);
        const snapshot = (await stored(final)).snapshot;
        assert.equal(snapshot.serviceDate, '2024-02-29');
        assert.equal(snapshot.address, '456 Actual Visit Avenue');
        assert.equal(snapshot.equipment, 'Actual Appliance Model');
        assert.equal(snapshot.jobNumber, 'FIXTURE-21');
        assert.equal(snapshot.customerId, customerA);
        assert.equal(snapshot.customerName, 'Synthetic Customer');
        assert.equal(snapshot.technicianId, actorA.employeeId);
        assert.equal(snapshot.technicianName, actorA.name);
        assert.equal(snapshot.data.answers.technicianName, actorA.name);
        assert.deepEqual(h.calls.render.at(-1).snapshot, snapshot);
        assert.equal(snapshot.data.answers.serviceDate, snapshot.serviceDate);
      }
      assert.deepEqual(await fingerprint(sql), before, 'snapshot edits must not mutate jobs or customer records');
    });

    await t.test('snapshot optional fields use requested form/context fallbacks without inventing values', async () => {
      for (const scenario of ['blank-form', 'missing-form', 'form-job-number', 'empty-optional']) {
        const h = harness();
        const context = h.deps.context;
        h.deps.context = async (...args) => ({ ...await context(...args),
          ...(scenario === 'form-job-number' ? { jobNumber: '' } : {}),
          ...(scenario === 'empty-optional' ? { jobNumber: '', address: '', equipment: '' } : {}),
          technicianName: 'Stale context technician', technicianId: employeeB,
        });
        const data = validData(api);
        data.answers.serviceDate = '2000-02-29';
        if (scenario !== 'missing-form') Object.assign(data.answers, { serviceAddress: '   ', makeModel: '   ', jobNumber: '   ' });
        if (scenario === 'form-job-number') data.answers.jobNumber = '  FORM-123  ';
        const draft = await h.store.create(actorA, jobA, 'gas');
        const saved = await h.store.save(actorA, draft.id, draft.revision, data);
        const final = await h.store.finalize(actorA, draft.id, saved.revision);
        const snapshot = (await stored(final)).snapshot;
        assert.equal(snapshot.serviceDate, '2000-02-29');
        assert.equal(snapshot.address, scenario === 'empty-optional' ? '' : '123 Test Street');
        assert.equal(snapshot.equipment, scenario === 'empty-optional' ? '' : 'Fixture gas unit');
        assert.equal(snapshot.jobNumber, scenario === 'empty-optional' ? '' : scenario === 'form-job-number' ? 'FORM-123' : 'FIXTURE-21');
        assert.equal(snapshot.technicianId, employeeA);
        assert.equal(snapshot.technicianName, actorA.name);
        assert.equal(snapshot.customerId, customerA);
        assert.equal(snapshot.customerName, 'Synthetic Customer');
        assert.deepEqual(h.calls.render[0].snapshot, snapshot);
      }
    });

    await t.test('missing or invalid actual visit dates reject before rendering or object writes and preserve drafts', async () => {
      const h = harness();
      const original = await fingerprint(sql);
      const dates = [undefined, '', '   ', '2026-2-09', '09/10/2026', '2026-02-29', '1900-02-29',
        '2024-02-30', '2026-04-31', '2026-00-10', '2026-13-10', '2026-09-00', '2026-09-32',
        '2026-09-10T12:00:00Z', ' 2026-09-10 ', 'not-a-date'];
      for (const serviceDate of dates) {
        const data = validData(api);
        if (serviceDate === undefined) delete data.answers.serviceDate;
        else data.answers.serviceDate = serviceDate;
        const draft = await h.store.create(actorA, jobA, 'gas');
        const saved = await h.store.save(actorA, draft.id, draft.revision, data);
        const before = await stored(saved);
        await rejects(h.store.finalize(actorA, draft.id, saved.revision), 400, /service date.*YYYY-MM-DD/i);
        assert.deepEqual(await stored(saved), before);
      }
      assert.equal(h.calls.render.length, 0);
      assert.equal(h.calls.put.length, 0);
      assert.equal(h.calls.get.length, 0);
      assert.equal(h.objects.size, 0);
      assert.deepEqual(await fingerprint(sql), original);
    });

    await t.test('finalization is immutable and concurrent retries store exactly one identical PDF', async () => {
      const h = harness();
      const draft = await ready(h);
      const [final, retry] = await Promise.all([h.store.finalize(actorA, draft.id, draft.revision), h.store.finalize(actorA, draft.id, draft.revision)]);
      assert.deepEqual(final, retry);
      const before = await stored(final);
      assert.equal(before.snapshot.technicianId, actorA.employeeId);
      assert.equal(before.snapshot.technicianName, actorA.name);
      await rejects(h.store.save(actorA, final.id, final.revision, validData(api)), 409);
      await rejects(h.store.addPhoto(actorA, final.id, final.revision, 'overview', '', photoBytes), 409);
      await rejects(h.store.finalize(actorA, final.id, final.revision), 409);
      assert.deepEqual(await h.store.finalize(actorA, draft.id, draft.revision), final);
      const first = await h.store.file(actorA, final.id);
      const second = await h.store.file(actorA, final.id);
      assert.equal(first.type, 'application/pdf');
      assert.deepEqual(first.bytes, second.bytes);
      assert.deepEqual(first.bytes, h.objects.get(before.pdf_key));
      assert.equal(digest(first.bytes), before.pdf_checksum);
      assert.equal(h.calls.render.length, 1);
      assert.equal(h.calls.put.filter(call => call.type === 'application/pdf').length, 1);
      assert.deepEqual(await stored(final), before);
    });

    await t.test('email attaches stored PDF, duplicate actions never resend, and action reuse conflicts', async () => {
      const h = harness();
      const final = await finalized(h);
      const action = randomUUID();
      const recipient = 'customer@example.invalid';
      const results = await Promise.all([h.store.email(actorA, final.id, action, recipient), h.store.email(actorA, final.id, action, recipient)]);
      assert.ok(results.every(result => ['sending', 'accepted'].includes(result.status)));
      assert.deepEqual(await h.store.email(actorA, final.id, action, recipient), { status: 'accepted' });
      assert.equal(h.calls.send.length, 1);
      assert.deepEqual(h.calls.send[0].bytes, (await h.store.file(actorA, final.id)).bytes);
      assert.deepEqual(h.calls.send[0].report, (await stored(final)).snapshot);
      assert.equal(h.calls.send[0].actionId, action);
      await rejects(h.store.email(actorA, final.id, action, 'different@example.invalid'), 409);
      const another = await finalized(h);
      await rejects(h.store.email(actorA, another.id, action, recipient), 409);
      assert.equal(h.calls.send.length, 1);
      const deliveries = await sql`SELECT * FROM hearth_service_report_delivery WHERE org_id=${orgA} AND action_id=${action}`;
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].status, 'accepted');
      const foreignFinal = await finalized(h, actorB, jobB);
      assert.deepEqual(await h.store.email(actorB, foreignFinal.id, action, 'foreign@example.invalid'), { status: 'accepted' });
      assert.equal(h.calls.send.length, 2);
    });

    await t.test('attempted mail errors persist uncertain status and block retries with new action IDs', async () => {
      const h = harness();
      const final = await finalized(h);
      const before = await stored(final);
      const action = randomUUID();
      h.fail.send = true;
      await rejects(h.store.email(actorA, final.id, action, 'customer@example.invalid'), 503, /could not be confirmed/i);
      h.fail.send = false;
      assert.deepEqual(await h.store.email(actorA, final.id, action, 'customer@example.invalid'), { status: 'uncertain' });
      await rejects(h.store.email(actorA, final.id, randomUUID(), 'customer@example.invalid'), 409, /uncertain/i);
      assert.equal(h.calls.send.length, 1);
      const [delivery] = await sql`SELECT * FROM hearth_service_report_delivery WHERE report_id=${final.id}`;
      assert.equal(delivery.status, 'uncertain');
      assert.equal((await h.store.list(actorA, { jobId: jobA })).find(report => report.id === final.id).emailStatus, 'uncertain');
      assert.deepEqual(await stored(final), before);
      assert.deepEqual((await h.store.file(actorA, final.id)).bytes, h.objects.get(before.pdf_key));
    });

    await t.test('an in-flight send is claimed once and blocks a second action until resolved', async () => {
      const h = harness();
      const final = await finalized(h);
      const action = randomUUID();
      let release;
      let entered;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      const send = h.deps.send;
      h.deps.send = async input => { entered(); await gate; await send(input); };
      const pending = h.store.email(actorA, final.id, action, 'customer@example.invalid');
      try {
        await Promise.race([started, pending.then(() => assert.fail('send completed without entering the synthetic sender'))]);
        assert.deepEqual(await h.store.email(actorA, final.id, action, 'customer@example.invalid'), { status: 'sending' });
        await rejects(h.store.email(actorA, final.id, randomUUID(), 'customer@example.invalid'), 409, /pending|uncertain/i);
        const [delivery] = await sql`SELECT status FROM hearth_service_report_delivery WHERE report_id=${final.id}`;
        assert.equal(delivery.status, 'sending');
      } finally { release(); await pending; }
      assert.equal(h.calls.send.length, 1);
      assert.deepEqual(await h.store.email(actorA, final.id, action, 'customer@example.invalid'), { status: 'accepted' });
    });

    await t.test('PDF read failure records failed without attempting mail; new action can retry', async () => {
      const h = harness();
      const final = await finalized(h);
      const action = randomUUID();
      h.fail.get = true;
      await rejects(h.store.email(actorA, final.id, action, 'customer@example.invalid'), 503, /No email was attempted/i);
      assert.equal(h.calls.send.length, 0);
      h.fail.get = false;
      assert.deepEqual(await h.store.email(actorA, final.id, action, 'customer@example.invalid'), { status: 'failed' });
      assert.deepEqual(await h.store.email(actorA, final.id, randomUUID(), 'customer@example.invalid'), { status: 'accepted' });
      assert.equal(h.calls.send.length, 1);
    });

    await t.test('malformed and oversized draft input is rejected atomically', async () => {
      const h = harness();
      const draft = await ready(h);
      const before = await stored(draft);
      const maximum = Math.max(12_000, api.domain.serviceReportLimits.fieldCharacters) + 1;
      const invalid = [null, [], { ...draft.data, fuel: 'wood' }, { ...draft.data, fuel: 'oil' },
        { ...draft.data, answers: [] }, { ...draft.data, answers: { unknownField: 'Injected' } },
        { ...draft.data, answers: { workCompleted: { nested: 'invalid' } } },
        { ...draft.data, answers: { workCompleted: 'x'.repeat(maximum) } },
        { ...draft.data, photoExceptions: { unknownSlot: 'Injected exception' } },
        { ...draft.data, photoExceptions: { overview: 'x'.repeat(maximum) } },
        { ...draft.data, customerAcknowledgment: 'x'.repeat(maximum) }];
      for (const data of invalid) {
        await rejects(h.store.save(actorA, draft.id, draft.revision, data), 400);
        assert.deepEqual(await stored(draft), before);
      }
      await rejects(h.store.email(actorA, draft.id, randomUUID(), 'customer@example.invalid'), 409);
      for (const email of ['a@example.invalid,b@example.invalid', 'a@example.invalid\r\nBcc:b@example.invalid', 'invalid', `${'a'.repeat(255)}@example.invalid`]) {
        await rejects(h.store.email(actorA, draft.id, randomUUID(), email), 400);
      }
      assert.equal(h.calls.send.length, 0);
    });

    await t.test('maximum-length notes survive save and finalization without truncation', async () => {
      const h = harness();
      const data = validData(api);
      data.answers.workCompleted = 'n'.repeat(api.domain.serviceReportLimits.fieldCharacters);
      let draft = await h.store.create(actorA, jobA, 'gas');
      draft = await h.store.save(actorA, draft.id, draft.revision, data);
      assert.equal(draft.data.answers.workCompleted, data.answers.workCompleted);
      const final = await h.store.finalize(actorA, draft.id, draft.revision);
      assert.equal((await stored(final)).snapshot.data.answers.workCompleted, data.answers.workCompleted);
      assert.equal(h.calls.render[0].snapshot.data.answers.workCompleted, data.answers.workCompleted);
    });

    await t.test('aggregate text overflow and unsafe notes cannot become finalized evidence', async () => {
      const h = harness();
      const oversized = validData(api);
      const fields = api.templates.getServiceTemplate('gas').sections.flatMap(section => section.fields).filter(field => field.type === 'textarea');
      let length = 0;
      for (const field of fields) {
        oversized.answers[field.id] = 'n'.repeat(api.domain.serviceReportLimits.fieldCharacters);
        length += api.domain.serviceReportLimits.fieldCharacters;
        if (length > api.domain.serviceReportLimits.totalCharacters) break;
      }
      assert.ok(length > api.domain.serviceReportLimits.totalCharacters, 'fixture must exceed aggregate limit');
      const unsafe = validData(api);
      unsafe.answers.workCompleted = 'Unsafe invisible direction control: \u202e';
      for (const data of [oversized, unsafe]) {
        const draft = await h.store.create(actorA, jobA, 'gas');
        // A draft validator may reject early; otherwise finalization must reject without changing the saved evidence.
        let saved;
        try { saved = await h.store.save(actorA, draft.id, draft.revision, data); }
        catch (error) {
          assert.ok(error instanceof api.store.ReportError);
          assert.equal(error.status, 400);
          assert.equal((await stored(draft)).revision, 0);
          continue;
        }
        const before = await stored(saved);
        await rejects(h.store.finalize(actorA, saved.id, saved.revision), 400);
        assert.deepEqual(await stored(saved), before);
      }
      assert.equal(h.calls.render.length, 0);
      assert.equal(h.calls.put.length, 0);
    });

    await t.test('real server and routes enforce authorization, origin, tenant checks, and private file headers', async () => {
      const h = harness();
      fixture.deps = h.deps;
      fixture.actor = actorA;
      const request = (method, body, origin = 'https://fixture.invalid') => new Request('https://fixture.invalid/api/tech/service-reports', {
        method, headers: { origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const params = (id, photoId) => ({ params: Promise.resolve({ id, photoId }) });
      const create = await api.route.POST(request('POST', { jobId: jobA, fuel: 'gas' }));
      assert.equal(create.status, 201);
      const draft = (await create.json()).report;
      const savedResponse = await api.route.PUT(request('PUT', { id: draft.id, revision: 0, data: validData(api) }));
      assert.equal(savedResponse.status, 200);
      const saved = (await savedResponse.json()).report;
      const finalResponse = await api.route.POST(request('POST', { id: draft.id, revision: saved.revision, action: 'finalize' }));
      assert.equal(finalResponse.status, 200);
      const pdf = await api.pdfRoute.GET(request('GET'), params(draft.id));
      assert.equal(pdf.status, 200);
      assert.equal(pdf.headers.get('cache-control'), 'private, no-store');
      assert.equal(pdf.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(pdf.headers.get('content-type'), 'application/pdf');
      const bytes = Buffer.from(await pdf.arrayBuffer());
      assert.deepEqual(bytes, h.objects.get((await stored(draft)).pdf_key));
      const actionId = randomUUID();
      for (let i = 0; i < 2; i++) {
        const sent = await api.route.POST(request('POST', { action: 'email', id: draft.id, actionId, email: 'customer@example.invalid' }));
        assert.equal(sent.status, 200);
      }
      assert.equal(fixture.smtp.length, 1);
      assert.deepEqual(fixture.smtp[0].attachments[0].content, bytes);
      assert.equal(fixture.smtp[0].attempts, 1);
      assert.ok(fixture.smtp[0].messageId.includes(actionId));
      assert.equal((await api.route.POST(request('POST', { jobId: jobA, fuel: 'gas' }, 'https://foreign.invalid'))).status, 403);
      fixture.actor = { ...actorA, role: 'read_only' };
      assert.equal((await api.pdfRoute.GET(request('GET'), params(draft.id))).status, 403);
      fixture.denied = Response.json({ error: 'Synthetic auth denial' }, { status: 401 });
      assert.equal((await api.route.POST(request('POST', { jobId: jobA, fuel: 'gas' }))).status, 401);
      fixture.denied = null;
      fixture.actor = actorB;
      assert.equal((await api.route.GET(new Request(`https://fixture.invalid/api/tech/service-reports?jobId=${jobA}`))).status, 404);
      assert.equal((await api.route.POST(request('POST', { jobId: jobA, fuel: 'gas' }))).status, 404);
      assert.equal((await api.route.PUT(request('PUT', { id: draft.id, revision: 1, data: validData(api) }))).status, 404);
      assert.equal((await api.route.POST(request('POST', { action: 'finalize', id: draft.id, revision: 1 }))).status, 404);
      assert.equal((await api.route.POST(request('POST', { action: 'email', id: draft.id, actionId: randomUUID(), email: 'foreign@example.invalid' }))).status, 404);
      assert.equal((await api.pdfRoute.GET(request('GET'), params(draft.id))).status, 404);
      assert.equal((await api.photoRoute.GET(request('GET'), params(draft.id, randomUUID()))).status, 404);
      fixture.actor = { ...actorB, role: 'admin' };
      assert.equal((await api.route.GET(new Request(`https://fixture.invalid/api/tech/service-reports?customerId=${customerA}`))).status, 404);
      fixture.actor = actorA;
      const uploadDraft = await h.store.create(actorA, jobA, 'gas');
      const upload = () => {
        const form = new FormData();
        form.set('file', new File([photoBytes], 'fixture.jpg', { type: 'image/jpeg' }));
        form.set('revision', '0'); form.set('slotId', 'overview');
        return new Request('https://fixture.invalid/api/tech/service-reports', { method: 'POST', headers: { origin: 'https://fixture.invalid' }, body: form });
      };
      const uploaded = await api.uploadRoute.POST(upload(), params(uploadDraft.id));
      assert.equal(uploaded.status, 201);
      const photo = (await uploaded.json()).report.photos[0];
      const image = await api.photoRoute.GET(request('GET'), params(uploadDraft.id, photo.id));
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), photoBytes);
      fixture.actor = actorB;
      assert.equal((await api.uploadRoute.POST(upload(), params(uploadDraft.id))).status, 404);
      assert.equal((await api.photoRoute.GET(request('GET'), params(uploadDraft.id, photo.id))).status, 404);
      assert.equal((await api.photoRoute.DELETE(request('DELETE', { revision: 1 }), params(uploadDraft.id, photo.id))).status, 404);
      fixture.actor = actorA;
      assert.equal((await api.photoRoute.DELETE(request('DELETE', { revision: 0 }), params(uploadDraft.id, photo.id))).status, 409);
      assert.equal((await api.photoRoute.DELETE(request('DELETE', { revision: 1 }), params(uploadDraft.id, photo.id))).status, 200);
      assert.equal((await api.photoRoute.GET(request('GET'), params(uploadDraft.id, photo.id))).status, 404);
      assert.equal((await api.route.POST(request('POST', { jobId: 'invalid', fuel: 'gas' }))).status, 400);
      assert.equal((await api.route.PUT(request('PUT', { id: draft.id, revision: -1, data: validData(api) }))).status, 400);
      await rejects(api.server.reportJson(new Request('https://fixture.invalid', { method: 'POST', body: 'x'.repeat(200_001) })), 413);
      await rejects(api.server.reportJson(new Request('https://fixture.invalid', { method: 'POST', body: '{' })), 400);
    });

    await t.test('reapplying migration preserves existing reports, evidence, and delivery actions', async () => {
      const tables = ['hearth_service_reports', 'hearth_service_report_photos', 'hearth_service_report_delivery'];
      const before = await fingerprint(sql, tables);
      const connection = await sql.reserve();
      try { await connection.unsafe(migration); }
      finally { connection.release(); }
      assert.deepEqual(await fingerprint(sql, tables), before);
    });

    await t.test('original fixture tables remain byte-for-byte unchanged after every workflow', async () => {
      assert.deepEqual(await fingerprint(sql), original);
    });
  });
});

test('legacy job photos: atomic append on disposable PostgreSQL', { timeout: 120_000 }, async t => {
  const fixture = { actor: actorA, denied: null, mailConfigured: false, smtp: [], photoBytes };
  const api = await bundle(fixture);
  await withCenterPostgres(async ({ sql }) => {
    fixture.sql = sql;
    await seed(sql);
    const untouchedTables = originalTables.filter(table => table !== 'hearth_jobs_store');
    const untouched = await fingerprint(sql, untouchedTables);
    const originalJobs = await sql`SELECT * FROM hearth_jobs_store ORDER BY id`;
    for (const encoding of ['object', 'string']) {
    const representationTest = (name, work) => t.test(`${encoding} payload: ${name}`, work);
    const savedJob = async jobId => {
      const [row] = await sql`SELECT *,jsonb_typeof(payload) AS representation FROM hearth_jobs_store WHERE id=${jobId}`;
      assert.equal(row.representation, encoding, 'append must preserve the original JSONB representation');
      return { ...row, decodedPayload: encoding === 'string' ? JSON.parse(row.payload) : row.payload };
    };
    const photo = (label, extra = {}) => ({ id: randomUUID(), type: 'progress',
      uri: `data:image/jpeg;base64,${Buffer.from(label).toString('base64')}`, label, caption: `Original ${label}`,
      timestamp: '2026-09-01T12:00:00Z', ...extra });
    async function job(photos = []) {
      const jobId = randomUUID();
      const payload = { id: jobId, customerId: customerA, assignedTechs: [{ id: employeeA }], photos,
        notes: 'Unrelated notes must survive', checklistItems: [{ id: 'check-a', completed: true }],
        status: 'in_progress', updatedAt: '2026-09-01T00:00:00Z', metadata: { arbitraryLegacyField: ['preserve', 42] } };
      await sql`INSERT INTO hearth_jobs_store (id,payload) VALUES (${jobId},${sql.json(encoding === 'string' ? JSON.stringify(payload) : payload)})`;
      assert.deepEqual((await savedJob(jobId)).decodedPayload, payload);
      return { jobId, payload };
    }
    const append = (actor, jobId, photos) => api.legacy.appendLegacyPhotos(sql, actor, jobId, photos);
    const rejects = (operation, status) => assert.rejects(operation, error => {
      assert.ok(error instanceof api.store.ReportError);
      assert.equal(error.status, status);
      return true;
    });

    await representationTest('concurrent appends preserve both incoming photos and every old duplicate URI', async () => {
      const old = photo('old evidence', { checklistItemId: 'old-check', extraLegacyMetadata: { keep: true } });
      const duplicate = photo('duplicate URI', { uri: old.uri, checklistItemId: old.checklistItemId });
      const existing = [old, duplicate, clone(old), photo('separate old photo')];
      const { jobId, payload } = await job(existing);
      const first = photo('first concurrent photo');
      const second = photo('second concurrent photo');
      const results = await Promise.all([append(actorA, jobId, [first]), append(actorA, jobId, [second])]);
      assert.deepEqual(results.map(result => result.photos.length).sort((a, b) => a - b), [5, 6]);
      const row = await savedJob(jobId);
      assert.deepEqual(row.decodedPayload.photos.slice(0, existing.length), existing);
      assert.equal(row.decodedPayload.photos.length, existing.length + 2);
      assert.deepEqual(new Set(row.decodedPayload.photos.slice(existing.length).map(item => item.id)), new Set([first.id, second.id]));
      assert.deepEqual(row.decodedPayload.photos.find(item => item.id === first.id), first);
      assert.deepEqual(row.decodedPayload.photos.find(item => item.id === second.id), second);
      const { photos: _photos, updatedAt: _updatedAt, ...remaining } = row.decodedPayload;
      const { photos: _oldPhotos, updatedAt: _oldUpdatedAt, ...original } = payload;
      assert.deepEqual(remaining, original);
      assert.notEqual(row.updated_at.toISOString(), '2026-09-01T00:00:00.000Z');
    });

    await representationTest('same ID conflicts reject the entire append without changing old data', async () => {
      const old = photo('existing ID', { checklistItemId: 'check-a' });
      const { jobId } = await job([old]);
      const before = await savedJob(jobId);
      for (const conflict of [{ ...old, uri: photo('changed bytes').uri }, { ...old, checklistItemId: 'check-b' }]) {
        await rejects(append(actorA, jobId, [photo('must roll back'), conflict]), 409);
        assert.deepEqual(await savedJob(jobId), before);
      }
      const collision = photo('new in-batch ID');
      await rejects(append(actorA, jobId, [collision, { ...collision, uri: photo('same ID different bytes').uri }]), 409);
      assert.deepEqual(await savedJob(jobId), before);
    });

    await representationTest('same ID and same URI retries are persisted no-ops, including concurrent retries', async () => {
      const { jobId } = await job();
      const incoming = photo('idempotent evidence', { checklistItemId: 'check-a' });
      await append(actorA, jobId, [incoming]);
      const before = await savedJob(jobId);
      const retry = await append(actorA, jobId, [{ ...incoming, caption: 'Retry must not replace old caption', timestamp: '2026-09-10T12:00:00Z' }]);
      assert.deepEqual(retry.photos, [incoming]);
      assert.deepEqual(await savedJob(jobId), before);
      await append(actorA, jobId, [{ ...incoming, id: randomUUID() }]);
      assert.deepEqual(await savedJob(jobId), before, 'same URI and checklist link must not append under a new ID');
      await Promise.all([append(actorA, jobId, [incoming]), append(actorA, jobId, [incoming])]);
      assert.deepEqual(await savedJob(jobId), before);
      const anotherLink = { ...incoming, id: randomUUID(), checklistItemId: 'check-b' };
      const linked = await append(actorA, jobId, [anotherLink]);
      assert.deepEqual(linked.photos, [incoming, anotherLink], 'distinct checklist evidence links must be retained');
      assert.deepEqual((await savedJob(jobId)).decodedPayload.photos, linked.photos);
    });

    await representationTest('concurrent first submissions with the same URI append only once', async () => {
      const { jobId } = await job();
      const incoming = photo('same URI concurrent upload');
      await Promise.all([append(actorA, jobId, [incoming]), append(actorA, jobId, [{ ...incoming, id: randomUUID() }])]);
      const row = await savedJob(jobId);
      assert.equal(row.decodedPayload.photos.length, 1);
      assert.equal(row.decodedPayload.photos[0].uri, incoming.uri);
    });

    await representationTest('foreign organizations cannot use the default-bound legacy store; unassigned technicians are denied', async () => {
      const { jobId } = await job([photo('private legacy photo')]);
      const before = await fingerprint(sql);
      for (const actor of [actorB, { ...actorB, role: 'admin' }, { ...actorA, employeeId: id(13) }]) {
        await rejects(append(actor, jobId, [photo('unauthorized append')]), 404);
      }
      await rejects(append(actorB, jobB, [photo('foreign assigned job still is not its legacy store')]), 404);
      await rejects(append(actorA, randomUUID(), [photo('missing job')]), 404);
      assert.deepEqual(await fingerprint(sql), before);
      const office = { ...actorA, employeeId: id(14), role: 'admin' };
      assert.equal((await append(office, jobId, [photo('authorized default office append')])).photos.length, 2);
      assert.equal((await savedJob(jobId)).decodedPayload.photos.length, 2);
    });

    await representationTest('legacy upload route uses atomic append and rejects invalid, foreign, and cross-origin input', async () => {
      const { jobId, payload } = await job([photo('route legacy evidence')]);
      const incoming = { id: randomUUID(), uri: `data:image/jpeg;base64,${photoBytes.toString('base64')}`, label: 'New evidence', caption: 'Route fixture', checklistItemId: 'check-a' };
      const request = (photos, origin = 'https://fixture.invalid', target = jobId) => new Request('https://fixture.invalid/api/tech/job-photos', {
        method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ jobId: target, photos }),
      });
      const response = await api.legacyRoute.POST(request([incoming]));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const result = (await response.json()).job;
      assert.deepEqual(result.photos[0], payload.photos[0]);
      assert.equal(result.photos[1].id, incoming.id);
      assert.equal(result.photos[1].checklistItemId, incoming.checklistItemId);
      assert.equal(result.photos[1].uri, incoming.uri);
      const before = await savedJob(jobId);
      assert.equal((await api.legacyRoute.POST(request([incoming]))).status, 200);
      assert.deepEqual(await savedJob(jobId), before);
      assert.equal((await api.legacyRoute.POST(request([incoming], 'https://foreign.invalid'))).status, 403);
      fixture.actor = actorB;
      assert.equal((await api.legacyRoute.POST(request([incoming]))).status, 404);
      fixture.actor = { ...actorA, employeeId: id(13) };
      assert.equal((await api.legacyRoute.POST(request([incoming]))).status, 404);
      fixture.actor = actorA;
      for (const invalid of [[], Array(11).fill(incoming), [{ ...incoming, id: 'invalid' }],
        [{ ...incoming, uri: 'https://external.invalid/photo.jpg' }], [{ ...incoming, caption: 'x'.repeat(501) }]]) {
        assert.equal((await api.legacyRoute.POST(request(invalid))).status, 400);
      }
      assert.equal((await api.legacyRoute.POST(request([incoming], 'https://fixture.invalid', 'invalid'))).status, 400);
      assert.deepEqual(await savedJob(jobId), before);
    });
    }

    await t.test('legacy photo operations leave unrelated tables and original jobs unchanged', async () => {
      assert.deepEqual(await fingerprint(sql, untouchedTables), untouched);
      assert.deepEqual(await sql`SELECT * FROM hearth_jobs_store WHERE id IN (${jobA},${jobB}) ORDER BY id`, originalJobs);
    });
  });
});

test('service-report HTTP guards: all eight real handlers reject before protected work', async t => {
  let touches;
  const forbidden = name => {
    touches[name]++;
    throw new Error(`Denied request reached ${name}`);
  };
  const fixture = { actor: actorA, guardCalls: [], actorCalls: 0, mode: 'unauthenticated' };
  Object.defineProperty(fixture, 'sql', { get: () => forbidden('sql') });
  Object.defineProperty(fixture, 'photoBytes', { get: () => forbidden('adapters') });
  Object.defineProperty(fixture, 'mailConfigured', { get: () => forbidden('adapters') });
  fixture.deps = new Proxy({}, { get: () => forbidden('adapters') });
  fixture.smtp = { push: () => forbidden('adapters') };
  fixture.requireActor = () => { fixture.actorCalls++; return fixture.actor; };
  const api = await bundle(fixture);
  fixture.authorize = (route, method) => {
    fixture.guardCalls.push([route, method]);
    if (fixture.mode === 'unauthenticated') return fixture.denied;
    if (fixture.mode === 'policy' && !api.policy.canUseCrmApi(fixture.actor, route, method)) return fixture.denied;
    return null;
  };
  const base = '/api/tech/service-reports';
  const handlers = [
    { module: 'route', method: 'GET', route: base },
    { module: 'route', method: 'POST', route: base },
    { module: 'route', method: 'PUT', route: base },
    { module: 'pdfRoute', method: 'GET', route: `${base}/[id]/pdf` },
    { module: 'uploadRoute', method: 'POST', route: `${base}/[id]/photos` },
    { module: 'photoRoute', method: 'GET', route: `${base}/[id]/photos/[photoId]` },
    { module: 'photoRoute', method: 'DELETE', route: `${base}/[id]/photos/[photoId]` },
    { module: 'legacyRoute', method: 'POST', route: '/api/tech/job-photos' },
  ];
  assert.equal(handlers.length, 8);
  async function invoke(handler, { origin = 'https://fixture.invalid', status, actorCalls, guardDenied = false }) {
    touches = { body: 0, params: 0, sql: 0, adapters: 0 };
    fixture.guardCalls = [];
    fixture.actorCalls = 0;
    fixture.denied = Response.json({ error: 'Synthetic authentication / policy denial' }, { status });
    const url = `https://fixture.invalid${handler.route.replace('[id]', id(61)).replace('[photoId]', id(62))}`;
    const request = new Request(url, { method: handler.method,
      headers: { ...(origin === null ? {} : { origin }), 'content-type': 'application/json' },
      ...(handler.method === 'GET' ? {} : { body: '{"unread":"fixture"}' }),
    });
    Object.defineProperty(request, 'body', { get: () => forbidden('body') });
    for (const method of ['json', 'text', 'arrayBuffer', 'formData', 'blob', 'clone']) {
      Object.defineProperty(request, method, { value: () => forbidden('body') });
    }
    // Passing params is necessary for Next's handler signature; resolving them must remain behind the guard.
    const context = { params: { then: () => forbidden('params') } };
    const response = await api[handler.module][handler.method](request, context);
    const label = `${handler.method} ${handler.route}`;
    assert.equal(response.status, status, label);
    if (guardDenied) assert.equal(response, fixture.denied, `${label} must return the guard's denial unchanged`);
    else {
      assert.equal(response.headers.get('cache-control'), 'private, no-store', label);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', label);
    }
    assert.deepEqual(fixture.guardCalls, [[handler.route, handler.method]], `${label} must use its exact resource and method`);
    assert.equal(fixture.actorCalls, actorCalls, label);
    assert.deepEqual(touches, { body: 0, params: 0, sql: 0, adapters: 0 }, label);
    return response;
  }

  await t.test('all eight unauthenticated handlers return 401 before actor, body, params, SQL, or adapters', async () => {
    fixture.mode = 'unauthenticated';
    for (const handler of handlers) await invoke(handler, { status: 401, actorCalls: 0, guardDenied: true });
  });

  await t.test('real CRM policy denies read_only on every new tech resource and method', async () => {
    fixture.mode = 'policy';
    fixture.actor = { ...actorA, role: 'read_only' };
    for (const handler of handlers) {
      assert.equal(api.policy.canUseCrmApi(fixture.actor, handler.route, handler.method), false);
      assert.equal(api.policy.canUseCrmApi(actorA, handler.route, handler.method), true, 'technician policy positive control');
      await invoke(handler, { status: 403, actorCalls: 0, guardDenied: true });
    }
  });

  await t.test('real reportActor also rejects read_only when the outer guard is mocked permissive', async () => {
    fixture.mode = 'allow';
    fixture.actor = { ...actorA, role: 'read_only' };
    for (const handler of handlers) {
      const response = await invoke(handler, { status: 403, actorCalls: 1 });
      assert.equal((await response.json()).error, 'Report access denied.');
    }
  });

  await t.test('every mutation rejects missing, opaque, and cross-origin requests before protected work', async () => {
    fixture.mode = 'allow';
    fixture.actor = actorA;
    for (const handler of handlers.filter(handler => handler.method !== 'GET')) {
      for (const origin of [null, 'null', 'https://foreign.invalid']) {
        const response = await invoke(handler, { origin, status: 403, actorCalls: 0 });
        assert.equal((await response.json()).error, 'Invalid request origin.');
      }
    }
  });
});

test('real serviceReportContext decodes both legacy representations and denies inaccessible jobs using only fake SQL', async t => {
  const queries = [];
  const fixture = { actor: actorA, denied: null, scenario: 'unknown', encoding: 'object' };
  const payload = { customerId: customerA, customerName: 'Synthetic Customer', assignedTechs: [{ id: employeeA }],
    jobNumber: 'FIXTURE-CONTEXT', title: 'Gas service', scheduledDate: '2026-09-10' };
  fixture.sql = async (strings, ...parameters) => {
    const query = strings.join('?');
    queries.push({ query, parameters });
    if (query.includes('FROM organizations')) {
      assert.ok(query.includes("slug='default'"), 'legacy context must remain bound to the default organization');
      assert.deepEqual(parameters, [fixture.actor.orgId]);
      return fixture.scenario === 'foreign' ? [] : [{ id: orgA }];
    }
    if (query.includes('FROM hearth_jobs_store')) {
      assert.deepEqual(parameters, [jobA]);
      if (fixture.scenario === 'unknown') return [];
      let value = payload;
      if (fixture.scenario === 'unassigned') value = { ...payload, assignedTechs: [{ id: employeeB }] };
      if (fixture.scenario === 'malformed-assignment') value = { ...payload, assignedTechs: null };
      if (fixture.scenario === 'invalid-payload') value = null;
      return [{ payload: fixture.encoding === 'string' ? JSON.stringify(value) : value }];
    }
    if (query.includes('FROM customers') && fixture.scenario === 'assigned') {
      assert.deepEqual(parameters, [orgA, customerA, customerA]);
      return [{ id: customerA, email: 'customer@example.invalid' }];
    }
    assert.fail(`Unexpected SQL after denied job context: ${query}`);
  };
  const api = await bundle(fixture);
  await t.test('decoder accepts object or encoded object and rejects malformed or non-object values', () => {
    assert.deepEqual(api.legacy.decodeLegacyJob(payload), payload);
    assert.deepEqual(api.legacy.decodeLegacyJob(JSON.stringify(payload)), payload);
    for (const invalid of [undefined, null, [], 42, true, '{invalid', 'null', '[]', '42', 'true', '"still a string"']) {
      assert.equal(api.legacy.decodeLegacyJob(invalid), null);
    }
  });
  for (const encoding of ['object', 'string']) {
  fixture.encoding = encoding;
  for (const scenario of ['unknown', 'unassigned', 'malformed-assignment', 'invalid-payload', 'foreign']) {
    await t.test(`${encoding} payload: ${scenario} job is denied before customer or report queries`, async () => {
      fixture.scenario = scenario;
      fixture.actor = scenario === 'foreign' ? actorB : actorA;
      const expectedTables = scenario === 'foreign' ? ['organizations'] : ['organizations', 'hearth_jobs_store'];
      function verifyQueries() {
        assert.equal(queries.length, expectedTables.length);
        for (let i = 0; i < expectedTables.length; i++) assert.ok(queries[i].query.includes(`FROM ${expectedTables[i]}`));
      }
      queries.length = 0;
      await assert.rejects(api.server.serviceReportContext(fixture.actor, jobA), error => {
        assert.ok(error instanceof api.store.ReportError);
        assert.equal(error.status, 404);
        assert.equal(error.message, 'Job not found.');
        return true;
      });
      verifyQueries();
      queries.length = 0;
      const response = await api.route.GET(new Request(`https://fixture.invalid/api/tech/service-reports?jobId=${jobA}`));
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error, 'Job not found.');
      verifyQueries();
    });
  }
  await t.test(`${encoding} payload: assigned-job positive control resolves the real context from fake rows`, async () => {
    fixture.scenario = 'assigned';
    fixture.actor = actorA;
    queries.length = 0;
    const context = await api.server.serviceReportContext(actorA, jobA);
    assert.equal(context.jobId, jobA);
    assert.equal(context.customerId, customerA);
    assert.equal(context.technicianId, employeeA);
    assert.equal(context.technicianName, actorA.name);
    assert.equal(context.suggestedFuel, 'gas');
    assert.equal(queries.length, 3);
  });
  }
});
