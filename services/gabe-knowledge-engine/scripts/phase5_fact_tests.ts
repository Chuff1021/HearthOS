import assert from "node:assert/strict";
import { extractFactsFromChunk } from "../src/swarm/factExtractor";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("extract vent fact", () => {
  const facts = extractFactsFromChunk({
    manual_id: "m1",
    manufacturer: "Travis",
    model: "42 Apex NexGen-Hybrid",
    normalized_model: "42 apex nexgen hybrid",
    manual_type: "installation",
    page_number: 12,
    source_url: "https://example.com",
    text: "Approved vent size is 6 inch with vertical termination",
  } as any);
  assert.ok(facts.some((f) => f.fact_type === "vent_system"));
});

t("extract gas pressure fact", () => {
  const facts = extractFactsFromChunk({
    manual_id: "m1",
    manufacturer: "Travis",
    model: "42 Apex NexGen-Hybrid",
    normalized_model: "42 apex nexgen hybrid",
    manual_type: "installation",
    page_number: 22,
    source_url: "https://example.com",
    text: "Manifold pressure 3.5 in. w.c. at high fire",
  } as any);
  assert.ok(facts.some((f) => f.fact_type === "gas_pressure"));
});
