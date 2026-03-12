export type SectionType =
  | "venting"
  | "chimney_pipe"
  | "framing"
  | "clearances"
  | "mantel_clearances"
  | "wall_clearances"
  | "electrical"
  | "wiring"
  | "gas_specs"
  | "troubleshooting"
  | "operation"
  | "maintenance"
  | "parts"
  | "warnings"
  | "generic_front_matter";

export function classifySection(text: string, sectionTitle?: string): { section_type: SectionType; content_kind: string } {
  const t = `${sectionTitle || ""} ${text || ""}`.toLowerCase();
  if (/table of contents|copyright|introduction|welcome|warranty/.test(t)) return { section_type: "generic_front_matter", content_kind: "noise" };
  if (/warning|caution|danger|if you smell gas/.test(t)) return { section_type: "warnings", content_kind: "safety" };
  if (/vent|termination|chimney|elbow|rise|run|pipe/.test(t)) return { section_type: /chimney|pipe/.test(t) ? "chimney_pipe" : "venting", content_kind: "technical" };
  if (/framing|rough opening|enclosure/.test(t)) return { section_type: "framing", content_kind: "dimensions" };
  if (/clearance|mantel|hearth extension|distance to combust/.test(t)) {
    if (/mantel/.test(t)) return { section_type: "mantel_clearances", content_kind: "clearance" };
    if (/wall|sidewall|rear wall/.test(t)) return { section_type: "wall_clearances", content_kind: "clearance" };
    return { section_type: "clearances", content_kind: "clearance" };
  }
  if (/wiring|electrical|voltage|transformer|module|ifc|receiver|switch/.test(t)) return { section_type: /wiring/.test(t) ? "wiring" : "electrical", content_kind: "technical" };
  if (/manifold|inlet pressure|wc\b|gas pressure|btu/.test(t)) return { section_type: "gas_specs", content_kind: "spec" };
  if (/troubleshoot|won't light|pilot|error code|diagnostic/.test(t)) return { section_type: "troubleshooting", content_kind: "procedure" };
  if (/operation|lighting instructions|startup|shutdown|remote/.test(t)) return { section_type: "operation", content_kind: "procedure" };
  if (/maintenance|cleaning|service schedule/.test(t)) return { section_type: "maintenance", content_kind: "procedure" };
  if (/part number|replacement part|exploded|assembly|blower|thermocouple|thermopile/.test(t)) return { section_type: "parts", content_kind: "parts" };
  return { section_type: "generic_front_matter", content_kind: "unknown" };
}
