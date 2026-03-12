import { stableUuid } from "../ingest/ids";
import type { PartsGraphRow } from "./partsGraphStore";

export function extractCalloutsFromFigure(input: {
  manual_id: string;
  model: string;
  normalized_model: string;
  family?: string | null;
  size?: string | null;
  figure_page_number: number;
  figure_caption?: string | null;
  diagram_type?: string | null;
  source_url?: string | null;
  text: string;
  ocr_confidence?: number;
  source_mode: "native_text" | "ocr" | "hybrid";
}) : PartsGraphRow[] {
  const text = input.text || "";
  const labels = Array.from(new Set(text.match(/\b(?:item|part)\s*#?\s*([A-Z0-9\-]{1,8})\b/gi) || []));
  const partNums = Array.from(new Set(text.match(/\b(?:P\/N|PN|part\s*no\.?|part\s*number)\s*[:#]?\s*([A-Z0-9\-]{4,})\b/gi) || []));

  const rows: PartsGraphRow[] = [];
  const max = Math.max(labels.length, partNums.length, 1);
  for (let i = 0; i < max; i++) {
    const calloutLabel = labels[i] || labels[0] || null;
    const partNumberRaw = partNums[i] || partNums[0] || null;
    const partNumber = partNumberRaw?.replace(/^(?:P\/N|PN|part\s*no\.?|part\s*number)\s*[:#]?\s*/i, "") || null;

    const partNameMatch = text.match(new RegExp(`${partNumber || ""}[^\n]{0,50}`, "i"));
    const partName = partNameMatch ? partNameMatch[0].replace(partNumber || "", "").trim() : null;

    const callout_id = stableUuid(`${input.manual_id}|${input.figure_page_number}|${calloutLabel}|${partNumber}|${i}`);
    const confidenceBase = input.source_mode === "native_text" ? 0.78 : input.source_mode === "hybrid" ? 0.68 : 0.52;
    const confidence = Math.max(0, Math.min(1, confidenceBase + ((partNumber ? 0.08 : 0) + (calloutLabel ? 0.05 : 0))));

    rows.push({
      callout_id,
      manual_id: input.manual_id,
      model: input.model,
      normalized_model: input.normalized_model,
      family: input.family || null,
      size: input.size || null,
      figure_page_number: input.figure_page_number,
      figure_caption: input.figure_caption || null,
      diagram_type: input.diagram_type || null,
      callout_label: calloutLabel,
      part_number: partNumber,
      part_name: partName,
      compatibility_scope: input.model,
      source_confidence: confidence,
      source_mode: input.source_mode,
      ocr_confidence: input.ocr_confidence || null,
      source_url: input.source_url || null,
    });
  }

  return rows.filter((r) => r.callout_label || r.part_number || r.part_name);
}
