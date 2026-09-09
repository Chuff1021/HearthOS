import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { withCenterPostgres } from './center-local-postgres.mjs';

test('website inbox migration, import and follow-up isolation', async t => {
  const dir = await mkdtemp('/tmp/hearthos-inbox-test-');
  try {
    await build({ entryPoints: ['src/lib/website-inbox/store.ts'], bundle: true, platform: 'node', format: 'esm', outfile: `${dir}/store.mjs` });
    const { createWebsiteInboxStore } = await import(pathToFileURL(`${dir}/store.mjs`).href);
    await withCenterPostgres(async ({ sql }) => {
      await sql.unsafe('CREATE TABLE organizations (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid REFERENCES organizations(id), first_name text, last_name text, is_active boolean DEFAULT true)');
      const migration = await readFile('scripts/sql/website-inbox.sql', 'utf8');
      const migrationConnection = await sql.reserve();
      try { await migrationConnection.unsafe(migration); await migrationConnection.unsafe(migration); }
      finally { migrationConnection.release(); }
      const org = '11111111-1111-4111-8111-111111111111';
      const foreign = '22222222-2222-4222-8222-222222222222';
      const employee = '33333333-3333-4333-8333-333333333333';
      const id = '44444444-4444-4444-8444-444444444444';
      const actionId = '55555555-5555-4555-8555-555555555555';
      await sql`INSERT INTO organizations VALUES (${org}),(${foreign})`;
      await sql`INSERT INTO users (id,org_id,first_name,last_name) VALUES (${employee},${org},'Test','Operator')`;
      const store = createWebsiteInboxStore(sql);
      const item = { id, type: 'order', createdAt: '2026-09-09T12:00:00Z', name: 'Example', email: 'test@example.invalid', phone: '', subject: 'Parts request', message: 'Please call', total: 100 };
      const page = async () => ({ items: [item], nextCursor: null });
      await t.test('repeat imports create only one request', async () => {
        assert.equal((await store.syncPage(org,'website',page)).imported,1);
        assert.equal((await store.syncPage(org,'website',page)).imported,0);
        assert.equal((await store.list(org,'website','','all',0)).total,1);
      });
      const action = { id,actionId,revision:0,status:'follow_up',followUpAt:'2026-09-12',note:'Called; return call Friday' };
      await t.test('status and note save atomically with a dated author', async () => {
        assert.equal((await store.update(org,'website',employee,action)).status,200);
        const activity = await store.activity(org,'website',id);
        assert.equal(activity.length,1); assert.equal(activity[0].actor_name,'Test Operator');
        assert.equal((await store.list(org,'website','','follow_up',0)).total,1);
      });
      await t.test('repeat same action is idempotent', async () => {
        assert.equal((await store.update(org,'website',employee,action)).status,200);
        assert.equal((await store.activity(org,'website',id)).length,1);
      });
      await t.test('conflicting/reused action and stale revisions fail', async () => {
        assert.equal((await store.update(org,'website',employee,{...action,note:'different'})).status,409);
        assert.equal((await store.update(org,'website',employee,{...action,actionId:'66666666-6666-4666-8666-666666666666'})).status,409);
      });
      await t.test('reimport never overwrites local follow-up', async () => {
        await store.syncPage(org,'website',page);
        const [record] = (await store.list(org,'website','','all',0)).items;
        assert.equal(record.status,'follow_up'); assert.equal(record.revision,1);
      });
      await t.test('foreign organization cannot read or mutate requests', async () => {
        assert.equal((await store.list(foreign,'website','','all',0)).total,0);
        assert.equal((await store.activity(foreign,'website',id)).length,0);
        assert.equal((await store.update(foreign,'website',employee,action)).status,404);
      });
      await t.test('same source id in another organization is independent', async () => {
        assert.equal((await store.syncPage(foreign,'website',page)).imported,1);
        assert.equal((await store.update(foreign,'website',employee,{...action,revision:0})).status,403);
      });
      await t.test('failed export preserves checkpoint', async () => {
        await store.syncPage(org,'website',async () => ({items:[],nextCursor:'next-page'}));
        await assert.rejects(store.syncPage(org,'website',async cursor => { assert.equal(cursor,'next-page'); throw Error('Unavailable'); }));
        const [state] = await sql`SELECT cursor FROM hearth_website_inbox_sync WHERE org_id=${org}`;
        assert.equal(state.cursor,'next-page');
      });
      await t.test('literal wildcard search and separate sources stay isolated', async () => {
        assert.equal((await store.list(org,'website','%','all',0)).total,0);
        assert.equal((await store.list(org,'other','','all',0)).total,0);
      });
    });
  } finally { await rm(dir,{recursive:true,force:true}); }
});
