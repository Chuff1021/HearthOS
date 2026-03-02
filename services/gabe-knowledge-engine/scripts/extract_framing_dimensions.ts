import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  defaultOutputName,
  extractDiagramDimensions,
  writeExtractionResult
} from "../src/ingest/diagramDimensions";
import { upsertDimensions } from "../src/ingest/dimensionsStore";
import type { DimensionRecord, InstallAngle } from "../src/types";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

const filePath = getArg("--file");
const pages = getArg("--pages");
const manualTitle = getArg("--title") ?? "Installation Manual";
const manufacturer = getArg("--manufacturer");
const model = getArg("--model");
const outPathArg = getArg("--out");
const imageDir = getArg("--image-dir");
const sourceUrl = getArg("--source-url") ?? "";
const topic = (getArg("--topic") ?? "framing").toLowerCase();
const installAngleArg = getArg("--install-angle");
const keepImages = args.includes("--keep-images");
const ingest = args.includes("--ingest");

if (!filePath || !pages) {
  console.error(`Usage:\n  tsx scripts/extract_framing_dimensions.ts --file <manual.pdf> --pages <12-15,18> [--title "FPX 42 Apex"] [--manufacturer Travis] [--model "42 Apex"] [--source-url https://example/manual.pdf] [--topic framing] [--install-angle standard|45|unknown] [--ingest] [--out ./tmp/fpx42.framing.json] [--image-dir ./tmp/fpx-images] [--keep-images]`);
  process.exit(1);
}

function deriveInstallAngle(text: string): InstallAngle {
  const t = text.toLowerCase();
  if (/\b45\b|45\s*degree|45°/.test(t)) return "45";
  if (t.includes("standard")) return "standard";
  return "unknown";
}

function toDimensionRecords(payload: Awaited<ReturnType<typeof extractDiagramDimensions>>): DimensionRecord[] {
  return payload.candidates.map((c) => {
    const valueImperial = c.unit === "in" ? c.value : c.value / 25.4;
    const valueMetric = c.unit === "mm" ? c.value : c.value * 25.4;
    const labelKey = c.label ? `label_${c.label}` : "unlabeled";
    const inferredAngle = installAngleArg ? (installAngleArg as InstallAngle) : deriveInstallAngle(`${c.context} ${payload.source.manualTitle}`);

    return {
      install_angle: inferredAngle,
      dimension_key: `${topic}_${labelKey}`,
      value_imperial: valueImperial.toFixed(3),
      value_metric: valueMetric.toFixed(2),
      units: c.unit,
      page_number: c.page,
      source_url: sourceUrl,
      manual_title: payload.source.manualTitle,
      manufacturer: payload.source.manufacturer ?? "unknown",
      model: payload.source.model ?? "unknown",
      confidence: c.label ? 0.72 : 0.58
    };
  });
}

async function run() {
  const resolvedFile = resolve(filePath as string);
  const outPath = resolve(outPathArg ?? defaultOutputName(resolvedFile));

  if (imageDir) {
    await mkdir(resolve(imageDir), { recursive: true });
  }

  const result = await extractDiagramDimensions({
    pdfPath: resolvedFile,
    source: {
      manualTitle,
      manufacturer,
      model
    },
    pages,
    outputDir: imageDir ? resolve(imageDir) : undefined,
    keepImages
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeExtractionResult(outPath, result);

  if (ingest) {
    const records = toDimensionRecords(result);
    const ingestResult = await upsertDimensions(records);
    console.log(`Upserted ${ingestResult.upserted} dimension rows`);
  }

  console.log(`Wrote ${result.candidates.length} candidates -> ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
