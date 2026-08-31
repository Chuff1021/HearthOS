import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const archive = process.env.HEARTHOS_RECOVERY_ARCHIVE
  || '/Users/fireplace/HearthOS-secure-backups/hearthos-production-2026-08-31T14-11-44-173Z.dump.enc';
const postgresBin = process.env.POSTGRES_BIN || '/usr/local/bin';
const openssl = process.env.OPENSSL_BIN || '/usr/local/bin/openssl';
const port = process.env.HEARTHOS_REHEARSAL_PORT || '55432';
const workDir = await mkdtemp(path.join(os.tmpdir(), 'hearthos-tenant-rehearsal.'));
const dataDir = path.join(workDir, 'data');
const dumpPath = path.join(workDir, 'production.dump');
const logPath = path.join(workDir, 'postgres.log');
const database = 'hearthos_rehearsal';
let started = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${(result.stderr || result.stdout || 'unknown error').trim()}`);
  }
  return result.stdout.trim();
}

function pg(command) {
  return path.join(postgresBin, command);
}

function query(sql) {
  return run(pg('psql'), ['-h', '127.0.0.1', '-p', port, '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
}

function snapshot() {
  return JSON.parse(query(`
    select json_build_object(
      'customers', (select count(*) from customers),
      'invoices', (select count(*) from invoices),
      'payments', (select count(*) from payments),
      'inventory', (select count(*) from inventory_items),
      'vendors', (select count(*) from vendors),
      'estimates', (select count(*) from estimates),
      'purchaseOrders', (select count(*) from purchase_orders),
      'bills', (select count(*) from bills),
      'jobs', (select count(*) from hearth_jobs_store),
      'meeksJobs', (select count(*) from hearth_meeks_jobs_store),
      'projects', (select count(*) from hearth_projects),
      'invoiceTotal', (select coalesce(sum(total_amount), 0)::text from invoices),
      'invoiceBalance', (select coalesce(sum(balance), 0)::text from invoices),
      'paymentTotal', (select coalesce(sum(amount), 0)::text from payments)
    )::text
  `));
}

try {
  const passphrase = run('security', [
    'find-generic-password', '-a', os.userInfo().username,
    '-s', 'HearthOS Production Backup Encryption', '-w',
  ]);
  run(openssl, [
    'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000',
    '-pass', 'env:HEARTHOS_BACKUP_PASSPHRASE', '-in', archive, '-out', dumpPath,
  ], { env: { ...process.env, HEARTHOS_BACKUP_PASSPHRASE: passphrase } });

  run(pg('initdb'), ['-D', dataDir, '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run(pg('pg_ctl'), ['-D', dataDir, '-l', logPath, '-o', `-p ${port}`, 'start']);
  started = true;
  run(pg('createdb'), ['-h', '127.0.0.1', '-p', port, database]);
  run(pg('pg_restore'), ['-h', '127.0.0.1', '-p', port, '-d', database, '--no-owner', '--no-acl', dumpPath]);

  const before = snapshot();
  const migrationDir = path.resolve('src/db/migrations');
  const migrations = (await readdir(migrationDir))
    .filter((name) => /^00(1[3-9]|2\d)_.*\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    const file = path.join(migrationDir, migration);
    run(pg('psql'), ['-h', '127.0.0.1', '-p', port, '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', file]);
    run(pg('psql'), ['-h', '127.0.0.1', '-p', port, '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', file]);
  }
  const after = snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Production reconciliation changed after migrations.\nBefore: ${JSON.stringify(before)}\nAfter: ${JSON.stringify(after)}`);
  }

  const isolation = JSON.parse(query(`
    begin;
    with second_org as (
      insert into organizations (name, slug, onboarding_status)
      values ('Tenant Rehearsal Dealer', 'tenant-rehearsal-dealer', 'in_progress')
      returning id
    ), default_org as (
      select id from organizations where slug = 'default' limit 1
    ), existing_customer as (
      select qb_customer_id from customers where qb_customer_id is not null limit 1
    ), inserted_default as (
      insert into hearth_core_data_store_tenant (org_id, key, payload)
      select id, 'tenant-isolation-probe', '{"owner":"default"}'::jsonb from default_org
      on conflict (org_id, key) do update set payload = excluded.payload
      returning org_id
    ), inserted_second as (
      insert into hearth_core_data_store_tenant (org_id, key, payload)
      select id, 'tenant-isolation-probe', '{"owner":"second"}'::jsonb from second_org
      returning org_id
    ), customer_second as (
      insert into customers (org_id, qb_customer_id, first_name, last_name, is_active)
      select second_org.id, existing_customer.qb_customer_id, 'Tenant', 'Isolation', true
      from second_org cross join existing_customer
      returning id
    )
    select json_build_object(
      'sameStoreKeyAcrossOrganizations', (
        (select count(*) = 1 from inserted_default)
        and (select count(*) = 1 from inserted_second)
        and (select org_id from inserted_default) <> (select org_id from inserted_second)
      ),
      'sameQuickBooksIdAcrossOrganizations', (
        (select count(*) = 1 from existing_customer)
        and (select count(*) = 1 from customer_second)
      ),
      'gabeOrgRequired', (
        select is_nullable = 'NO' from information_schema.columns
        where table_name = 'gabe_chat_sessions' and column_name = 'org_id'
      ),
      'timeOrgRequired', (
        select is_nullable = 'NO' from information_schema.columns
        where table_name = 'hearth_time_entries' and column_name = 'org_id'
      )
    )::text;
    rollback;
  `).split('\n').find((line) => line.startsWith('{')));
  if (Object.values(isolation).some((value) => value !== true)) {
    throw new Error(`Tenant isolation rehearsal failed: ${JSON.stringify(isolation)}`);
  }

  const rls = JSON.parse(query(`
    begin;
    create role hearthos_app_rehearsal nologin;
    grant usage on schema public to hearthos_app_rehearsal;
    grant select on customers to hearthos_app_rehearsal;
    alter table customers enable row level security;
    with second_org as (
      insert into organizations (name, slug, onboarding_status)
      values ('RLS Rehearsal Dealer', 'rls-rehearsal-dealer', 'in_progress')
      returning id
    )
    insert into customers (org_id, qb_customer_id, first_name, last_name, is_active)
    select id, 'rls-cross-tenant-probe', 'RLS', 'Isolation', true from second_org;
    select set_config('app.current_org_id', (select id::text from organizations where slug = 'default' limit 1), true);
    set local role hearthos_app_rehearsal;
    select json_build_object(
      'onlyCurrentOrganizationVisible', (select count(distinct org_id) = 1 from customers),
      'crossTenantDirectLookupBlocked', (select not exists(select 1 from customers where qb_customer_id = 'rls-cross-tenant-probe'))
    )::text;
    reset role;
    rollback;
  `).split('\n').find((line) => line.startsWith('{')));
  if (Object.values(rls).some((value) => value !== true)) {
    throw new Error(`Row-level security rehearsal failed: ${JSON.stringify(rls)}`);
  }

  console.log(JSON.stringify({ ok: true, migrations, reconciliation: after, isolation, rls }, null, 2));
} finally {
  if (started) {
    try { run(pg('pg_ctl'), ['-D', dataDir, 'stop', '-m', 'fast']); } catch {}
  }
  if (process.env.HEARTHOS_KEEP_REHEARSAL !== 'true') await rm(workDir, { recursive: true, force: true });
  else console.error(`Rehearsal cluster retained at ${workDir}`);
}
