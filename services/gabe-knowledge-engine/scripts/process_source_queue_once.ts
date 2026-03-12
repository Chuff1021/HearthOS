import { processNextSourceJob } from "../src/swarm/sourceGovernanceHardening";

async function main() {
  const out = await processNextSourceJob();
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
