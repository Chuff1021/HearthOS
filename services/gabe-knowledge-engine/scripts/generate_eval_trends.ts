import { writeFile } from "node:fs/promises";
import { evalTrends } from "../src/swarm/feedbackLoop";

async function main() {
  const trends = await evalTrends(500);
  const out = "/tmp/gabe_eval_trends.json";
  await writeFile(out, JSON.stringify(trends || {}, null, 2));
  console.log(JSON.stringify({ ok: true, out }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
