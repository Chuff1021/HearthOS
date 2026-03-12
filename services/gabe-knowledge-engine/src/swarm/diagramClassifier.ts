export type DiagramType =
  | "framing_diagram"
  | "venting_diagram"
  | "wiring_diagram"
  | "clearance_diagram"
  | "exploded_parts_view"
  | "specification_table"
  | "installation_sequence_figure"
  | "generic_illustration";

export function classifyDiagramType(input: { text?: string; title?: string; heading?: string; sectionType?: string }): DiagramType {
  const t = `${input.title || ""} ${input.heading || ""} ${input.text || ""} ${input.sectionType || ""}`.toLowerCase();
  if (/framing|rough opening|enclosure/.test(t)) return "framing_diagram";
  if (/vent|chimney|termination|rise|run|elbow/.test(t)) return "venting_diagram";
  if (/wiring|electrical|module|switch|receiver|voltage/.test(t)) return "wiring_diagram";
  if (/clearance|mantel|combustible|distance/.test(t)) return "clearance_diagram";
  if (/exploded|callout|parts list|item\s*#|part no/.test(t)) return "exploded_parts_view";
  if (/table|specification|dimensions|ratings/.test(t)) return "specification_table";
  if (/step|sequence|installation|assembly/.test(t)) return "installation_sequence_figure";
  return "generic_illustration";
}
