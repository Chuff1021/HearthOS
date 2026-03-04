import fs from 'fs';
import path from 'path';

const CONFIGURED_DATA_DIR = process.env.HEARTHOS_DATA_DIR?.trim();
const DEFAULT_APP_DATA_DIR = '/var/lib/hearthos-data/app';
const LEGACY_DATA_DIR = path.join(process.cwd(), 'data');
const MEM_KEY = '__hearth_persist_fallback__';

function resolveDataDir() {
  if (CONFIGURED_DATA_DIR && CONFIGURED_DATA_DIR.length > 0) return CONFIGURED_DATA_DIR;
  try {
    if (!fs.existsSync(DEFAULT_APP_DATA_DIR)) fs.mkdirSync(DEFAULT_APP_DATA_DIR, { recursive: true });
    return DEFAULT_APP_DATA_DIR;
  } catch {
    return LEGACY_DATA_DIR;
  }
}

const DATA_DIR = resolveDataDir();
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

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

  if (!(name in mem)) mem[name] = fallback;
  if (!ensureDirsSafe()) return (mem[name] as T) ?? fallback;

  const file = path.join(DATA_DIR, name);
  const legacyFile = path.join(LEGACY_DATA_DIR, name);
  try {
    if (!fs.existsSync(file) && DATA_DIR !== LEGACY_DATA_DIR && fs.existsSync(legacyFile)) {
      fs.copyFileSync(legacyFile, file);
    }

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
      try { fs.copyFileSync(file, backup); } catch {}
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    // no-op
  }
}
