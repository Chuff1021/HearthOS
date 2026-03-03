import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

export interface TechLocationPoint {
  techId: string;
  techName?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
}

const FILE = 'tech-locations.json';
const MEM_KEY = '__hearth_live_locations__';

function getMemStore(): TechLocationPoint[] {
  const g = globalThis as any;
  if (!g[MEM_KEY]) g[MEM_KEY] = [];
  return g[MEM_KEY] as TechLocationPoint[];
}

function getAll() {
  try {
    return readJsonFile<TechLocationPoint[]>(FILE, getMemStore());
  } catch {
    return getMemStore();
  }
}

function saveAll(points: TechLocationPoint[]) {
  // always keep memory copy (works even if filesystem is unavailable)
  const mem = getMemStore();
  mem.length = 0;
  mem.push(...points);

  try {
    writeJsonFileWithBackup(FILE, points);
  } catch {
    // non-fatal in serverless/read-only environments
  }
}

export function addLocationPoint(point: TechLocationPoint) {
  const all = getAll();
  all.unshift(point);
  // keep last 5000 pings
  const trimmed = all.slice(0, 5000);
  saveAll(trimmed);
  return point;
}

export function getLatestLocationsByTech() {
  const all = getAll();
  const latest = new Map<string, TechLocationPoint>();
  for (const p of all) {
    if (!latest.has(p.techId)) latest.set(p.techId, p);
  }
  return Array.from(latest.values());
}

export function getLocationHistory(techId: string, limit = 100) {
  const all = getAll();
  return all.filter((p) => p.techId === techId).slice(0, limit);
}
