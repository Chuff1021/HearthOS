import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { centerIsolatedEnvironment } from '../../tests/quality/center-local-postgres.mjs';

const result = spawnSync(process.execPath, ['--test', 'tests/quality/service-reports-postgres.test.mjs'], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)),
  env: centerIsolatedEnvironment(),
  stdio: 'inherit',
  timeout: 180_000,
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
