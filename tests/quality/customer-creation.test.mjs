import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { centerRun, withCenterPostgres } from './center-local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orgA = id(1), orgB = id(2), userA = id(11), userB = id(12);
const realmA = 'synthetic-realm-a', realmB = 'synthetic-realm-b';
const deniedNetwork = () => { throw new Error('Network access forbidden in customer-creation tests'); };
const sample = {
  displayName: 'Ada Example', firstName: 'Ada', lastName: 'Example', companyName: 'Synthetic Hearth',
  email: 'ada@example.test', phone: '312-555-0101',
  address: { line1: '12 Test Street', line2: 'Suite 204', city: 'Chicago', state: 'IL', zip: '60601' },
};

let compiled;
async function compile() {
  if (compiled) return compiled;
  const files = {
    schema: 'src/db/schema.ts', service: 'src/lib/quickbooks/customer-creation.ts',
    store: 'src/lib/quickbooks/customer-creation-store.ts', route: 'src/app/api/quickbooks/customers/route.ts',
    client: 'src/lib/quickbooks/client.ts',
  };
  const inline = {
    db: 'export * from "creation-schema"; export const db = __fixture.db;',
    auth: `export const authorizeCrmApi = async (...args) => { __fixture.authCalls.push(args); return __fixture.denied; };
      export const requireCrmActor = async () => { __fixture.actorCalls++; return __fixture.actor; };`,
    org: 'export const getOrCreateDefaultOrg = async () => { throw new Error("Creation must not select default org"); };',
    transform: 'export const transformCustomer = () => { throw new Error("Unexpected GET path"); }; export const transformCustomers = transformCustomer;',
    sync: `export const getClientFromTokens = (...args) => { __fixture.clientCalls.push(args); return __fixture.client; };
      export const getCachedCustomers = () => { throw new Error("Unexpected cache access"); };
      export const searchCustomers = getCachedCustomers; export const getCustomerById = getCachedCustomers;
      export const syncCustomers = getCachedCustomers;`,
  };
  const aliases = {
    'creation-schema': 'schema', 'creation-service': 'service', 'creation-store': 'store',
    'creation-route': 'route', 'creation-client': 'client', '@/db': 'db',
    '@/lib/security/crm-access': 'auth', '@/lib/org': 'org',
    '@/lib/quickbooks/transform': 'transform', '@/lib/quickbooks/sync': 'sync',
    '@/lib/quickbooks/customer-creation': 'service', './customer-creation': 'service',
    '@/lib/quickbooks/customer-creation-store': 'store',
  };
  const result = await build({
    stdin: { contents: `export * from 'creation-schema'; export * from 'creation-service';
      export * from 'creation-store'; export { POST } from 'creation-route'; export * from 'creation-client';`,
    loader: 'ts', resolveDir: root },
    absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'customer-creation-offline-boundary', setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: specifier }) => {
        if (['node:crypto', 'drizzle-orm', 'drizzle-orm/pg-core', 'next/server'].includes(specifier)) {
          return { path: specifier, external: true };
        }
        if (!aliases[specifier]) throw new Error(`Unapproved dependency: ${specifier}`);
        return { path: aliases[specifier], namespace: 'creation-fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'creation-fixture' }, async ({ path: name }) => ({
        contents: inline[name] ?? await readFile(path.join(root, files[name]), 'utf8'), loader: 'ts',
      }));
    } }],
  });
  compiled = result.outputFiles[0].text;
  return compiled;
}

async function load(fixture = {}) {
  const loaded = { exports: {} };
  // Only approved sources load; the production db/sync/auth bootstraps never run.
  new Function('require', 'module', 'exports', '__fixture', 'fetch', 'console', await compile())(
    require, loaded, loaded.exports, fixture, fixture.fetch ?? deniedNetwork,
    { ...console, error: (...args) => fixture.errors?.push(args), warn: (...args) => fixture.errors?.push(args) },
  );
  return loaded.exports;
}

const review = error => error.code === 'CUSTOMER_CREATE_REVIEW_REQUIRED' && error.status === 409;
const pgError = code => error => error.code === code || error.cause?.code === code;
const quote = name => `"${name.replaceAll('"', '""')}"`;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

