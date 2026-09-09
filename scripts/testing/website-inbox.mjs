import { spawnSync } from 'node:child_process';
import { centerIsolatedEnvironment } from '../../tests/quality/center-local-postgres.mjs';
const result = spawnSync(process.execPath, ['--test','tests/quality/website-inbox-postgres.test.mjs'], {
  env: centerIsolatedEnvironment(), stdio: 'inherit', timeout: 180000,
});
process.exitCode = result.status ?? 1;
