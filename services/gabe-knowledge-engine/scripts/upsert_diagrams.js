#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const workDir = process.argv[2];
if (!workDir) {
  console.error('usage: node upsert_diagrams.js <work_dir>');
  process.exit(1);
}

// Stub: hook to fireplace_diagrams collection in next pass.
fs.writeFileSync(path.join(workDir, 'diagram_upsert.stub.json'), JSON.stringify({ ok: true, note: 'diagram upsert stub' }, null, 2));
console.log('diagram upsert stub done');
