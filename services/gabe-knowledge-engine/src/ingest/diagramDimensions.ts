import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type ExtractionSource = {
  manualTitle: string;
  manufacturer?: string;
  model?: string;
  pdfPath: string;
};

export type DimensionCandidate = {
  page: number;
  label: "a" | "b" | "c" | null;
  value: number;
  unit: "in" | "mm";
  normalizedMm: number;
  raw: string;
  context: string;
  source: {
    pdfPath: string;
    imagePath: string;
    manualTitle: string;
    manufacturer?: string;
    model?: string;
  };
};

export type ExtractionResult = {
  source: ExtractionSource;
  generatedAt: string;
  pages: number[];
  candidates: DimensionCandidate[];
};

function parseValue(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");

  // 42 1/2
  const mixed = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator !== 0) return whole + numerator / denominator;
  }

  // 1/2
  const fraction = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator !== 0) return numerator / denominator;
  }

  const numeric = Number(cleaned.replace(/\s+/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function normalizeUnit(rawUnit: string): "in" | "mm" {
  const unit = rawUnit.toLowerCase();
  if (unit === "mm" || unit.includes("millim")) return "mm";
  return "in";
}

function toMm(value: number, unit: "in" | "mm"): number {
  return unit === "mm" ? value : value * 25.4;
}

function parsePages(raw?: string): number[] | null {
  if (!raw || raw.trim() === "") return null;
  const pages = new Set<number>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const step = start <= end ? 1 : -1;
      for (let i = start; step > 0 ? i <= end : i >= end; i += step) pages.add(i);
      continue;
    }
    const value = Number(token);
    if (Number.isInteger(value) && value > 0) pages.add(value);
  }
  return [...pages].sort((a, b) => a - b);
}

async function ensureBinary(name: string) {
  try {
    await execFile("bash", ["-lc", `command -v ${name}`]);
  } catch {
    throw new Error(`Missing required binary: ${name}. Install it and retry.`);
  }
}

async function renderPages(pdfPath: string, pages: number[], outputDir: string): Promise<Map<number, string>> {
  const rendered = new Map<number, string>();
  const sorted = [...pages].sort((a, b) => a - b);

  // Render each page separately to preserve exact page-number mapping.
  for (const page of sorted) {
    const prefix = join(outputDir, `page-${String(page).padStart(4, "0")}`);
    await execFile("pdftoppm", ["-f", String(page), "-singlefile", "-r", "300", "-png", resolve(pdfPath), prefix]);
    rendered.set(page, `${prefix}.png`);
  }

  return rendered;
}

async function ocrImage(imagePath: string): Promise<string> {
  const { stdout } = await execFile("tesseract", [imagePath, "stdout", "--dpi", "300", "-l", "eng", "quiet"]);
  return stdout;
}

