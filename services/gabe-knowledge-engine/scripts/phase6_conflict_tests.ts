import assert from "node:assert/strict";
import { resolveFactConflict } from "../src/swarm/factConflictResolver";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("install manual outranks brochure", () => {
  const facts = [
    { fact_id: "a", fact_type: "clearance", fact_subtype: "mantel", value_json: { value: 12 }, manual_type: "brochure", extraction_confidence_tier: "exact_table", revision: "2025" },
    { fact_id: "b", fact_type: "clearance", fact_subtype: "mantel", value_json: { value: 10 }, manual_type: "installation", extraction_confidence_tier: "exact_prose", revision: "2024" },
  ];
  const r = resolveFactConflict(facts as any);
  assert.equal(r.resolved?.fact_id, "b");
});

t("ambiguous conflict refuses", () => {
  const facts = [
    { fact_id: "a", fact_type: "gas_pressure", fact_subtype: "manifold_pressure", value_json: { value: 3.5 }, manual_type: "installation", extraction_confidence_tier: "exact_prose", revision: "2024" },
    { fact_id: "b", fact_type: "gas_pressure", fact_subtype: "manifold_pressure", value_json: { value: 4.0 }, manual_type: "installation", extraction_confidence_tier: "exact_prose", revision: "2024" },
  ];
  const r = resolveFactConflict(facts as any);
  assert.equal(r.resolved, null);
});
