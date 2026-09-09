import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Use the independently reviewed recovery helper; never connect to live storage.
const helper = process.env.HEARTHOS_RECOVERY_HELPER;
if (!helper || !process.argv[2]) throw new Error('Recovery helper and encrypted archive required');
const { withLocalPostgres, restoreEncryptedArchive, fingerprintTables } = await import(pathToFileURL(helper));
const migration = await readFile(new URL('../sql/website-inbox.sql', import.meta.url), 'utf8');
await withLocalPostgres(async cluster => {
  const archiveSha256 = await restoreEncryptedArchive(cluster, process.argv[2]);
  const before = await fingerprintTables(cluster.sql);
  assert(!Object.hasOwn(before, 'hearth_website_inbox'), 'Expected pre-inbox backup');
  for (let attempt = 0; attempt < 2; attempt++) cluster.psql(migration);
  const after = await fingerprintTables(cluster.sql, Object.keys(before));
  assert.deepEqual(after, before, 'Original records must remain byte-identical');
  const added = await fingerprintTables(cluster.sql, ['hearth_website_inbox', 'hearth_website_inbox_activity', 'hearth_website_inbox_sync']);
  assert(Object.values(added).every(table => table.count === 0));
  console.log(JSON.stringify({ ok: true, archiveSha256, unchangedOriginalTables: Object.keys(before).length, emptyNewTables: Object.keys(added).length, migrationReplays: 2 }));
});
