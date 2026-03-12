import assert from "node:assert/strict";
import { classifyDiagramType } from "../src/swarm/diagramClassifier";
import { linkFigureEvidence } from "../src/swarm/figureNoteLinker";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("classify framing diagram", () => {
  const d = classifyDiagramType({ text: "rough opening width and framing", title: "Figure 3 framing" });
  assert.equal(d, "framing_diagram");
});

t("classify exploded parts", () => {
  const d = classifyDiagramType({ text: "exploded parts view item #A12" });
  assert.equal(d, "exploded_parts_view");
});

t("figure note linking extracts callouts", () => {
  const f = linkFigureEvidence({ text: "Figure note: use approved vent. Item #A12 Item #B4" });
  assert.ok(f.figure_present);
  assert.ok((f.callout_labels || []).length >= 1);
});
