#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const workDir = process.argv[2];
if (!workDir) {
  console.error('usage: node upsert_manual_chunks.js <work_dir>');
  process.exit(1);
}

// Stub: hook to /ingest/manual in next pass.
fs.writeFileSync(path.join(workDir, 'manual_upsert.stub.json'), JSON.stringify({ ok: true, note: 'manual upsert stub' }, null, 2));
console.log('manual upsert stub done');
