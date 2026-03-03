import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export function readJsonFile<T>(name: string, fallback: T): T {
  ensureDirs();
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFileWithBackup<T>(name: string, data: T) {
  ensureDirs();
  const file = path.join(DATA_DIR, name);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `${name}.${ts}.bak.json`);

  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, backup);
    } catch {
      // no-op
    }
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
