import { computeCorpusCompleteness } from "../src/swarm/corpusCompleteness";
import { writeFile } from "node:fs/promises";

async function main() {
  const report = await computeCorpusCompleteness();
  const out = "/tmp/gabe_corpus_completeness.json";
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out, report }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
