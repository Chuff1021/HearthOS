import { precedenceRank } from "./factPrecedence";
import { queryFacts } from "./factsStore";

export async function responseTimeAuthorityCrosscheck(input: {
  selectedFact: any;
  installCritical: boolean;
  normalizedModel?: string;
  manualIds?: string[];
  factType?: string;
}) {
  if (!input.installCritical || !input.selectedFact) {
    return { passed: true, reason: "not_install_critical", superseded_fact_blocked: false, higher_authority_conflict_found: false, final_fact_id: input.selectedFact?.fact_id || null, final_precedence_rank: input.selectedFact?.precedence_rank || null };
  }

  const candidates = await queryFacts({
    manualIds: input.manualIds || [],
    normalizedModel: input.normalizedModel,
    factTypes: input.factType ? [input.factType] : [],
    limit: 50,
  });

  const sel = input.selectedFact;
  const selRank = precedenceRank({ manualType: sel.manual_type, extractionTier: sel.extraction_confidence_tier, revision: sel.revision });

  if (Array.isArray(sel.superseded_fact_ids) && sel.superseded_fact_ids.length > 0) {
    return {
      passed: false,
      reason: "selected_fact_is_superseded",
      superseded_fact_blocked: true,
      higher_authority_conflict_found: false,
      final_fact_id: sel.fact_id,
      final_precedence_rank: selRank,
      blocker_fact_ids: sel.superseded_fact_ids,
    };
  }

  const stronger = candidates.filter((f: any) => {
    if (f.fact_id === sel.fact_id) return false;
    const rank = precedenceRank({ manualType: f.manual_type, extractionTier: f.extraction_confidence_tier, revision: f.revision });
    const sameKey = `${f.fact_type}|${f.fact_subtype || ""}` === `${sel.fact_type}|${sel.fact_subtype || ""}`;
    const differentValue = JSON.stringify(f.value_json || {}) !== JSON.stringify(sel.value_json || {});
    return sameKey && differentValue && rank > selRank;
  });

  if (stronger.length > 0) {
    const best = stronger.sort((a: any, b: any) => (b.precedence_rank || 0) - (a.precedence_rank || 0))[0];
    return {
      passed: false,
      reason: "higher_authority_conflict",
      superseded_fact_blocked: false,
      higher_authority_conflict_found: true,
      final_fact_id: best.fact_id,
      final_precedence_rank: best.precedence_rank || null,
      blocker_fact_ids: stronger.map((x: any) => x.fact_id),
    };
  }

  const stillBest = candidates.slice().sort((a: any, b: any) => (b.precedence_rank || 0) - (a.precedence_rank || 0))[0];
  if (stillBest && stillBest.fact_id !== sel.fact_id) {
    return {
      passed: false,
      reason: "fact_selection_reversed",
      superseded_fact_blocked: false,
      higher_authority_conflict_found: false,
      final_fact_id: stillBest.fact_id,
      final_precedence_rank: stillBest.precedence_rank || null,
      blocker_fact_ids: [stillBest.fact_id],
    };
  }

  return {
    passed: true,
    reason: "authority_crosscheck_passed",
    superseded_fact_blocked: false,
    higher_authority_conflict_found: false,
    final_fact_id: sel.fact_id,
    final_precedence_rank: sel.precedence_rank || selRank,
  };
}
