import { computeCorpusCompleteness } from "../src/swarm/corpusCompleteness";
import { writeFile } from "node:fs/promises";

async function main() {
  const c = await computeCorpusCompleteness();
  const payload = {
    safe_manuals: c.manuals_with_complete_chunk_coverage,
    incomplete_manuals: c.incomplete_manual_ids,
    quarantined_manuals: c.manuals_with_quarantined_chunks,
    legacy_tuple_only_manuals: c.strict_manual_id_coverage_rate < 1 ? "present" : "none",
    strict_manual_id_coverage_rate: c.strict_manual_id_coverage_rate,
    next_actions: [
      "Re-ingest incomplete manuals first",
      "Resolve quarantined chunk assignments",
      "Enable strict install mode in all environments once coverage reaches 1.0",
    ],
  };
  const out = "/tmp/gabe_reingest_workflow_report.json";
  await writeFile(out, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, out }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
