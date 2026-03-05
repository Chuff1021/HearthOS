#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const workDir = process.argv[2];
if (!workDir) {
  console.error('usage: node upsert_diagrams.js <work_dir>');
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(path.join(workDir, 'meta.json'), 'utf8'));
const structuredPath = path.join(workDir, 'diagram_structured.json');
if (!fs.existsSync(structuredPath)) {
  console.log('no diagram_structured.json, skipping');
  process.exit(0);
}

const structured = JSON.parse(fs.readFileSync(structuredPath, 'utf8'));
const diagrams = (structured.diagrams || []).map((d) => ({
  brand: meta.brand,
  model: meta.model,
  diagram_type: d.diagram_type,
  page: d.page,
  manual_url: meta.source_url,
  image_path: d.image_path,
  structured_data: d.structured_data,
  source_text: d.structured_data?.raw_ocr || '',
}));

if (!diagrams.length) {
  console.log('no diagrams to upsert');
  process.exit(0);
}

fetch('http://127.0.0.1:4100/ingest/diagrams', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ diagrams }),
})
  .then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    fs.writeFileSync(path.join(workDir, 'diagram_upsert.result.json'), JSON.stringify(j, null, 2));
    console.log('diagram upsert done', j);
  })
  .catch((e) => {
    console.error('diagram upsert failed', e.message || e);
    process.exit(1);
  });
