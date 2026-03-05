#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const workDir = process.argv[2];
if (!workDir) {
  console.error('usage: node upsert_manual_chunks.js <work_dir>');
  process.exit(1);
}

const metaPath = path.join(workDir, 'meta.json');
if (!fs.existsSync(metaPath)) {
  throw new Error(`missing ${metaPath} (brand/model/manual_title/source_url required)`);
}
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

const body = {
  file_path: meta.file_path,
  manual_title: meta.manual_title,
  manufacturer: meta.brand,
  model: meta.model,
  source_url: meta.source_url,
};

fetch('http://127.0.0.1:4100/ingest/manual', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
  .then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    fs.writeFileSync(path.join(workDir, 'manual_upsert.result.json'), JSON.stringify(j, null, 2));
    console.log('manual upsert done', j);
  })
  .catch((e) => {
    console.error('manual upsert failed', e.message || e);
    process.exit(1);
  });