async function createSchema(sql, schema) {
  const dialect = new PgDialect();
  await sql.unsafe(`CREATE TYPE user_role AS ENUM (${schema.userRoleEnum.enumValues.map(literal).join(', ')})`);
  const tables = [schema.organizations, schema.users, schema.customers, schema.auditLogs];
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let ddl = `${quote(column.name)} ${column.getSQLType()}`;
      if (column.primary) ddl += ' PRIMARY KEY';
      if (column.notNull) ddl += ' NOT NULL';
      if (column.isUnique) ddl += ' UNIQUE';
      if (column.default !== undefined) {
        const value = column.default;
        const expression = value && typeof value.getSQL === 'function'
          ? dialect.sqlToQuery(value).sql
          : typeof value === 'object' ? `${literal(JSON.stringify(value))}::jsonb`
            : typeof value === 'string' ? literal(value) : String(value);
        ddl += ` DEFAULT ${expression}`;
      }
      return ddl;
    });
    await sql.unsafe(`CREATE TABLE ${quote(config.name)} (${columns.join(', ')})`);
  }
  // Unlike read-only center fixtures, preserve every FK for these write tables.
  for (const table of tables) {
    const config = getTableConfig(table);
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      await sql.unsafe(`ALTER TABLE ${quote(config.name)} ADD CONSTRAINT ${quote(fk.getName())}
        FOREIGN KEY (${ref.columns.map(c => quote(c.name)).join(', ')})
        REFERENCES ${quote(getTableConfig(ref.foreignTable).name)} (${ref.foreignColumns.map(c => quote(c.name)).join(', ')})
        ON DELETE ${fk.onDelete ?? 'no action'} ON UPDATE ${fk.onUpdate ?? 'no action'}`);
    }
  }
  for (const [orgId, realm, suffix] of [[orgA, realmA, 'a'], [orgB, realmB, 'b']]) {
    await sql`INSERT INTO organizations ${sql({ id: orgId, name: `Synthetic ${suffix}`, slug: `synthetic-${suffix}`,
      qb_realm_id: realm, qb_access_token: `fake-access-${suffix}`, qb_refresh_token: `fake-refresh-${suffix}` })}`;
  }
  for (const [userId, orgId, suffix] of [[userA, orgA, 'a'], [userB, orgB, 'b']]) {
    await sql`INSERT INTO users ${sql({ id: userId, org_id: orgId, email: `actor-${suffix}@example.test`,
      first_name: 'Synthetic', last_name: 'Actor', role: 'admin' })}`;
  }
}

function fakeProvider(service, input = sample, qbId = '101') {
  const state = { writes: 0, reads: 0, rows: [], loseResponse: false };
  return Object.assign(state, {
    async create() {
      state.writes++;
      const customer = { ...service.toQbCustomer(input), Id: qbId };
      state.rows.push(customer);
      if (state.loseResponse) throw new Error('Synthetic lost response');
      return customer;
    },
    async find() { state.reads++; return structuredClone(state.rows); },
  });
}

