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

function getAll() {
  return readJsonFile<TechLocationPoint[]>(FILE, []);
}

function saveAll(points: TechLocationPoint[]) {
  writeJsonFileWithBackup(FILE, points);
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
