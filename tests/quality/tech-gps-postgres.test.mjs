import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { withCenterPostgres } from './center-local-postgres.mjs';

const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orgA = id(1), orgB = id(2), techA = id(11), techB = id(12), inactive = id(13);

test('GPS routes and real SQL: tenant isolation, identity, shift, persistence and failure handling', async t => {
  await withCenterPostgres(async ({ sql }) => {
    await sql`create table users (id uuid primary key, org_id uuid not null, is_active boolean not null)`;
    await sql`insert into users values (${techA}, ${orgA}, true), (${techB}, ${orgB}, true), (${inactive}, ${orgA}, false)`;
    const fixture = { sql, actor: { employeeId: techA, orgId: orgA, role: 'technician', clerkUserId: 'clerk-a', name: 'Test Tech', email: 'test@example.invalid' },
      denied: null, open: true, broken: false, tableFailure: true };
    const result = await build({
      stdin: { contents: 'export * from "@/app/api/tech/locations/route"; export * from "@/lib/tech-location-store";', loader: 'ts', resolveDir: process.cwd() },
      bundle: true, write: false, platform: 'node', format: 'cjs',
      plugins: [{ name: 'gps-offline', setup(b) {
        b.onResolve({ filter: /.*/ }, ({ path }) => {
          if (path === 'next/server') return { path, external: true };
          return { path, namespace: 'fixture' };
        });
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, async ({ path }) => {
          const mocks = {
            '@/lib/security/crm-access': 'export const authorizeCrmApi = async () => f.denied; export const requireCrmActor = async () => f.actor;',
            '@/lib/time-entry-store': 'export const getOpenTimeEntry = async ids => { if (!ids.includes(f.actor.employeeId)) throw Error("Identity mismatch"); return f.open ? {id:"test-shift"} : null; };',
            postgres: 'export default () => async (...args) => { if (f.broken) throw Error("private database secret"); if(f.tableFailure) { f.tableFailure=false; throw Error("transient table setup failure"); } return f.sql(...args); };',
          };
          if (path in mocks) return { contents: mocks[path], loader: 'ts' };
          const files = {
            '@/app/api/tech/locations/route': 'src/app/api/tech/locations/route.ts',
            '@/lib/tech-location-store': 'src/lib/tech-location-store.ts',
            '@/lib/tech-gps-validation': 'src/lib/tech-gps-validation.ts',
          };
          if (!files[path]) throw Error(`Unexpected dependency: ${path}`);
          return { contents: await readFile(files[path], 'utf8'), loader: 'ts' };
        });
      } }],
    });
    const loaded = { exports: {} };
    new Function('require', 'module', 'exports', 'f', 'process', result.outputFiles[0].text)(
      require, loaded, loaded.exports, fixture, { env: { DATABASE_URL: 'offline-fixture-only' } });
    const api = loaded.exports;
    const point = () => ({ lat: 37, lng: -93, accuracy: 10, timestamp: new Date().toISOString() });
    const post = (body = point(), origin = 'https://offline.invalid') => api.POST(new Request('https://offline.invalid/api/tech/locations', {
      method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    const get = (query = '') => api.GET(new Request(`https://offline.invalid/api/tech/locations${query}`));

    await t.test('transient storage initialization fails honestly then recovers on next request', async () => {
      assert.equal((await post()).status, 503);
      assert.equal((await post()).status, 201);
      assert.equal((await sql`select count(*)::int as n from tech_locations_live`)[0].n, 1);
    });
    await t.test('spoofed employee and organization fields cannot alter ownership', async () => {
      const response = await post({ ...point(), techId: techB, orgId: orgB, techName: 'Spoof' });
      const body = await response.json(); assert.equal(response.status, 201);
      assert.equal(body.point.techId, techA); assert.equal(body.point.techName, 'Test Tech');
    });
    await t.test('foreign and inactive employees cannot be written through the store', async () => {
      await assert.rejects(api.addLocationPoint({ ...point(), techId: techB }, orgA), /access denied/);
      await assert.rejects(api.addLocationPoint({ ...point(), techId: inactive }, orgA), /access denied/);
      await api.addLocationPoint({ ...point(), techId: techB }, orgB);
      assert.deepEqual((await api.getLatestLocationsByTech(orgA)).map(p => p.techId), [techA]);
      assert.deepEqual(await api.getLocationHistory(techB, 10, orgA), []);
      assert.deepEqual(await api.getMileageSummary(techB, orgA), { dayMiles: 0, weekMiles: 0, monthMiles: 0 });
    });
    await t.test('technician history ignores another employee ID; admin history still enforces tenant', async () => {
      let body = await (await get(`?techId=${techB}&summary=true`)).json();
      assert.ok(body.history.length); assert.ok(body.history.every(p => p.techId === techA));
      fixture.actor.role = 'admin';
      body = await (await get(`?techId=${techB}&limit=NaN`)).json(); assert.deepEqual(body.history, []);
      fixture.actor.role = 'technician';
    });
    await t.test('clock-out denies writes but owner retains existing tracking policy', async () => {
      fixture.open = false;
      assert.equal((await post()).status, 403);
      assert.equal((await (await get('?session=true')).json()).trackingAllowed, false);
      fixture.actor.role = 'owner';
      assert.equal((await (await get('?session=true')).json()).trackingAllowed, true);
      assert.equal((await post()).status, 201);
      fixture.actor.role = 'technician'; fixture.open = true;
    });
    await t.test('invalid coordinates and cross-origin submissions create no rows', async () => {
      const before = await sql`select count(*)::int as n from tech_locations_live`;
      assert.equal((await post({ ...point(), lat: 999 })).status, 400);
      assert.equal((await post(point(), 'https://other.invalid')).status, 403);
      fixture.denied = Response.json({ error: 'Unauthorized' }, { status: 401 });
      assert.equal((await post()).status, 401); assert.equal((await get()).status, 401); fixture.denied = null;
      assert.deepEqual(await sql`select count(*)::int as n from tech_locations_live`, before);
    });
    await t.test('old signals remain last-known records with original timestamp; DB failures never report success', async () => {
      await sql`update tech_locations_live set ts = now() - interval '7 days' where tech_id = ${techB}`;
      const old = (await api.getLatestLocationsByTech(orgB))[0];
      assert.ok(Date.now() - Date.parse(old.timestamp) > 6 * 86400000);
      fixture.broken = true;
      const response = await post(); assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /private database secret/);
      assert.equal((await get()).status, 503); fixture.broken = false;
      assert.equal((await get()).headers.get('cache-control'), 'private, no-store');
    });
  });
});