test('customer creation: parsing, matching, stable scoped request IDs', async t => {
  const service = await load();
  await t.test('normalizes fields and preserves address line 2 through provider mapping', () => {
    const input = service.parseCustomerInput({ ...sample, displayName: '  Ada Example  ',
      address: { ...sample.address, line2: '  Suite 204  ' }, orgId: orgB, realmId: realmB });
    assert.deepEqual(input, sample);
    assert.equal(service.toQbCustomer(input).BillAddr.Line2, 'Suite 204');
    assert.equal(service.parseCustomerInput({ firstName: ' Ada ', lastName: ' Example ' }).displayName, 'Ada Example');
    assert.equal(service.parseCustomerInput({ displayName: 'Company', email: null }).email, '');
  });
  await t.test('rejects malformed bodies, contacts, field types, controls and oversized fields', () => {
    const invalid = [null, [], '', 3, {}, { displayName: '   ' }, { displayName: 5 },
      { ...sample, email: 'invalid' }, { ...sample, email: 'a b@example.test' },
      ...[null, [], 'street'].map(address => ({ ...sample, address })),
      { firstName: 'a'.repeat(60), lastName: 'b'.repeat(60) }];
    for (const [key, max] of Object.entries({ displayName: 100, firstName: 100, lastName: 100, companyName: 255, email: 255, phone: 50 })) {
      invalid.push({ ...sample, [key]: 'x'.repeat(max + 1) }, { ...sample, [key]: {} }, { ...sample, [key]: 'bad\nvalue' });
    }
    for (const [key, max] of Object.entries({ line1: 500, line2: 500, city: 100, state: 50, zip: 20 })) {
      invalid.push({ ...sample, address: { [key]: 'x'.repeat(max + 1) } },
        { ...sample, address: { [key]: false } }, { ...sample, address: { [key]: 'bad\u0000value' } });
    }
    for (const input of invalid) assert.throws(() => service.parseCustomerInput(input),
      error => error.code === 'INVALID_CUSTOMER' && error.status === 400, JSON.stringify(input));
  });
  await t.test('every identity dimension changes the ID; normalized inputs retain it', () => {
    const { customerRequestId: requestId, parseCustomerInput: parse } = service;
    const base = requestId(orgA, realmA, parse(sample));
    assert.match(base, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(requestId(orgA, realmA, parse({ ...sample, firstName: ' Ada ' })), base);
    const ids = [base, requestId(orgB, realmA, sample), requestId(orgA, realmB, sample),
      requestId(orgA, realmA, sample, 'complete'), requestId(orgA, realmA, { ...sample, address: { ...sample.address, line2: 'Suite 205' } })];
    assert.equal(new Set(ids).size, ids.length);
  });
  await t.test('reconciliation requires active numeric identity and every requested field', () => {
    const good = { ...service.toQbCustomer(sample), Id: '123' };
    assert.equal(service.matchesCreatedCustomer(good, sample), true);
    assert.equal(service.matchesCreatedCustomer({ ...good, DisplayName: ' ADA EXAMPLE ' }, sample), true);
    for (const bad of [{ ...good, Active: false }, ...['', 'QB-123', '1'.repeat(51), 123].map(Id => ({ ...good, Id })),
      { ...good, BillAddr: { ...good.BillAddr, Line2: 'Suite 999' } }, { ...good, PrimaryEmailAddr: { Address: 'other@example.test' } },
      { ...good, PrimaryPhone: undefined }, { ...good, CompanyName: 'Other' }, { ...good, GivenName: 'Other' }]) {
      assert.equal(service.matchesCreatedCustomer(bad, sample), false);
    }
  });
});

test('customer creation: actual client requestid and no network', async t => {
  async function clientWith(fetch) {
    const { QuickBooksClient } = await load({ fetch });
    const client = new QuickBooksClient({ clientId: 'synthetic', clientSecret: 'synthetic', redirectUri: 'https://example.test/callback', environment: 'sandbox' });
    client.setRealmId('synthetic-realm');
    client.setTokens({ access_token: 'fake-old', refresh_token: 'fake-refresh', expires_in: 3600 });
    return client;
  }
  await t.test('optional ID is encoded; omission preserves legacy endpoint', async () => {
    const calls = [];
    const client = await clientWith(async (url, init) => { calls.push({ url, init }); return Response.json({ Customer: { Id: '1' } }); });
    await client.createCustomer({ DisplayName: 'Test' }, 'request /?&');
    await client.createCustomer({ DisplayName: 'Test' });
    assert.equal(new URL(calls[0].url).searchParams.get('requestid'), 'request /?&');
    assert.equal(new URL(calls[1].url).search, '');
    assert.equal(new URL(calls[1].url).pathname, '/v3/company/synthetic-realm/customer');
    assert.ok(calls.every(call => call.init.method === 'POST'));
    assert.deepEqual(JSON.parse(calls[0].init.body), { DisplayName: 'Test' });
  });
  await t.test('401 refresh retry retains exact request ID/body; transport loss never retries', async () => {
    const calls = [];
    const client = await clientWith(async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) return new Response('', { status: 401 });
      if (calls.length === 2) return Response.json({ access_token: 'fake-new', refresh_token: 'fake-new-refresh', expires_in: 3600 });
      return Response.json({ Customer: { Id: '1' } });
    });
    await client.createCustomer({ DisplayName: 'Test' }, 'same-request');
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, calls[2].url);
    assert.equal(calls[0].init.body, calls[2].init.body);
    assert.equal(calls[2].init.headers.Authorization, 'Bearer fake-new');
    let attempts = 0;
    const lost = await clientWith(async () => { attempts++; throw new Error('Synthetic transport loss'); });
    await assert.rejects(lost.createCustomer({ DisplayName: 'Test' }, 'lost'), /transport loss/);
    assert.equal(attempts, 1);
  });
});

