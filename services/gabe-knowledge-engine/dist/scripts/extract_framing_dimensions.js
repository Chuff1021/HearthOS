"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const diagramDimensions_1 = require("../src/ingest/diagramDimensions");
const dimensionsStore_1 = require("../src/ingest/dimensionsStore");
const args = process.argv.slice(2);
function getArg(name) {
    const index = args.indexOf(name);
    if (index < 0)
        return undefined;
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
function deriveInstallAngle(text) {
    const t = text.toLowerCase();
    if (/\b45\b|45\s*degree|45°/.test(t))
        return "45";
    if (t.includes("standard"))
        return "standard";
    return "unknown";
}
function toDimensionRecords(payload) {
    return payload.candidates.map((c) => {
        const valueImperial = c.unit === "in" ? c.value : c.value / 25.4;
        const valueMetric = c.unit === "mm" ? c.value : c.value * 25.4;
        const labelKey = c.label ? `label_${c.label}` : "unlabeled";
        const inferredAngle = installAngleArg ? installAngleArg : deriveInstallAngle(`${c.context} ${payload.source.manualTitle}`);
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
    const resolvedFile = (0, node_path_1.resolve)(filePath);
    const outPath = (0, node_path_1.resolve)(outPathArg ?? (0, diagramDimensions_1.defaultOutputName)(resolvedFile));
    if (imageDir) {
        await (0, promises_1.mkdir)((0, node_path_1.resolve)(imageDir), { recursive: true });
    }
    const result = await (0, diagramDimensions_1.extractDiagramDimensions)({
        pdfPath: resolvedFile,
        source: {
            manualTitle,
            manufacturer,
            model
        },
        pages,
        outputDir: imageDir ? (0, node_path_1.resolve)(imageDir) : undefined,
        keepImages
    });
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(outPath), { recursive: true });
    await (0, diagramDimensions_1.writeExtractionResult)(outPath, result);
    if (ingest) {
        const records = toDimensionRecords(result);
        const ingestResult = await (0, dimensionsStore_1.upsertDimensions)(records);
        console.log(`Upserted ${ingestResult.upserted} dimension rows`);
    }
    console.log(`Wrote ${result.candidates.length} candidates -> ${outPath}`);
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
