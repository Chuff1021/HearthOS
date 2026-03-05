import { RetrievedChunk } from "../types";
import { IntentCategory } from "./intentClassifier";

const sectionHints: Record<IntentCategory, string[]> = {
  "clearances": ["clearance", "mantel"],
  "framing": ["framing", "rough opening", "dimensions"],
  "venting": ["vent", "chimney", "termination"],
  "gas pressure": ["gas", "pressure", "manifold", "inlet"],
  "electrical": ["wiring", "electrical", "switch", "module", "transformer"],
  "troubleshooting": ["troubleshooting", "problem", "diagnostic", "pilot"],
  "remote operation": ["remote", "receiver", "thermostat"],
  "replacement parts": ["parts", "part", "exploded", "diagram"],
  "installation steps": ["installation", "install", "step"],
  "code compliance": ["code", "compliance", "approved", "listing"],
};

export function routeBySection(intent: IntentCategory, chunks: RetrievedChunk[]) {
  const hints = sectionHints[intent] || [];
  if (!hints.length) return chunks;
  const filtered = chunks.filter((c) => {
    const hay = `${c.section_title || ""} ${c.chunk_text || ""} ${c.doc_type || ""}`.toLowerCase();
    return hints.some((h) => hay.includes(h));
  });
  return filtered.length > 0 ? filtered : chunks;
}