test('customer creation: durable actual local PostgreSQL and POST route', { timeout: 120_000 }, async t => {
  await withCenterPostgres(async ({ sql, connect, directory }) => {
    const db = drizzle(sql);
    const service = await load({ db });
    await createSchema(sql, service);
    const store = (input = sample, org = orgA, realm = realmA, user = userA) => service.customerCreationStore(org, realm, user, input);
    const execute = (provider, reconcile = false, target = store(), input = sample) => service.executeCustomerCreation(input, target, provider, reconcile);
    const count = async table => Number((await sql`SELECT count(*) AS count FROM ${sql(table)}`)[0].count);
    async function scenario(name, work) {
      await t.test(name, async () => {
        await sql`TRUNCATE customers, audit_logs`;
        await work();
      });
    }

    await scenario('real schema enforces actor/org FKs, defaults and global QB uniqueness', async () => {
      const [settings] = await sql`SELECT current_setting('listen_addresses') AS listeners`;
      assert.equal(settings.listeners, '');
      const fks = await sql`SELECT conrelid::regclass::text AS source, confrelid::regclass::text AS target
        FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`;
      assert.deepEqual(fks.map(fk => `${fk.source}->${fk.target}`).sort(), [
        'audit_logs->organizations', 'audit_logs->users', 'customers->organizations',
        'customers->users', 'users->organizations',
      ]);
      assert.equal(await store().claim(), true);
      const [claim] = await sql`SELECT * FROM audit_logs`;
      assert.equal(claim.user_id, userA);
      assert.equal(claim.org_id, orgA);
      assert.ok(Number.isFinite(Date.parse(claim.created_at)), 'database timestamp default is present');
      await assert.rejects(store({ ...sample, displayName: 'Missing actor' }, orgA, realmA, id(999)).claim(), pgError('23503'));
      await assert.rejects(store(sample, id(999)).claim(), pgError('23503'));
      await sql`INSERT INTO customers (org_id, qb_customer_id, first_name, last_name) VALUES (${orgA}, '501', 'One', 'Test')`;
      const [customer] = await sql`SELECT * FROM customers`;
      assert.ok(customer.id);
      assert.equal(customer.is_active, true);
      await assert.rejects(sql`INSERT INTO customers (org_id, qb_customer_id, first_name, last_name) VALUES (${orgB}, '501', 'Two', 'Test')`, pgError('23505'));
    });

    await scenario('concurrent identical creates commit a claim before exactly one provider write', async () => {
      const provider = fakeProvider(service);
      let entered, release;
      const started = new Promise(resolve => { entered = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const create = provider.create;
      provider.create = async () => {
        assert.equal(await store().claimed(), true, 'claim visible from separate DB query before provider write');
        entered();
        await gate;
        return create();
      };
      const first = execute(provider);
      try {
        await Promise.race([started, first.then(() => assert.fail('Create completed before provider gate'))]);
        const others = await Promise.allSettled(Array.from({ length: 12 }, () => execute(provider)));
        assert.ok(others.every(result => result.status === 'rejected' && review(result.reason)));
      } finally { release(); }
      const result = await first;
      assert.equal(result.recovered, false);
      assert.equal(provider.writes, 1);
      assert.equal(provider.reads, 0);
      assert.equal(await count('customers'), 1);
      assert.equal(await count('audit_logs'), 2);
      const [saved] = await sql`SELECT * FROM customers`;
      assert.equal(saved.address_line2, 'Suite 204');
      assert.equal(saved.source, 'quickbooks');
      assert.equal(saved.id, result.customer.localId);
      const [completion] = await sql`SELECT * FROM audit_logs WHERE action = 'complete'`;
      assert.equal(completion.entity_id, saved.id);
      assert.deepEqual(completion.new_value, { realmId: realmA, localId: saved.id, qbCustomerId: '101' });
    });

    await scenario('a pending attempt survives process restart and cannot replay provider create', async () => {
      const password = randomBytes(24).toString('hex');
      await sql.unsafe(`CREATE ROLE creation_restart LOGIN PASSWORD ${literal(password)}`);
      await sql`GRANT USAGE ON SCHEMA public TO creation_restart`;
      await sql`GRANT SELECT, INSERT ON organizations, users, customers, audit_logs TO creation_restart`;
      // A separate process writes the claim and exits before contacting any provider.
      const child = `const postgres = require('postgres'); const { drizzle } = require('drizzle-orm/postgres-js');
        const sql = postgres(${JSON.stringify({ host: directory, port: 55439, database: 'postgres', user: 'creation_restart', password, ssl: false, max: 1 })});
        const fixture = { db: drizzle(sql) }; const loaded = { exports: {} };
        new Function('require','module','exports','__fixture','fetch','console',${JSON.stringify(await compile())})(require,loaded,loaded.exports,fixture,()=>{throw Error('Network forbidden')},console);
        (async () => { try { if (!await loaded.exports.customerCreationStore(${JSON.stringify(orgA)},${JSON.stringify(realmA)},${JSON.stringify(userA)},${JSON.stringify(sample)}).claim()) throw Error('Claim not inserted'); }
          finally { await sql.end(); } })().catch(error => { console.error(error); process.exitCode=1; });`;
      centerRun(process.execPath, ['-e', child], { cwd: root });
      const reloaded = await load({ db: drizzle(connect('creation_restart', password)) });
      const provider = fakeProvider(service);
      await assert.rejects(reloaded.executeCustomerCreation(sample, reloaded.customerCreationStore(orgA, realmA, userA, sample), provider, false), review);
      assert.equal(provider.writes, 0);
      assert.equal(provider.reads, 0);
      assert.equal(await count('customers'), 0);
      assert.equal(await count('audit_logs'), 1);
    });

    await scenario('lost response reconciles by reads and persists exactly one local customer', async () => {
      const provider = fakeProvider(service);
      provider.loseResponse = true;
      await assert.rejects(execute(provider), review);
      assert.equal(provider.rows.length, 1);
      assert.equal(await count('customers'), 0);
      await assert.rejects(execute(provider), review);
      const outcomes = await Promise.all(Array.from({ length: 8 }, () => execute(provider, true)));
      assert.ok(outcomes.every(outcome => outcome.recovered));
      assert.equal(new Set(outcomes.map(outcome => outcome.customer.localId)).size, 1);
      assert.equal(provider.writes, 1);
      assert.ok(provider.reads >= 1);
      assert.equal(await count('customers'), 1);
      assert.equal(await count('audit_logs'), 2);
      assert.equal((await sql`SELECT address_line2 FROM customers`)[0].address_line2, sample.address.line2);
    });

    await scenario('completed requests return durable identity without provider reads or writes', async () => {
      const provider = fakeProvider(service);
      const first = await execute(provider);
      const restarted = await load({ db });
      const forbidden = { create: deniedNetwork, find: deniedNetwork };
      for (const reconcile of [false, true]) {
        const result = await restarted.executeCustomerCreation(sample, restarted.customerCreationStore(orgA, realmA, userA, sample), forbidden, reconcile);
        assert.equal(result.recovered, true);
        assert.deepEqual(result.customer, first.customer);
      }
      assert.equal(await count('customers'), 1);
      assert.equal(provider.writes, 1);
    });

    await scenario('invalid provider create result keeps pending claim and never persists or retries', async () => {
      const provider = fakeProvider(service);
      provider.create = async () => {
        provider.writes++;
        return { ...service.toQbCustomer(sample), Id: 'not-a-qb-id' };
      };
      await assert.rejects(execute(provider), review);
      await assert.rejects(execute(provider), review);
      assert.equal(provider.writes, 1);
      assert.equal(await count('customers'), 0);
      assert.equal(await count('audit_logs'), 1);
      assert.equal(await store().completed(), null);
    });

    await scenario('missing local customer or corrupt completion record cannot cause a provider replay', async () => {
      const provider = fakeProvider(service);
      await execute(provider);
      const [completion] = await sql`SELECT new_value FROM audit_logs WHERE action = 'complete'`;
      for (const value of [{ ...completion.new_value, realmId: realmB },
        { ...completion.new_value, localId: id(999) }, { realmId: realmA },
        { ...completion.new_value, qbCustomerId: '999' }]) {
        await sql`UPDATE audit_logs SET new_value = ${JSON.stringify(value)}::jsonb WHERE action = 'complete'`;
        await assert.rejects(execute(provider));
        assert.equal(provider.writes, 1);
        assert.equal(provider.reads, 0);
      }
      await sql`UPDATE audit_logs SET new_value = ${JSON.stringify(completion.new_value)}::jsonb WHERE action = 'complete'`;
      await sql`DELETE FROM customers`;
      await assert.rejects(execute(provider));
      assert.equal(provider.writes, 1);
      assert.equal(await count('customers'), 0);
    });

    await scenario('unclaimed, absent, ambiguous, mismatched and failed reconciliations fail closed', async () => {
      const provider = fakeProvider(service);
      await assert.rejects(execute(provider, true), review);
      assert.equal(provider.reads, 0);
      assert.equal(await store().claim(), true);
      const good = { ...service.toQbCustomer(sample), Id: '201' };
      for (const rows of [[], [good, { ...good, Id: '202' }], [{ ...good, BillAddr: { ...good.BillAddr, Line2: 'Other' } }], [{ ...good, Active: false }]]) {
        provider.rows = rows;
        await assert.rejects(execute(provider, true), review);
        assert.equal(await count('customers'), 0);
      }
      provider.find = async () => { throw new Error('Synthetic query failure'); };
      await assert.rejects(execute(provider, true), review);
      assert.equal(provider.writes, 0);
      assert.equal(await count('audit_logs'), 1);
    });

    await scenario('foreign-org QB ID collision never overwrites or completes and cannot replay', async () => {
      await sql`INSERT INTO customers (org_id, qb_customer_id, first_name, last_name, address_line2)
        VALUES (${orgB}, '101', 'Foreign', 'Owner', 'Do not overwrite')`;
      const before = await sql`SELECT * FROM customers`;
      const provider = fakeProvider(service);
      await assert.rejects(execute(provider), review);
      await assert.rejects(execute(provider, true), review);
      await assert.rejects(execute(provider), review);
      assert.deepEqual(await sql`SELECT * FROM customers`, before);
      assert.equal(await store().completed(), null);
      assert.equal(await count('audit_logs'), 1);
      assert.equal(provider.writes, 1);
    });

    await scenario('DB failure before durable claim prevents every provider write', async () => {
      const provider = fakeProvider(service);
      await assert.rejects(execute(provider, false, store(sample, orgA, realmA, id(999))), pgError('23503'));
      assert.equal(provider.writes, 0);
      assert.equal(provider.reads, 0);
      assert.equal(await count('audit_logs'), 0);
      const failedRead = { ...store(), completed: async () => { await sql`SELECT 1 / 0`; } };
      await assert.rejects(execute(provider, false, failedRead), pgError('22012'));
      assert.equal(provider.writes, 0);
      assert.equal(await count('customers'), 0);
    });

    await scenario('completion failure rolls customer back, retains claim and recovers without replay', async () => {
      await sql.unsafe(`CREATE FUNCTION reject_creation_completion() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action = 'complete' THEN RAISE EXCEPTION 'synthetic completion failure'; END IF; RETURN NEW; END $$`);
      await sql`CREATE TRIGGER reject_creation_completion BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_creation_completion()`;
      const provider = fakeProvider(service);
      try {
        await assert.rejects(execute(provider), review);
        assert.equal(await count('customers'), 0, 'customer and completion must be atomic');
        assert.equal(await count('audit_logs'), 1);
        await assert.rejects(execute(provider), review);
        assert.equal(provider.writes, 1);
      } finally { await sql`DROP TRIGGER reject_creation_completion ON audit_logs`; }
      const result = await execute(provider, true);
      assert.equal(result.recovered, true);
      assert.equal(provider.writes, 1);
      assert.equal(await count('customers'), 1);
    });

    await scenario('org and realm changes create independent durable requests', async () => {
      try {
        for (const [org, realm, user, qbId] of [[orgA, realmA, userA, '301'], [orgB, realmA, userB, '302'], [orgA, realmB, userA, '303']]) {
          await sql`UPDATE organizations SET qb_realm_id = ${realm} WHERE id = ${org}`;
          const provider = fakeProvider(service, sample, qbId);
          await execute(provider, false, store(sample, org, realm, user));
          assert.equal(provider.writes, 1);
        }
        assert.equal(await count('customers'), 3);
        const claims = await sql`SELECT id FROM audit_logs WHERE action = 'request'`;
        assert.equal(new Set(claims.map(row => row.id)).size, 3);
      } finally {
        await sql`UPDATE organizations SET qb_realm_id = ${realmA} WHERE id = ${orgA}`;
        await sql`UPDATE organizations SET qb_realm_id = ${realmB} WHERE id = ${orgB}`;
      }
    });

    await scenario('reconnect during provider call rejects old-realm result, retains claim and prevents completion', async () => {
      const provider = fakeProvider(service);
      let entered, release;
      const started = new Promise(resolve => { entered = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const create = provider.create;
      provider.create = async () => {
        const customer = await create();
        entered();
        await gate;
        return customer;
      };
      const attempt = execute(provider).then(value => ({ value }), error => ({ error }));
      try {
        await Promise.race([started, attempt.then(() => assert.fail('Creation ended before provider gate'))]);
        assert.equal(provider.rows.length, 1, 'external customer exists in captured old realm');
        assert.equal(await store().claimed(), true);
        // Commit the reconnect from a separate query while the old response is delayed.
        await sql`UPDATE organizations SET qb_realm_id = 'synthetic-reconnected' WHERE id = ${orgA}`;
        release();
        const outcome = await attempt;
        assert.ok(outcome.error && review(outcome.error), 'old-realm result must require review');
        assert.equal(await count('customers'), 0);
        assert.equal(await store().completed(), null);
        assert.equal(await store().claimed(), true);
        assert.equal(await count('audit_logs'), 1);
        const [claim] = await sql`SELECT * FROM audit_logs`;
        assert.equal(claim.id, service.customerRequestId(orgA, realmA, sample));
        assert.equal(claim.action, 'request');
        assert.deepEqual(claim.new_value, { realmId: realmA });
        await assert.rejects(execute(provider), review);
        await assert.rejects(execute(provider, true), review);
        assert.equal(provider.writes, 1, 'neither retry nor reconciliation may replay the create');
        assert.equal(provider.reads, 1);
        assert.equal(await count('customers'), 0, 'reconciliation cannot persist the old-realm result either');
        assert.equal(await count('audit_logs'), 1);
        const [org] = await sql`SELECT qb_realm_id FROM organizations WHERE id = ${orgA}`;
        assert.equal(org.qb_realm_id, 'synthetic-reconnected');
      } finally {
        release();
        await attempt;
        await sql`UPDATE organizations SET qb_realm_id = ${realmA} WHERE id = ${orgA}`;
      }
    });

    async function routeFixture(overrides = {}) {
      const provider = fakeProvider(service);
      const fixture = {
        db, actor: { orgId: orgA, employeeId: userA, clerkUserId: 'synthetic-clerk-not-a-uuid' },
        authCalls: [], actorCalls: 0, clientCalls: [], createCalls: [], queries: [], errors: [], denied: null,
        client: {
          async createCustomer(payload, requestId) { fixture.createCalls.push({ payload, requestId }); return provider.create(); },
          async query(query) { fixture.queries.push(query); return provider.find(); },
          getTokens: () => null,
        }, ...overrides,
      };
      const route = await load(fixture);
      const { NextRequest } = require('next/server');
      async function invoke(body = sample, options = {}) {
        const request = new NextRequest('http://offline.invalid/api/quickbooks/customers', {
          method: 'POST', headers: { 'Content-Type': 'application/json',
            cookie: 'qb_access_token=attacker-access; qb_refresh_token=attacker-refresh; qb_realm_id=attacker-realm' },
          body: options.raw ?? JSON.stringify(body),
        });
        const response = await route.POST(request);
        return { response, body: await response.json() };
      }
      return { fixture, provider, invoke };
    }

    await scenario('actual POST ignores cookie/body org and uses authorized org credentials + scoped requestid', async () => {
      const { fixture, provider, invoke } = await routeFixture();
      const { response, body } = await invoke({ ...sample, orgId: orgB, realmId: realmB,
        qbAccessToken: 'attacker', employeeId: userB, requestId: 'attacker-request' });
      assert.equal(response.status, 201, JSON.stringify(body));
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(body.success, true);
      assert.deepEqual(fixture.authCalls, [['/api/quickbooks/customers', 'POST']]);
      assert.deepEqual(fixture.clientCalls, [['fake-access-a', 'fake-refresh-a', realmA]]);
      assert.equal(fixture.createCalls[0].requestId, service.customerRequestId(orgA, realmA, sample));
      assert.equal(fixture.createCalls[0].payload.BillAddr.Line2, sample.address.line2);
      assert.equal((await sql`SELECT org_id FROM customers`)[0].org_id, orgA);
      const retry = await invoke(sample);
      assert.equal(retry.response.status, 200);
      assert.equal(retry.body.customer.localId, body.customer.localId);
      assert.equal(provider.writes, 1);
      assert.equal(fixture.createCalls.length, 1);
    });

    await scenario('actual POST validation/authorization failures never select a provider', async () => {
      const { fixture, invoke } = await routeFixture();
      for (const body of [null, {}, { ...sample, action: 'create-again' }, { ...sample, address: [] }]) {
        assert.equal((await invoke(body)).response.status, 400);
      }
      assert.equal((await invoke(sample, { raw: '{' })).response.status, 400);
      assert.equal(fixture.actorCalls, 0);
      assert.equal(fixture.clientCalls.length, 0);
      fixture.denied = Response.json({ error: 'Denied' }, { status: 403 });
      assert.equal((await invoke(sample)).response.status, 403);
      assert.equal(fixture.actorCalls, 0);
      assert.equal(await count('audit_logs'), 0);
    });

    await scenario('actual POST missing org credentials cannot fall back to attacker cookies', async () => {
      const { fixture, provider, invoke } = await routeFixture();
      await sql`UPDATE organizations SET qb_access_token = NULL WHERE id = ${orgA}`;
      try {
        const result = await invoke({ ...sample, orgId: orgB });
        assert.equal(result.response.status, 409);
        assert.equal(result.body.code, 'QB_NOT_CONNECTED');
        assert.equal(fixture.clientCalls.length, 0);
        assert.equal(provider.writes, 0);
        assert.equal(await count('audit_logs'), 0);
      } finally { await sql`UPDATE organizations SET qb_access_token = 'fake-access-a' WHERE id = ${orgA}`; }
    });

    await scenario('actual POST changing authorized org or realm uses a distinct provider request ID', async () => {
      const { fixture, invoke } = await routeFixture();
      let sequence = 600;
      fixture.client.createCustomer = async (payload, requestId) => {
        fixture.createCalls.push({ payload, requestId });
        return { ...payload, Id: String(++sequence) };
      };
      assert.equal((await invoke()).response.status, 201);
      fixture.actor = { orgId: orgB, employeeId: userB };
      assert.equal((await invoke()).response.status, 201);
      await sql`UPDATE organizations SET qb_realm_id = 'synthetic-reconnected' WHERE id = ${orgB}`;
      try {
        assert.equal((await invoke()).response.status, 201);
        assert.deepEqual(fixture.clientCalls.map(call => call[2]), [realmA, realmB, 'synthetic-reconnected']);
        assert.equal(new Set(fixture.createCalls.map(call => call.requestId)).size, 3);
        assert.equal(await count('customers'), 3);
      } finally { await sql`UPDATE organizations SET qb_realm_id = ${realmB} WHERE id = ${orgB}`; }
    });

    await scenario('actual POST lost-response recovery reads, persists and returns the durable customer', async () => {
      const { fixture, provider, invoke } = await routeFixture();
      provider.loseResponse = true;
      const lost = await invoke();
      assert.equal(lost.response.status, 409);
      assert.equal(lost.body.code, 'CUSTOMER_CREATE_REVIEW_REQUIRED');
      assert.equal((await invoke()).response.status, 409);
      const recovered = await invoke({ ...sample, action: 'reconcile' });
      assert.equal(recovered.response.status, 200);
      assert.equal(recovered.body.recovered, true);
      assert.equal(provider.writes, 1);
      assert.equal(fixture.queries.length, 1);
      assert.match(fixture.queries[0], /SELECT \* FROM Customer WHERE DisplayName = 'Ada Example' MAXRESULTS 10/);
      assert.equal(await count('customers'), 1);
    });

    await scenario('actual POST missing actor FK returns generic failure without provider write', async () => {
      const { fixture, provider, invoke } = await routeFixture({ actor: { orgId: orgA, employeeId: id(999) } });
      const result = await invoke();
      assert.equal(result.response.status, 503);
      assert.equal(result.body.code, 'CUSTOMER_CREATE_REVIEW_REQUIRED');
      assert.doesNotMatch(JSON.stringify(result.body), /23503|audit_logs|foreign key|INSERT/i);
      assert.equal(provider.writes, 0);
      assert.equal(fixture.createCalls.length, 0);
      assert.equal(await count('audit_logs'), 0);
    });

    await scenario('actual POST reconcile escapes apostrophes and backslashes without creating', async () => {
      const input = service.parseCustomerInput({ ...sample, displayName: "O'Example \\ Test" });
      await store(input).claim();
      const { fixture, provider, invoke } = await routeFixture();
      provider.rows = [{ ...service.toQbCustomer(input), Id: '701' }];
      const result = await invoke({ ...input, action: 'reconcile' });
      assert.equal(result.response.status, 200, JSON.stringify(result.body));
      assert.equal(fixture.queries[0], "SELECT * FROM Customer WHERE DisplayName = 'O\\'Example \\\\ Test' MAXRESULTS 10");
      assert.equal(provider.writes, 0);
      assert.equal(provider.reads, 1);
      assert.equal(await count('customers'), 1);
    });

    await scenario('actual POST rotated tokens persist only to matching org, realm and old refresh token', async () => {
      for (const change of ['none', 'realm', 'refresh']) {
        await sql`TRUNCATE customers, audit_logs`;
        const { fixture, provider, invoke } = await routeFixture();
        fixture.client.getTokens = () => ({ access_token: 'fake-rotated', refresh_token: 'fake-rotated-refresh', expires_in: 3600 });
        fixture.client.createCustomer = async () => {
          const customer = await provider.create();
          if (change === 'realm') await sql`UPDATE organizations SET qb_realm_id = 'concurrent-realm' WHERE id = ${orgA}`;
          if (change === 'refresh') await sql`UPDATE organizations SET qb_refresh_token = 'concurrent-refresh' WHERE id = ${orgA}`;
          return customer;
        };
        try {
          const result = await invoke();
          assert.equal(result.response.status, change === 'realm' ? 409 : 201, JSON.stringify(result.body));
          assert.equal(provider.writes, 1);
          if (change === 'realm') {
            assert.equal(result.body.code, 'CUSTOMER_CREATE_REVIEW_REQUIRED');
            assert.notEqual(result.body.success, true);
            assert.equal(await count('customers'), 0);
            assert.equal(await store().completed(), null);
            assert.equal(await store().claimed(), true);
            assert.equal(await count('audit_logs'), 1);
          } else {
            assert.equal(result.body.success, true);
            assert.equal(await count('customers'), 1);
            assert.equal(await count('audit_logs'), 2);
          }
          const [own] = await sql`SELECT * FROM organizations WHERE id = ${orgA}`;
          const [foreign] = await sql`SELECT * FROM organizations WHERE id = ${orgB}`;
          assert.equal(own.qb_access_token, change === 'none' ? 'fake-rotated' : 'fake-access-a');
          assert.equal(own.qb_refresh_token, change === 'none' ? 'fake-rotated-refresh'
            : change === 'refresh' ? 'concurrent-refresh' : 'fake-refresh-a');
          assert.equal(own.qb_realm_id, change === 'realm' ? 'concurrent-realm' : realmA);
          if (change === 'none') assert.ok(Number.isFinite(Date.parse(own.qb_token_expires_at)));
          assert.equal(foreign.qb_access_token, 'fake-access-b');
          assert.equal(foreign.qb_refresh_token, 'fake-refresh-b');
        } finally {
          await sql`UPDATE organizations SET qb_access_token = 'fake-access-a', qb_refresh_token = 'fake-refresh-a', qb_realm_id = ${realmA} WHERE id = ${orgA}`;
        }
      }
    });

    await scenario('actual POST token persistence failure cannot turn durable success into failure', async () => {
      await sql.unsafe(`CREATE FUNCTION reject_creation_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic token persistence failure'; END $$`);
      await sql`CREATE TRIGGER reject_creation_tokens BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION reject_creation_tokens()`;
      const { fixture, invoke } = await routeFixture();
      fixture.client.getTokens = () => ({ access_token: 'fake-rotated', refresh_token: 'fake-rotated-refresh', expires_in: 3600 });
      try {
        const result = await invoke();
        assert.equal(result.response.status, 201, JSON.stringify(result.body));
        assert.equal(result.body.success, true);
        assert.equal(await count('customers'), 1);
        assert.equal(await count('audit_logs'), 2);
        assert.ok(fixture.errors.some(args => args[0] === 'Customer token persistence needs review.'));
        const [org] = await sql`SELECT qb_access_token FROM organizations WHERE id = ${orgA}`;
        assert.equal(org.qb_access_token, 'fake-access-a');
        assert.doesNotMatch(JSON.stringify(fixture.errors), /fake-rotated|synthetic token persistence failure/);
      } finally { await sql`DROP TRIGGER reject_creation_tokens ON organizations`; }
    });
    t.diagnostic('Actual service/store/POST/client; synthetic provider only; fresh socket-only PostgreSQL; schema-derived defaults, uniqueness and all relevant FKs; separate-process durable claim.');
  });
});
