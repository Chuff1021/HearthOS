#!/usr/bin/env node
/*
  GABE manual ingestion pipeline (production scaffold)
  Steps:
  1) PDF text extraction
  2) image extraction
  3) OCR pass on images
  4) diagram classification
  5) vision interpretation + structured diagram JSON
  6) upsert manual chunks to fireplace_manuals
  7) upsert diagram records to fireplace_diagrams
*/

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const manualPath = process.argv[2];
if (!manualPath) {
  console.error('Usage: node scripts/ingest_manual.js /var/lib/gabe/manuals/file.pdf');
  process.exit(1);
}

const base = path.basename(manualPath, path.extname(manualPath));
const outDir = `/var/lib/gabe/manuals/_work/${base}`;
fs.mkdirSync(outDir, { recursive: true });

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
