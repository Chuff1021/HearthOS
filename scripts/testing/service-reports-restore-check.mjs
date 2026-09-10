import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const helper = path.resolve('../HearthOS-dealer-readiness/scripts/testing/local-postgres.mjs');
const { withLocalPostgres, restoreEncryptedArchive, fingerprintTables } = await import(pathToFileURL(helper));
const migration = await readFile(new URL('../sql/service-reports.sql', import.meta.url), 'utf8');
await withLocalPostgres(async cluster => {
  const archiveSha256 = await restoreEncryptedArchive(cluster, process.argv[2]);
  const before = await fingerprintTables(cluster.sql);
  assert(!Object.hasOwn(before, 'hearth_service_reports'), 'Expected pre-service-report backup');
  for (let attempt = 0; attempt < 2; attempt++) cluster.psql(migration);
  assert.deepEqual(await fingerprintTables(cluster.sql, Object.keys(before)), before, 'Original records must remain byte-identical');
  const added = await fingerprintTables(cluster.sql, ['hearth_service_reports','hearth_service_report_photos','hearth_service_report_delivery']);
  assert(Object.values(added).every(table => table.count === 0));
  console.log(JSON.stringify({ok:true,archiveSha256,unchangedOriginalTables:Object.keys(before).length,emptyNewTables:Object.keys(added).length,migrationReplays:2}));
});
