#!/usr/bin/env node
import fs from 'node:fs/promises';

const arg = process.argv.find((a) => a.startsWith('--baseUrl='));
const baseUrl = (arg ? arg.split('=')[1] : 'https://hearth-os.vercel.app').replace(/\/$/, '');

const tests = [
  { id: 'b8e6dbb9-0414-4428-a2fc-1f2b77fca91d', title: 'FPX Apex NexGen-Hybrid (rev)', brand: 'FPX', q: 'What venting type is required for this model?' },
  { id: '19005c37-352c-4fcc-a045-fc6090a5cd68', title: 'Lopi AGP Pellet Insert', brand: 'Lopi', q: 'What are the minimum clearances noted for this unit?' },
  { id: 'cfc51084-d9e8-43b1-977f-22cfd9189ffb', title: 'Heatilator Novus 36', brand: 'Heatilator', q: 'What gas type/manifold notes are specified?' },
  { id: 'ab0a72da-6a9d-4bf8-b491-2e3a0b2c8691', title: 'Heat & Glo COSMO-I30', brand: 'Heat & Glo', q: 'What installation warning should the tech not miss?' },
  { id: '4249e604-7ee1-410c-9149-fccd85dbabed', title: 'Travis Industries SPF_42ApexNG_682', brand: 'Travis Industries', q: 'What page should I check for venting tables?' },
  { id: 'fe2a75f2-2acc-4a3c-9b32-0a2af1d031aa', title: 'HHT-shared 4004_307', brand: 'HHT-shared', q: 'Summarize startup/lighting instructions for this unit.' },
  { id: '7803c570-d067-4a6a-b0c3-71693bec3c01', title: 'FPX ProBuilder 42 CleanFace', brand: 'FPX', q: 'What venting type is required for this model?' },
  { id: '30a44907-63e8-43cc-961f-762c4c010c47', title: 'Lopi DVL EmberGlo GSR2 Insert (rev)', brand: 'Lopi', q: 'What are the minimum clearances noted for this unit?' },
  { id: '58742e5c-51f6-490d-b8f8-764f17a058c7', title: 'Heatilator Icon i1000', brand: 'Heatilator', q: 'What gas type/manifold notes are specified?' },
  { id: 'ea6527a0-1fc5-4262-9d56-ec9970758994', title: 'Heat & Glo Supreme-I30', brand: 'Heat & Glo', q: 'What installation warning should the tech not miss?' }
];

async function run() {
  const results = [];
  for (const t of tests) {
    const payload = {
      selectedManual: { manualId: t.id, manualTitle: t.title },
      messages: [{ role: 'user', content: t.q }],
    };
    const res = await fetch(`${baseUrl}/api/gabe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    const pass = data?.source_type === 'manual'
      && Boolean(data?.selected_manual_title)
      && data?.answered_from_selected_manual === true
      && data?.cited_manual_title === t.title
      && Number(data?.cited_page_number || 0) > 0;

    results.push({
      selected_manual: { id: t.id, title: t.title, brand: t.brand },
      question: t.q,
      answer: data?.answer || null,
      source_type: data?.source_type || null,
      selected_manual_title: data?.selected_manual_title || null,
      answered_from_selected_manual: data?.answered_from_selected_manual ?? null,
      cited_manual_title: data?.cited_manual_title || null,
      cited_page_number: data?.cited_page_number || null,
      pass,
      mismatch_notes: pass ? '' : 'manual trust field mismatch',
    });
  }

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.length - passCount;
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      deployment: baseUrl,
      suite: 'post-promote strict manual-scoped',
      tested: results.length,
      passCount,
      failCount,
      brands: [...new Set(results.map((r) => r.selected_manual.brand))],
    },
    tests: results,
  };

  await fs.writeFile('ops/MANUAL_SCOPED_QA_REPORT.json', JSON.stringify(report, null, 2));

  const baseline = {
    timestamp: report.generatedAt,
    deployment: baseUrl,
    status: failCount === 0 ? 'known-good' : 'not-known-good',
    manuals_total: 315,
    active_manuals: 310,
    manual_sections: 8638,
    qa: { tested: results.length, passCount, failCount },
  };
  await fs.writeFile('ops/PRODUCTION_KNOWN_GOOD_BASELINE.json', JSON.stringify(baseline, null, 2));

  console.log(JSON.stringify(report.summary, null, 2));
  if (failCount > 0) process.exit(2);
}

run().catch((e) => { console.error(e); process.exit(1); });
