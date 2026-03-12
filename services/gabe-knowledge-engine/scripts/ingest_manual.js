#!/usr/bin/env node
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : fallback;
}

const manualPath = process.argv[2];
if (!manualPath) {
  console.error('Usage: node scripts/ingest_manual.js /var/lib/gabe/manuals/file.pdf --brand "FPX" --model "42 Apex NexGen" --title "FPX 42 Apex NexGen Manual" --url "https://...pdf"');
  process.exit(1);
}

const brand = arg('brand', 'Unknown');
const model = arg('model', path.basename(manualPath, path.extname(manualPath)));
const title = arg('title', `${brand} ${model} Manual`);
const sourceUrl = arg('url', `file://${manualPath}`);

const base = path.basename(manualPath, path.extname(manualPath));
const outDir = `/var/lib/gabe/manuals/_work/${base}`;
fs.mkdirSync(outDir, { recursive: true });

const meta = {
  file_path: manualPath,
  brand,
  model,
  manual_title: title,
  source_url: sourceUrl,
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

console.log('[1/7] Extracting PDF text...');
execSync(`python3 scripts/pdf_extract_text.py "${manualPath}" "${outDir}/pages.json"`, { stdio: 'inherit' });

console.log('[2/7] Extracting diagram images...');
execSync(`python3 scripts/pdf_extract_images.py "${manualPath}" "${outDir}/images"`, { stdio: 'inherit' });

console.log('[3/7] OCR pass...');
execSync(`python3 scripts/ocr_images.py "${outDir}/images" "${outDir}/ocr.json"`, { stdio: 'inherit' });

console.log('[4/7] Diagram classification...');
execSync(`python3 scripts/classify_diagrams.py "${outDir}/images" "${outDir}/diagram_types.json"`, { stdio: 'inherit' });

console.log('[5/7] Diagram interpretation...');
execSync(`python3 scripts/interpret_diagrams.py "${outDir}" "${outDir}/diagram_structured.json"`, { stdio: 'inherit' });

console.log('[6/7] Manual chunk upsert...');
execSync(`node scripts/upsert_manual_chunks.js "${outDir}"`, { stdio: 'inherit' });

console.log('[7/7] Diagram upsert...');
execSync(`node scripts/upsert_diagrams.js "${outDir}"`, { stdio: 'inherit' });

console.log('✅ Ingestion completed:', manualPath);
