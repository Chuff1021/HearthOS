import { computeCorpusCompleteness } from "../src/swarm/corpusCompleteness";
import { evaluateReleaseReadiness, loadReleaseThresholds, resolveGateProfile } from "../src/swarm/releaseGates";
import { readFile } from "node:fs/promises";

const metrics = {
  unresolved_conflict_refusal_rate: Number(process.env.METRIC_UNRESOLVED_CONFLICT_RATE || 0),
  unsupported_numeric_answer_attempts: Number(process.env.METRIC_UNSUPPORTED_NUMERIC || 0),
  incomplete_manual_refusal_rate: Number(process.env.METRIC_INCOMPLETE_REFUSAL_RATE || 0),
  install_query_no_manual_id_attempts: Number(process.env.METRIC_INSTALL_NO_MANUAL_ID || 0),
  fact_answer_rate: Number(process.env.METRIC_FACT_ANSWER_RATE || 0),
  wrong_authority_override_attempts: Number(process.env.METRIC_WRONG_AUTHORITY_OVERRIDE || 0),
  critical_eval_accuracy: Number(process.env.METRIC_CRITICAL_EVAL_ACCURACY || 1),
  regression_failures: Number(process.env.METRIC_REGRESSION_FAILURES || 0),
};

async function main() {
  const profile = resolveGateProfile();
  const t = loadReleaseThresholds(profile);

  let strictCoverage = Number(process.env.CI_CORPUS_COVERAGE_OVERRIDE || "");
  if (!Number.isFinite(strictCoverage)) {
    try {
      const c = await computeCorpusCompleteness();
      strictCoverage = c.strict_manual_id_coverage_rate;
    } catch {
      strictCoverage = Number(process.env.CI_CORPUS_COVERAGE_FALLBACK || 0);
    }
  }

  try {
    const live = JSON.parse(await readFile(process.env.LIVE_EVAL_SUMMARY_PATH || "/tmp/gabe_live_eval_summary.json", "utf8"));
    if (Number.isFinite(Number(live?.critical_eval_accuracy))) metrics.critical_eval_accuracy = Number(live.critical_eval_accuracy);
    if (Number.isFinite(Number(live?.regression_failures))) metrics.regression_failures = Number(live.regression_failures);
  } catch {
    // optional live summary
  }

  const out = evaluateReleaseReadiness({ ...metrics, strict_manual_id_coverage_rate: strictCoverage }, t);
  const failed = out.checks.filter((x: any) => !x.ok).map((x: any) => x.key);
  const suggestions = failed.map((k: string) => {
    if (k === "strict_manual_id_coverage_rate") return "Run re-ingest workflow and resolve legacy tuple-only manuals.";
    if (k === "unresolved_conflict_rate") return "Fix conflicting fact rows or improve precedence metadata.";
    if (k === "fact_answer_rate") return "Increase structured fact extraction coverage for install-critical categories.";
    return "Review gate inputs/metrics and rerun phase tests.";
  });

  const payload = {
    profile,
    thresholds: t,
    metrics: { ...metrics, strict_manual_id_coverage_rate: strictCoverage },
    failed_gate_names: failed,
    suggestions,
    ...out,
  };

  console.log(JSON.stringify(payload, null, 2));
  if (!out.ready) {
    console.error("Release readiness FAILED:");
    for (const f of out.checks.filter((x: any) => !x.ok)) {
      console.error(` - ${f.key} ${f.op} ${f.threshold} (actual=${f.value})`);
    }
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(3);
});
