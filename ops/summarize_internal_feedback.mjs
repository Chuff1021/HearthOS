#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const dayArg = process.argv.find((a) => a.startsWith('--date='));
const day = (dayArg ? dayArg.split('=')[1] : new Date().toISOString().slice(0, 10));
const inFile = path.join(process.cwd(), 'ops', 'feedback', `${day}.jsonl`);
const outFile = path.join(process.cwd(), 'ops', 'feedback', `${day}-summary.json`);

function inc(map, key) { map[key] = (map[key] || 0) + 1; }

async function run() {
  let text = '';
  try { text = await fs.readFile(inFile, 'utf8'); } catch { text = ''; }
  const rows = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const byCategory = {};
  const byModel = {};
  const byUser = {};

  for (const r of rows) {
    inc(byCategory, r.issue_category || 'unknown');
    inc(byModel, r.model || 'unknown');
    inc(byUser, r.user || 'unknown');
  }

  const summary = {
    date: day,
    total: rows.length,
    grouped: {
      by_category: byCategory,
      by_model: byModel,
      by_user: byUser,
    },
    samples: rows.slice(0, 20),
  };

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
