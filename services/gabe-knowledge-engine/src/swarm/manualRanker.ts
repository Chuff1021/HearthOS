import { RetrievedChunk } from "../types";
import { QueryResolution } from "./modelResolver";

export type RankedManual = {
  key: string;
  score: number;
  manufacturer: string;
  model: string;
  manual_title: string;
  source_url: string;
  doc_type?: string;
};

function norm(s?: string) { return (s || "").toLowerCase(); }

function manualTypeBoost(docType: string | undefined, preferred: QueryResolution["preferred_manual_type"]) {
  const d = norm(docType);
  if (!d) return 0;
  if (preferred === "other") return d === "flyer" ? -0.4 : 0.1;
  if (d === preferred) return 1.8;
  if (preferred === "installation" && d === "owner") return -0.6;
  if (preferred === "owner" && d === "installation") return -0.2;
  if (d === "flyer") return -1.2;
  return 0;
}

export function rankManuals(chunks: RetrievedChunk[], resolution: QueryResolution) {
  const groups = new Map<string, RetrievedChunk[]>();
  for (const c of chunks) {
    const key = `${c.manufacturer}|${c.model}|${c.manual_title}|${c.source_url}`;
    const arr = groups.get(key) || [];
    arr.push(c);
    groups.set(key, arr);
  }

  const ranked: RankedManual[] = [];
  for (const [key, arr] of groups.entries()) {
    const top = [...arr].sort((a, b) => b.score - a.score)[0];
    const hay = `${top.manufacturer} ${top.model} ${top.manual_title}`.toLowerCase();
    let s = top.score * 2;

    if (resolution.manufacturer_candidate && hay.includes(norm(resolution.manufacturer_candidate))) s += 3.2;
    if (resolution.model_candidate && hay.includes(norm(resolution.model_candidate))) s += 4.4;
    if (resolution.family_candidate && hay.includes(norm(resolution.family_candidate))) s += 1.4;
    if (resolution.size_candidate && hay.includes(norm(resolution.size_candidate))) s += 1.2;

    s += manualTypeBoost(top.doc_type, resolution.preferred_manual_type);

    if (/table of contents|welcome|warranty|introduction/.test(norm(top.chunk_text))) s -= 1.6;
    if (/(brochure|spec sheet|flyer)/.test(norm(top.manual_title))) s -= 1.3;

    const sizeInModel = top.model.match(/\b(\d{2})\b/)?.[1];
    if (resolution.size_candidate && sizeInModel && resolution.size_candidate !== sizeInModel) s -= 2.6;

    ranked.push({
      key,
      score: Number(s.toFixed(4)),
      manufacturer: top.manufacturer,
      model: top.model,
      manual_title: top.manual_title,
      source_url: top.source_url,
      doc_type: top.doc_type,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function filterToTopRankedManuals(chunks: RetrievedChunk[], ranked: RankedManual[], maxManuals = 3) {
  const allow = new Set(ranked.slice(0, maxManuals).map((m) => m.key));
  return chunks.filter((c) => allow.has(`${c.manufacturer}|${c.model}|${c.manual_title}|${c.source_url}`));
}
