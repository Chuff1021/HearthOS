import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "../config";
import type { DimensionRecord, InstallAngle } from "../types";

const STORAGE_ROOT = join(env.MANUALS_PATH, "dimensions");

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function keyFor(record: DimensionRecord) {
  return [
    record.install_angle,
    record.dimension_key,
    record.value_imperial,
    record.value_metric,
    record.units,
    record.page_number,
    record.source_url,
    record.manual_title,
    record.manufacturer,
    record.model
  ].join("|");
}

function normalizeInstallAngle(value?: string): InstallAngle {
  if (value === "45") return "45";
  if (value === "standard") return "standard";
  return "unknown";
}

function normalizeFloatString(value: string, decimals: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toFixed(decimals);
}

function normalizeRecord(record: DimensionRecord): DimensionRecord {
  const confidence = Number.isFinite(record.confidence)
    ? Math.max(0, Math.min(1, record.confidence))
    : 0;

  return {
    install_angle: normalizeInstallAngle(record.install_angle),
    dimension_key: record.dimension_key.trim().toLowerCase(),
    value_imperial: normalizeFloatString(record.value_imperial, 3),
    value_metric: normalizeFloatString(record.value_metric, 2),
    units: record.units.trim().toLowerCase(),
    page_number: Math.max(1, Math.trunc(record.page_number)),
    source_url: record.source_url.trim(),
    manual_title: record.manual_title.trim(),
    manufacturer: record.manufacturer.trim(),
    model: record.model.trim(),
    confidence: Number(confidence.toFixed(4))
  };
}

export function getDimensionStoragePath(manufacturer: string, model: string) {
  const mfg = slugify(manufacturer);
  const mdl = slugify(model);
  return join(STORAGE_ROOT, mfg, `${mdl}.json`);
}

async function readExisting(path: string): Promise<DimensionRecord[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function upsertDimensions(records: DimensionRecord[]) {
  if (records.length === 0) return { ok: true, upserted: 0 };

  const normalized = records.map(normalizeRecord);

  const groups = new Map<string, DimensionRecord[]>();
  for (const r of normalized) {
    const path = getDimensionStoragePath(r.manufacturer, r.model);
    const arr = groups.get(path) ?? [];
    arr.push(r);
    groups.set(path, arr);
  }

  let upserted = 0;

  for (const [path, incoming] of groups.entries()) {
    const existing = await readExisting(path);
    const byKey = new Map<string, DimensionRecord>();

    for (const e of existing.map(normalizeRecord)) byKey.set(keyFor(e), e);
    for (const n of incoming) {
      const k = keyFor(n);
      const prev = byKey.get(k);
      if (!prev || n.confidence > prev.confidence) {
        byKey.set(k, n);
      }
    }

    const merged = Array.from(byKey.values()).sort((a, b) => {
      return (
        a.dimension_key.localeCompare(b.dimension_key) ||
        a.install_angle.localeCompare(b.install_angle) ||
        a.page_number - b.page_number ||
        a.value_metric.localeCompare(b.value_metric)
      );
    });

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(merged, null, 2), "utf8");
    upserted += incoming.length;
  }

  return { ok: true, upserted };
}

export async function queryDimensionsByModelTopic(input: {
  manufacturer?: string;
  model: string;
  topic: string;
  install_angle?: InstallAngle;
}) {
  let files: string[] = [];

  if (input.manufacturer) {
    files = [getDimensionStoragePath(input.manufacturer, input.model)];
  } else {
    try {
      const all = await readdir(STORAGE_ROOT, { recursive: true });
      files = all.filter((f) => typeof f === "string" && f.endsWith(`/${slugify(input.model)}.json`)).map((f) => join(STORAGE_ROOT, f));
    } catch {
      files = [];
    }
  }

  const allRecords: DimensionRecord[] = [];
  for (const file of files) {
    const recs = await readExisting(file);
    allRecords.push(...recs);
  }
  if (allRecords.length === 0) return [];

  const topicTokens = input.topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  return allRecords
    .map(normalizeRecord)
    .filter((r) => {
      if (input.install_angle && r.install_angle !== input.install_angle) return false;
      if (input.manufacturer && r.manufacturer.toLowerCase() !== input.manufacturer.toLowerCase()) return false;
      if (r.model.toLowerCase() !== input.model.toLowerCase()) return false;
      if (topicTokens.length === 0) return true;
      return topicTokens.some((t) => r.dimension_key.includes(t));
    })
    .sort((a, b) => {
      return (
        a.page_number - b.page_number ||
        a.dimension_key.localeCompare(b.dimension_key) ||
        b.confidence - a.confidence
      );
    });
}
