import { stableUuid } from "../ingest/ids";
import { classifySection } from "./sectionClassifier";
import type { TechnicalFact } from "./factsStore";
import { parseSectionTableLike } from "./sectionTableParser";
import { precedenceRank } from "./factPrecedence";

function pickSourceKind(text: string) {
  const t = text.toLowerCase();
  if (/table|chart|matrix/.test(t)) return "table";
  if (/figure|diagram|wiring/.test(t)) return "diagram";
  if (/note:/.test(t)) return "figure_note";
  return "prose";
}

export function extractFactsFromChunk(input: {
  manual_id: string;
  manufacturer: string;
  model: string;
  normalized_model: string;
  family?: string | null;
  size?: string | null;
  manual_type?: string | null;
  page_number: number;
  source_url: string;
  text: string;
  section_title?: string;
  revision?: string | null;
}) {
  const facts: TechnicalFact[] = [];
  const t = input.text.replace(/\s+/g, " ");
  const sourceKind = pickSourceKind(t);
  const section = classifySection(t, input.section_title);

  const add = (fact_type: string, fact_subtype: string, value_json: any, units?: string, confidence = 0.72, tier: string = "weak_pattern_match", provenance_detail: string = sourceKind) => {
    const fact_id = stableUuid(`${input.manual_id}|${input.page_number}|${fact_type}|${fact_subtype}|${JSON.stringify(value_json)}`);
    const pr = precedenceRank({ manualType: input.manual_type, extractionTier: tier, revision: input.revision });
    facts.push({
      fact_id,
      manual_id: input.manual_id,
      manufacturer: input.manufacturer,
      model: input.model,
      normalized_model: input.normalized_model,
      family: input.family || null,
      size: input.size || null,
      manual_type: input.manual_type || null,
      fact_type,
      fact_subtype,
      value_json,
      units: units || null,
      page_number: input.page_number,
      source_url: input.source_url,
      evidence_excerpt: t.slice(0, 280),
      confidence,
      revision: input.revision || null,
      source_kind: sourceKind,
      extraction_confidence_tier: tier,
      provenance_detail,
      source_authority: (input.manual_type || "unknown").toLowerCase(),
      precedence_rank: pr,
      heading_scope: input.section_title || null,
    } as any);
  };

  const tableFacts = parseSectionTableLike(input.text, section.section_type);
  for (const tf of tableFacts) {
    const mapType = section.section_type === "framing" ? "framing_dimensions" : section.section_type.includes("clearance") ? "clearance" : section.section_type === "gas_specs" ? "gas_pressure" : section.section_type === "electrical" || section.section_type === "wiring" ? "electrical" : "vent_system";
    add(mapType, tf.subtype, tf.value, tf.units, 0.88, tf.extraction_confidence_tier, tf.provenance_detail);
  }

  const ventSize = t.match(/\b(4|5|6|7|8)\s*(?:"|in(?:ch)?)/i);
  if (ventSize || section.section_type === "venting" || section.section_type === "chimney_pipe") {
    add("vent_system", "approved_pipe_or_chimney", { vent_size: ventSize?.[1] || null, text: t.slice(0, 120) }, "in", 0.75, "exact_prose", "heading_scope");
  }

  const dimMatches = [...t.matchAll(/(width|height|depth|framing)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:"|in|inch)/gi)];
  for (const m of dimMatches.slice(0, 6)) add("framing_dimensions", m[1].toLowerCase(), { value: Number(m[2]) }, "in", 0.76);

  const clearanceMatches = [...t.matchAll(/(mantel|clearance|sidewall|rear wall|top)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:"|in|inch)/gi)];
  for (const m of clearanceMatches.slice(0, 6)) add("clearance", m[1].toLowerCase(), { value: Number(m[2]) }, "in", 0.74);

  const wcMatches = [...t.matchAll(/(manifold|inlet)\s+pressure[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:in\.?\s*w\.?c\.?|wc)/gi)];
  for (const m of wcMatches.slice(0, 4)) add("gas_pressure", `${m[1].toLowerCase()}_pressure`, { value: Number(m[2]) }, "in_wc", 0.8);

  const volt = t.match(/\b(120|240|24)\s*v(?:olt)?/i);
  if (volt || section.section_type === "electrical" || section.section_type === "wiring") add("electrical", "voltage_requirement", { voltage: Number(volt?.[1] || 0) || null }, "V", 0.72);

  if (/ansi|ul\b|listed|certified/.test(t)) add("approval", "listing", { text: t.slice(0, 120) }, undefined, 0.66);
  if (/remote|receiver|ifc/.test(t)) add("remote_compatibility", "remote", { text: t.slice(0, 120) }, undefined, 0.68);

  const part = t.match(/\b(part\s*(?:no\.?|number)?\s*[:#]?\s*([a-z0-9\-]{4,}))\b/i);
  if (part) add("parts_reference", "part_number", { part_number: part[2] }, undefined, 0.7);

  return facts;
}
