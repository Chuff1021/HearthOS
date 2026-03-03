import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MEM_KEY = '__hearth_persist_fallback__';

type MemStore = Record<string, unknown>;

function getMemStore(): MemStore {
  const g = globalThis as any;
  if (!g[MEM_KEY]) g[MEM_KEY] = {};
  return g[MEM_KEY] as MemStore;
}

function ensureDirsSafe() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function readJsonFile<T>(name: string, fallback: T): T {
  const mem = getMemStore();

  // Always provide fallback in memory for read-only/serverless environments.
  if (!(name in mem)) {
    mem[name] = fallback;
  }

  if (!ensureDirsSafe()) {
    return (mem[name] as T) ?? fallback;
  }

  const file = path.join(DATA_DIR, name);
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(mem[name], null, 2));
      return mem[name] as T;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as T;
    mem[name] = parsed;
    return parsed;
  } catch {
    return (mem[name] as T) ?? fallback;
  }
}

export function writeJsonFileWithBackup<T>(name: string, data: T) {
  const mem = getMemStore();
  mem[name] = data;

  if (!ensureDirsSafe()) return;

  const file = path.join(DATA_DIR, name);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `${name}.${ts}.bak.json`);

  try {
    if (fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, backup);
      } catch {
        // no-op
      }
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    // no-op: memory store already updated
  }
}
