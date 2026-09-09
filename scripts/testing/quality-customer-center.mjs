import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { centerIsolatedEnvironment } from '../../tests/quality/center-local-postgres.mjs';

// No dotenv, application bootstrap, inherited provider settings, or network DB.
const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.execPath, ['--test', 'tests/quality/center-postgres.test.mjs'], {
  cwd: root,
  env: centerIsolatedEnvironment(),
  stdio: 'inherit',
  timeout: 180_000,
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
