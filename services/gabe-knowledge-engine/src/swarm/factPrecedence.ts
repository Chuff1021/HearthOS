export type ExtractionTier = "exact_table" | "exact_prose" | "inferred_from_diagram_note" | "weak_pattern_match";

export function manualTypeAuthority(manualType?: string | null) {
  const m = String(manualType || "").toLowerCase();
  if (m.includes("installation")) return 100;
  if (m.includes("service bulletin") || m.includes("addendum")) return 95;
  if (m.includes("service") || m.includes("wiring")) return 85;
  if (m.includes("parts")) return 75;
  if (m.includes("owner")) return 45;
  if (m.includes("brochure") || m.includes("spec") || m.includes("flyer")) return 20;
  return 40;
}

export function extractionTierScore(tier?: string | null) {
  const t = String(tier || "weak_pattern_match") as ExtractionTier;
  if (t === "exact_table") return 40;
  if (t === "exact_prose") return 30;
  if (t === "inferred_from_diagram_note") return 20;
  return 10;
}

export function revisionScore(revision?: string | null) {
  const r = String(revision || "").toLowerCase();
  const y = r.match(/(20\d{2})/)?.[1];
  return y ? Number(y) - 2000 : 0;
}

export function precedenceRank(input: { manualType?: string | null; extractionTier?: string | null; revision?: string | null }) {
  return manualTypeAuthority(input.manualType) + extractionTierScore(input.extractionTier) + revisionScore(input.revision);
}

export function authorityReason(input: { manualType?: string | null; extractionTier?: string | null; revision?: string | null }) {
  return `authority=${manualTypeAuthority(input.manualType)} tier=${extractionTierScore(input.extractionTier)} revision=${revisionScore(input.revision)}`;
}
