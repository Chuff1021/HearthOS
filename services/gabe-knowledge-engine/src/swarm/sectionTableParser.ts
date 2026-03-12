export function parseSectionTableLike(text: string, sectionType?: string) {
  const t = text.replace(/\r/g, "");
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const looksTabular = lines.filter((l) => /\||\t|\s{2,}/.test(l)).length >= 2;
  if (!looksTabular) return [] as Array<{ subtype: string; value: any; units?: string; provenance_detail: string; extraction_confidence_tier: string }>;

  const out: Array<{ subtype: string; value: any; units?: string; provenance_detail: string; extraction_confidence_tier: string }> = [];

  for (const l of lines.slice(0, 60)) {
    const vent = l.match(/(vent|pipe|chimney).{0,20}(\d+(?:\.\d+)?)\s*(?:"|in\b)/i);
    if (vent && /(venting|chimney_pipe)/.test(String(sectionType || ""))) out.push({ subtype: "vent_size", value: { value: Number(vent[2]) }, units: "in", provenance_detail: "table_row", extraction_confidence_tier: "exact_table" });

    const frame = l.match(/(width|height|depth|framing).{0,20}(\d+(?:\.\d+)?)\s*(?:"|in\b)/i);
    if (frame && /framing/.test(String(sectionType || ""))) out.push({ subtype: frame[1].toLowerCase(), value: { value: Number(frame[2]) }, units: "in", provenance_detail: "table_cell", extraction_confidence_tier: "exact_table" });

    const clearance = l.match(/(mantel|clearance|wall|top).{0,20}(\d+(?:\.\d+)?)\s*(?:"|in\b)/i);
    if (clearance && /clearances|mantel_clearances|wall_clearances/.test(String(sectionType || ""))) out.push({ subtype: clearance[1].toLowerCase(), value: { value: Number(clearance[2]) }, units: "in", provenance_detail: "table_cell", extraction_confidence_tier: "exact_table" });

    const gas = l.match(/(inlet|manifold).{0,20}(\d+(?:\.\d+)?)\s*(?:wc|w\.c\.|in\.\s*w\.c\.)/i);
    if (gas && /gas_specs/.test(String(sectionType || ""))) out.push({ subtype: `${gas[1].toLowerCase()}_pressure`, value: { value: Number(gas[2]) }, units: "in_wc", provenance_detail: "table_row", extraction_confidence_tier: "exact_table" });

    const volt = l.match(/\b(120|240|24)\s*v\b/i);
    if (volt && /electrical|wiring/.test(String(sectionType || ""))) out.push({ subtype: "voltage", value: { value: Number(volt[1]) }, units: "V", provenance_detail: "table_cell", extraction_confidence_tier: "exact_table" });
  }

  return out;
}
