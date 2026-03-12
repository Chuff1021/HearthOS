#!/usr/bin/env node
import fs from 'node:fs/promises';

const QDRANT = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = {};
  try { j = JSON.parse(t || '{}'); } catch {}
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return j;
}

async function scroll(model) {
  const j = await fetchJson(`${QDRANT}/collections/fireplace_manual_chunks/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 800, with_payload: true, with_vector: false, filter: { must: [{ key: 'model', match: { value: model } }] } }),
  });
  return j?.result?.points || [];
}

function hasFanEvidence(text) {
  const t = String(text || '').toLowerCase();
  return /fan|blower|kit|circulation|optional components|accessories/.test(t);
}

async function run() {
  const model = 'Novus 36';
  const chunks = await scroll(model);
  const hits = chunks.filter((c) => hasFanEvidence(c?.payload?.chunk_text || c?.payload?.normalized_content || ''));

  const report = {
    timestamp: new Date().toISOString(),
    model,
    manual_chunks_scanned: chunks.length,
    fan_kit_evidence_hits: hits.length,
    sample_hits: hits.slice(0, 5).map((h) => ({ page: h?.payload?.page_number || null, source_url: h?.payload?.source_url || null, text: String(h?.payload?.chunk_text || '').slice(0, 240) })),
    recoverable: hits.length > 0,
    conclusion: hits.length > 0
      ? 'recoverable_from_existing_chunks'
      : 'no_recoverable_fan_kit_source_in_current_novus36_chunks',
    required_next_source_if_unrecoverable: hits.length > 0 ? null : 'model-specific Novus 36 parts/service manual or section containing fan/blower kit references',
  };

  await fs.writeFile('ops/NOVUS36_EVIDENCE_AUDIT.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
