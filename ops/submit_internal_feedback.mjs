#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.join('=')];
}));

const required = ['user', 'model', 'question', 'category'];
for (const r of required) {
  if (!args[r]) {
    console.error(`missing --${r}`);
    process.exit(1);
  }
}

const date = new Date();
const day = date.toISOString().slice(0, 10);
const dir = path.join(process.cwd(), 'ops', 'feedback');
const file = path.join(dir, `${day}.jsonl`);

const entry = {
  timestamp: date.toISOString(),
  user: args.user,
  model: args.model,
  question: args.question,
  issue_category: args.category,
  response_summary: args.response_summary || '',
  screenshot_or_reference: args.screenshot || args.reference || '',
  notes: args.notes || '',
};

await fs.mkdir(dir, { recursive: true });
await fs.appendFile(file, JSON.stringify(entry) + '\n');
console.log(JSON.stringify({ ok: true, file, entry }, null, 2));
