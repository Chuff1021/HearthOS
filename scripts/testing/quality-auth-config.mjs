import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';

// Retain only identity configuration, never database/provider/storage authority.
// Vercel output and downloaded values are not printed or placed in the worktree.
process.umask(0o077);
const directory = await mkdtemp('/tmp/hearthos-auth-config-');
try {
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  const file = path.join(directory, 'download.env');
  const pulled = spawnSync('vercel', ['env', 'pull', file, '--environment=production', '--yes'], {
    cwd: '/Users/fireplace/HearthOS-estimate-hotfix', env, encoding: 'utf8', timeout: 60000,
  });
  if (pulled.status !== 0) throw new Error('Could not securely retrieve identity configuration. No candidate was started.');
  const values = parseEnv(await readFile(file, 'utf8'));
  const keys = ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'HEARTHOS_EMPLOYEE_LOGIN_ALIASES'];
  const identity = Object.fromEntries(keys.filter(key => values[key]).map(key => [key, values[key]]));
  const mode = identity.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') ? 'test' : 'production';
  if (!identity.CLERK_SECRET_KEY || !identity.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new Error('Identity credentials unavailable; sign-in acceptance remains blocked.');
  if (process.argv.includes('--retain')) {
    const output = path.join(directory, 'identity.json');
    await writeFile(output, JSON.stringify(identity), { mode: 0o600 });
    await rm(file);
    console.log(JSON.stringify({ mode, aliasConfigured: Boolean(identity.HEARTHOS_EMPLOYEE_LOGIN_ALIASES), identityFile: output }));
  } else {
    console.log(JSON.stringify({ mode, aliasConfigured: Boolean(identity.HEARTHOS_EMPLOYEE_LOGIN_ALIASES), credentialsAvailable: true }));
    await rm(directory, { recursive: true, force: true });
  }
} catch (error) {
  await rm(directory, { recursive: true, force: true });
  throw error;
}
