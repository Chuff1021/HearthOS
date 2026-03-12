import assert from "node:assert/strict";
import { querySourcePriorityPolicy, suggestMissingSourceClasses } from "../src/swarm/sourceGovernance";
import { evaluateReleaseReadiness, loadReleaseThresholds } from "../src/swarm/releaseGates";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("jurisdiction-aware code priority", () => {
  const p = querySourcePriorityPolicy({ intent: "code compliance", jurisdictionKnown: true });
  assert.equal(p[0], "jurisdiction_adoption_record");
});

t("model code fallback when jurisdiction unknown", () => {
  const p = querySourcePriorityPolicy({ intent: "code compliance", jurisdictionKnown: false });
  assert.equal(p[0], "code_document");
});

t("missing source suggestions for code question", () => {
  const s = suggestMissingSourceClasses("What code edition is adopted in my county?");
  assert.ok(s.includes("jurisdiction_adoption_record"));
});

t("production thresholds stricter than dev", () => {
  const dev = loadReleaseThresholds("development");
  const prod = loadReleaseThresholds("production");
  assert.ok(prod.strict_manual_id_coverage_rate_min > dev.strict_manual_id_coverage_rate_min);
});

t("release gate fails on high unresolved conflicts", () => {
  const out = evaluateReleaseReadiness({
    unresolved_conflict_refusal_rate: 0.2,
    unsupported_numeric_answer_attempts: 0,
    incomplete_manual_refusal_rate: 0,
    install_query_no_manual_id_attempts: 0,
    fact_answer_rate: 1,
    wrong_authority_override_attempts: 0,
    strict_manual_id_coverage_rate: 1,
  }, loadReleaseThresholds("production"));
  assert.equal(out.ready, false);
});
