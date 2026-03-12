import { authorityReason, precedenceRank } from "./factPrecedence";

export function detectFactConflict(facts: any[]) {
  if (facts.length <= 1) return { conflict: false, groups: [] as any[] };
  const byKey = new Map<string, any[]>();
  for (const f of facts) {
    const key = `${f.fact_type}|${f.fact_subtype || ""}`;
    const arr = byKey.get(key) || [];
    arr.push(f);
    byKey.set(key, arr);
  }

  const groups: any[] = [];
  let conflict = false;
  for (const [key, arr] of byKey.entries()) {
    const values = new Set(arr.map((x) => JSON.stringify(x.value_json || {})));
    if (values.size > 1) {
      conflict = true;
      groups.push({ key, facts: arr });
    }
  }
  return { conflict, groups };
}

export function resolveFactConflict(facts: any[]) {
  const ranked = [...facts].map((f) => ({
    f,
    rank: precedenceRank({ manualType: f.manual_type, extractionTier: f.extraction_confidence_tier, revision: f.revision }),
  })).sort((a, b) => b.rank - a.rank);

  if (ranked.length === 0) return { resolved: null, strategy: "none", superseded: [], reason: "no_facts" };
  if (ranked.length === 1) return { resolved: ranked[0].f, strategy: "single", superseded: [], reason: authorityReason(ranked[0].f) };

  const top = ranked[0];
  const second = ranked[1];
  if ((top.rank - second.rank) < 10) {
    return { resolved: null, strategy: "ambiguous_conflict", superseded: [], reason: "rank_gap_too_small" };
  }

  return {
    resolved: {
      ...top.f,
      superseded_fact_ids: ranked.slice(1).map((x) => x.f.fact_id),
      fact_conflict_detected: true,
      fact_conflict_resolution_strategy: "precedence_rank",
      chosen_fact_authority_reason: authorityReason(top.f),
    },
    strategy: "precedence_rank",
    superseded: ranked.slice(1).map((x) => x.f.fact_id),
    reason: authorityReason(top.f),
  };
}
