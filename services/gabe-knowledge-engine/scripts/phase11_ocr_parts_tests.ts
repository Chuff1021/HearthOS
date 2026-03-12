import assert from "node:assert/strict";
import { runOcrFallback } from "../src/swarm/ocrFallback";
import { extractCalloutsFromFigure } from "../src/swarm/calloutExtractor";

function t(name: string, fn: () => void | Promise<void>) {
  Promise.resolve(fn()).then(() => console.log(`PASS ${name}`)).catch((e) => { console.error(`FAIL ${name}`, e); process.exitCode = 1; });
}

t("ocr fallback activates on weak native text", async () => {
  const r = await runOcrFallback({ nativeText: "abc", diagramLikely: true });
  assert.equal(r.used, true);
});

t("extract callouts from figure text", () => {
  const rows = extractCalloutsFromFigure({
    manual_id: "m1",
    model: "42 Apex NexGen-Hybrid",
    normalized_model: "42 apex nexgen hybrid",
    figure_page_number: 34,
    figure_caption: "Exploded view",
    diagram_type: "exploded_parts_view",
    text: "Item #A12 Part Number: 250-01987 Blower Assembly",
    source_mode: "native_text",
  } as any);
  assert.ok(rows.length >= 1);
  assert.ok(rows[0].part_number || rows[0].callout_label);
});
