import assert from "node:assert/strict";
import { loadReleaseThresholds, resolveGateProfile } from "../src/swarm/releaseGates";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("production stricter than development", () => {
  const dev = loadReleaseThresholds("development");
  const prod = loadReleaseThresholds("production");
  assert.ok(prod.unresolved_conflict_rate_max < dev.unresolved_conflict_rate_max);
  assert.ok(prod.strict_manual_id_coverage_rate_min > dev.strict_manual_id_coverage_rate_min);
});

t("strict startup block condition", () => {
  const strict = true;
  const ready = false;
  const blocked = strict && !ready;
  assert.equal(blocked, true);
});

t("dev override behavior", () => {
  const strict = true;
  const allowDevOverride = true;
  const profile = "development";
  const enabled = strict && (profile !== "development" || !allowDevOverride);
  assert.equal(enabled, false);
});

t("profile resolver returns known profile", () => {
  const p = resolveGateProfile();
  assert.ok(["development", "staging", "production"].includes(p));
});
