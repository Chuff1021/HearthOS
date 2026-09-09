import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

export function centerIsolatedEnvironment() {
  return { PATH: '/usr/local/bin:/usr/bin:/bin', TMPDIR: '/tmp', LC_ALL: 'C', LANG: 'C', TZ: 'UTC', NODE_ENV: 'test',
    ...(process.env.POSTGRES_BIN ? { POSTGRES_BIN: process.env.POSTGRES_BIN } : {}) };
}

export function centerRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60_000,
    ...options, env: centerIsolatedEnvironment(),
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

// Adapted from the readiness helper; deliberately no restore or credential APIs.
export async function withCenterPostgres(work) {
  const directory = await mkdtemp('/tmp/hearthos-center-');
  await chmod(directory, 0o700);
  const data = path.join(directory, 'data');
  const passwordFile = path.join(directory, 'password');
  const password = randomBytes(32).toString('hex');
  const bin = process.env.POSTGRES_BIN || '/usr/local/bin';
  if (!path.isAbsolute(bin)) throw new Error('POSTGRES_BIN must be an absolute tool directory.');
  const pg = (name, args) => centerRun(path.join(bin, name), args);
  let initialized = false;
  const clients = [];
  try {
    await writeFile(passwordFile, password, { mode: 0o600 });
    pg('initdb', ['-D', data, '-U', 'center_seed', '--auth-local=scram-sha-256', '--auth-host=reject', '--pwfile', passwordFile, '--no-locale', '--encoding=UTF8']);
    initialized = true;
    try {
      pg('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-p 55439 -h '' -k ${directory}`, '-w', 'start']);
    } catch (error) {
      throw new Error(`${error.message}\n${await readFile(path.join(directory, 'postgres.log'), 'utf8')}`);
    }
    const connect = (user, localPassword, debug) => {
      const client = postgres({
        host: directory, port: 55439, database: 'postgres', user, password: localPassword,
        ssl: false, max: 4, idle_timeout: 0, connect_timeout: 5, debug,
        connection: { timezone: 'UTC', application_name: 'offline-center-quality' },
      });
      clients.push(client);
      return client;
    };
    await work({ sql: connect('center_seed', password), connect, directory });
  } finally {
    try {
      for (const client of clients) await client.end({ timeout: 3 });
    } finally {
      // Check status even after a partial startup failure, before removing data.
      const running = initialized && spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, 'status'], {
        env: centerIsolatedEnvironment(), stdio: 'ignore', timeout: 5_000,
      }).status === 0;
      if (running) pg('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
      await rm(directory, { recursive: true, force: true });
    }
  }
}