function extractCandidatesFromText(text: string, page: number, source: DimensionCandidate["source"]): DimensionCandidate[] {
  const candidates: DimensionCandidate[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const labelValueRegex = /\b([ABC])\b\s*[:=\-]?\s*(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*(mm|millimeters?|inches|inch|in|\")\b/gi;
  const valueLabelRegex = /(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*(mm|millimeters?|inches|inch|in|\")\s*[:=\-]?\s*\b([ABC])\b/gi;

  for (const line of lines) {
    const consumedSpans: Array<[number, number]> = [];

    for (const match of line.matchAll(labelValueRegex)) {
      const rawValue = match[2] ?? "";
      const parsed = parseValue(rawValue);
      if (parsed == null) continue;
      const unit = normalizeUnit(match[3] ?? "");
      const start = match.index ?? -1;
      const end = start + (match[0]?.length ?? 0);
      consumedSpans.push([start, end]);
      candidates.push({
        page,
        label: ((match[1] ?? "").toLowerCase() as "a" | "b" | "c") || null,
        value: parsed,
        unit,
        normalizedMm: Number(toMm(parsed, unit).toFixed(2)),
        raw: match[0] ?? line,
        context: line,
        source
      });
    }

    for (const match of line.matchAll(valueLabelRegex)) {
      const start = match.index ?? -1;
      const end = start + (match[0]?.length ?? 0);
      if (consumedSpans.some(([s, e]) => start < e && end > s)) continue;
      const rawValue = match[1] ?? "";
      const parsed = parseValue(rawValue);
      if (parsed == null) continue;
      const unit = normalizeUnit(match[2] ?? "");
      candidates.push({
        page,
        label: ((match[3] ?? "").toLowerCase() as "a" | "b" | "c") || null,
        value: parsed,
        unit,
        normalizedMm: Number(toMm(parsed, unit).toFixed(2)),
        raw: match[0] ?? line,
        context: line,
        source
      });
    }

    const genericRegex = /(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*(mm|millimeters?|inches|inch|in|\")/gi;
    for (const match of line.matchAll(genericRegex)) {
      const start = match.index ?? -1;
      const end = start + (match[0]?.length ?? 0);
      if (consumedSpans.some(([s, e]) => start < e && end > s)) continue;
      const parsed = parseValue(match[1] ?? "");
      if (parsed == null) continue;
      const unit = normalizeUnit(match[2] ?? "");
      candidates.push({
        page,
        label: null,
        value: parsed,
        unit,
        normalizedMm: Number(toMm(parsed, unit).toFixed(2)),
        raw: match[0] ?? line,
        context: line,
        source
      });
    }
  }

  return candidates;
}

export async function extractDiagramDimensions(opts: {
  pdfPath: string;
  source: Omit<ExtractionSource, "pdfPath">;
  pages?: string;
  outputDir?: string;
  keepImages?: boolean;
}): Promise<ExtractionResult> {
  await ensureBinary("pdftoppm");
  await ensureBinary("tesseract");

  const pdfPath = resolve(opts.pdfPath);
  const workingDir = opts.outputDir ? resolve(opts.outputDir) : await mkdtemp(join(tmpdir(), "diagram-dims-"));
  await mkdir(workingDir, { recursive: true });

  const selectedPages = parsePages(opts.pages);
  if (!selectedPages || selectedPages.length === 0) {
    throw new Error("No pages selected. Pass --pages like 10-14 or 10,12,14.");
  }

  const images = await renderPages(pdfPath, selectedPages, workingDir);
  const candidates: DimensionCandidate[] = [];

  for (const [page, imagePath] of images.entries()) {
    const text = await ocrImage(imagePath);
    candidates.push(
      ...extractCandidatesFromText(text, page, {
        pdfPath,
        imagePath,
        manualTitle: opts.source.manualTitle,
        manufacturer: opts.source.manufacturer,
        model: opts.source.model
      })
    );
  }

  const deduped = dedupe(candidates);

  const result: ExtractionResult = {
    source: {
      ...opts.source,
      pdfPath
    },
    generatedAt: new Date().toISOString(),
    pages: selectedPages,
    candidates: deduped
  };

  if (!opts.keepImages && !opts.outputDir) {
    await rm(workingDir, { recursive: true, force: true });
  }

  return result;
}

function dedupe(items: DimensionCandidate[]): DimensionCandidate[] {
  const seen = new Set<string>();
  const out: DimensionCandidate[] = [];
  for (const item of items) {
    const key = [item.page, item.label ?? "_", item.normalizedMm, item.context].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => a.page - b.page || a.normalizedMm - b.normalizedMm);
}

export async function writeExtractionResult(path: string, result: ExtractionResult) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(result, null, 2), "utf8");
}

export async function listRenderedImages(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith(".png")).map((f) => join(dir, f)).sort();
}

export function defaultOutputName(pdfPath: string) {
  const base = basename(pdfPath).replace(/\.pdf$/i, "");
  return `${base}.framing-dimensions.json`;
}
