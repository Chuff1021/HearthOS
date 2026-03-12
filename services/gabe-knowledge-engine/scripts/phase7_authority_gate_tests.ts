import assert from "node:assert/strict";
import { evaluateReleaseReadiness } from "../src/swarm/releaseGates";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("release gate fails on unresolved conflict metric", () => {
  const out = evaluateReleaseReadiness({
    unresolved_conflict_refusal_rate: 0.2,
    unsupported_numeric_answer_attempts: 0,
    incomplete_manual_refusal_rate: 0.1,
    install_query_no_manual_id_attempts: 0,
    fact_answer_rate: 0.5,
    wrong_authority_override_attempts: 0,
  }, {
    unresolved_conflict_rate_max: 0.05,
    unsupported_numeric_answer_attempts_max: 5,
    incomplete_manual_refusal_rate_max: 0.35,
    install_query_no_manual_id_attempts_max: 0,
    fact_answer_rate_min: 0.25,
    wrong_authority_override_attempts_max: 0,
  });
  assert.equal(out.ready, false);
});

t("release gate passes clean metrics", () => {
  const out = evaluateReleaseReadiness({
    unresolved_conflict_refusal_rate: 0.01,
    unsupported_numeric_answer_attempts: 0,
    incomplete_manual_refusal_rate: 0.1,
    install_query_no_manual_id_attempts: 0,
    fact_answer_rate: 0.55,
    wrong_authority_override_attempts: 0,
  }, {
    unresolved_conflict_rate_max: 0.05,
    unsupported_numeric_answer_attempts_max: 5,
    incomplete_manual_refusal_rate_max: 0.35,
    install_query_no_manual_id_attempts_max: 0,
    fact_answer_rate_min: 0.25,
    wrong_authority_override_attempts_max: 0,
  });
  assert.equal(out.ready, true);
});
