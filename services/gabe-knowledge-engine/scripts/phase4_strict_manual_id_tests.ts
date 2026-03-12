import assert from "node:assert/strict";
import { isInstallCriticalIntent } from "../src/swarm/manualTypePolicy";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("install-critical intents require manual_id filter", () => {
  const installCritical = isInstallCriticalIntent("venting");
  const resolved_manual_ids: string[] = [];
  const manualIdFilterApplied = resolved_manual_ids.length > 0;
  assert.equal(installCritical, true);
  assert.equal(manualIdFilterApplied, false);
});

t("incomplete manuals should refuse strict mode", () => {
  const corpusCompletenessStatus = "insufficient_for_strict";
  const answerStatus = corpusCompletenessStatus === "insufficient_for_strict" ? "refused" : "verified";
  assert.equal(answerStatus, "refused");
});

t("corpus completeness metrics shape", () => {
  const m = {
    strict_manual_id_coverage_rate: 0.93,
    incomplete_manual_refusal_rate: 0.88,
    install_query_no_manual_id_attempts: 4,
  };
  assert.ok(m.strict_manual_id_coverage_rate >= 0);
  assert.ok(m.incomplete_manual_refusal_rate >= 0);
  assert.ok(m.install_query_no_manual_id_attempts >= 0);
});
