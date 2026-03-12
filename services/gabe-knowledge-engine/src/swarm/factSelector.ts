import { precedenceRank } from "./factPrecedence";

export function rankFactsForQuery(facts: any[], ctx: {
  manualIds: string[];
  normalizedModel?: string;
  preferredSections?: string[];
}) {
  return [...facts].map((f) => {
    let s = 0;
    if (ctx.manualIds.includes(f.manual_id)) s += 40;
    if (ctx.normalizedModel && String(f.normalized_model || "") === ctx.normalizedModel) s += 35;
    if (ctx.normalizedModel && String(f.normalized_model || "").includes(ctx.normalizedModel)) s += 15;
    s += precedenceRank({ manualType: f.manual_type, extractionTier: f.extraction_confidence_tier, revision: f.revision });
    if (ctx.preferredSections?.length && ctx.preferredSections.some((x) => String(f.fact_subtype || "").includes(x) || String(f.heading_scope || "").toLowerCase().includes(String(x).toLowerCase()))) s += 10;
    s += Number((f.confidence || 0) * 10);
    return { ...f, _query_rank: s };
  }).sort((a, b) => b._query_rank - a._query_rank);
}
