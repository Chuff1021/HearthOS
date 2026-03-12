import { runWorkerLoop } from "../src/swarm/sourceGovernanceHardening";

async function main() {
  const concurrency = Number(process.env.GOVERNANCE_WORKER_CONCURRENCY || 2);
  const pollMs = Number(process.env.GOVERNANCE_WORKER_POLL_MS || 2000);
  const iterations = Number(process.env.GOVERNANCE_WORKER_ITERATIONS || 100);
  const out = await runWorkerLoop({ concurrency, pollMs, iterations });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
