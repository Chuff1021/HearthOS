import assert from "node:assert/strict";
import { resolveQuery } from "../src/swarm/modelResolver";
import { policyForIntent } from "../src/swarm/manualTypePolicy";
import { rankManuals } from "../src/swarm/manualRanker";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("exact model disambiguation", () => {
  const r = resolveQuery("framing dimensions for 42 apex", "framing");
  assert.equal(r.model_candidate, "42 apex nexgen-hybrid");
  assert.ok(r.confidence >= 0.9);
});

t("wrong-size rejection pressure", () => {
  const res = resolveQuery("venting for novus 36", "venting");
  const ranked = rankManuals([
    { manual_title: "Novus 42 Installation", manufacturer: "Heatilator", model: "Novus 42", page_number: 20, source_url: "u1", chunk_text: "vent termination", score: 0.9, source_type: "manual", doc_type: "installation" },
    { manual_title: "Novus 36 Installation", manufacturer: "Heatilator", model: "Novus 36", page_number: 20, source_url: "u2", chunk_text: "vent termination", score: 0.85, source_type: "manual", doc_type: "installation" },
  ] as any, res);
  assert.equal(ranked[0].model, "Novus 36");
});

t("owner-manual not primary for install intent", () => {
  const p = policyForIntent("framing");
  assert.ok(p.requiredTypes.includes("installation"));
  assert.ok(!p.requiredTypes.includes("owner"));
});

t("brochure suppressed", () => {
  const res = resolveQuery("clearances for apex 42", "clearances");
  const ranked = rankManuals([
    { manual_title: "Apex Brochure", manufacturer: "Travis", model: "42 Apex NexGen-Hybrid", page_number: 1, source_url: "u1", chunk_text: "table of contents", score: 0.95, source_type: "manual", doc_type: "flyer" },
    { manual_title: "Apex Installation Manual", manufacturer: "Travis", model: "42 Apex NexGen-Hybrid", page_number: 40, source_url: "u2", chunk_text: "mantel clearances", score: 0.8, source_type: "manual", doc_type: "installation" },
  ] as any, res);
  assert.equal(ranked[0].manual_title, "Apex Installation Manual");
});
