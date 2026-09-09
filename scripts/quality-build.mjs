import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const envFiles = (await readdir('.')).filter(name => /^\.env(?:\.|$)/.test(name) && !/example|sample|template/.test(name));
if (envFiles.length) throw new Error('Quality build requires a worktree without environment files.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'hearthos-quality-build-'));
try {
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SystemRoot'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  Object.assign(env, { NEXT_TELEMETRY_DISABLED: '1', HEARTHOS_DATA_DIR: directory,
    DATABASE_URL: 'postgresql://unavailable:unavailable@127.0.0.1:1/quality_build' });
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) throw new Error(`Isolated build exited ${code}`);
} finally { await rm(directory, { recursive: true, force: true }); }
