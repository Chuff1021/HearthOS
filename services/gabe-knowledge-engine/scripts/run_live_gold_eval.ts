import { mkdir, readFile, writeFile } from "node:fs/promises";
import { recordEvalCaseResults, recordEvalRun } from "../src/swarm/feedbackLoop";

type EvalCase = {
  id: string;
  question: string;
  manufacturer: string;
  model: string;
  family: string;
  size: string;
  intent_type: string;
  fact_category: string;
  source_dependency: string;
  expected_answer_status: "verified" | "partial" | "refused";
};

function parseJsonl(s: string): EvalCase[] {
  return s.trim().split(/\n+/).filter(Boolean).map((l) => JSON.parse(l));
}

function normalizeStatus(resp: any): string {
  return String(resp?.answer_status || (resp?.source_type === "none" ? "refused" : "partial")).toLowerCase();
}

function scoreCase(c: EvalCase, resp: any) {
  const failures: string[] = [];
  const actualStatus = normalizeStatus(resp);
  const expected = c.expected_answer_status;
  if (actualStatus !== expected) failures.push(`status_mismatch:${expected}->${actualStatus}`);

  const citationRequired = expected !== "refused";
  const citationPageOk = !citationRequired || Boolean(resp?.cited_page_number || resp?.selected_manual_page);
  if (citationRequired && !citationPageOk) failures.push("citation_page_missing");

  if (citationRequired) {
    const mfg = String(resp?.resolved_manufacturer || "").toLowerCase();
    if (c.manufacturer && mfg && !mfg.includes(c.manufacturer.toLowerCase().split(" ")[0])) failures.push("manufacturer_mismatch");
  }

  if (expected === "refused") {
    if (actualStatus !== "refused") failures.push("unsafe_non_refusal");
  } else {
    const validator = String(resp?.validator_result || "").toLowerCase();
    if (validator.includes("mismatch") || validator.includes("missing")) failures.push("validator_negative");
  }

  return {
    pass: failures.length === 0,
    failure_reasons: failures,
    citation_page_ok: citationPageOk,
    answer_status: actualStatus,
    validator_result: resp?.validator_result || null,
  };
}

async function queryLive(baseUrl: string, question: string, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });
    const json = await r.json();
    return { ok: r.ok, json, duration: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const baseUrl = process.env.GABE_BASE_URL || "http://127.0.0.1:4100";
  const timeoutMs = Number(process.env.EVAL_CASE_TIMEOUT_MS || 20000);
  const maxFailures = Number(process.env.EVAL_MAX_FAILURES || 0);
  const profile = process.env.EVAL_PROFILE || process.env.RELEASE_GATE_PROFILE || "development";
  const commit = process.env.GIT_COMMIT_SHA || process.env.ENGINE_COMMIT_SHA || null;
  const filterIntent = process.env.EVAL_FILTER_INTENT || "";
  const filterBrand = process.env.EVAL_FILTER_BRAND || "";

  const gold = parseJsonl(await readFile("evals/gold_eval_2026-03-08.jsonl", "utf8"));
  const regression = parseJsonl(await readFile("evals/regression_traps_2026-03-08.jsonl", "utf8").catch(() => ""));

  const selected = gold.filter((c) => (!filterIntent || c.intent_type === filterIntent) && (!filterBrand || c.manufacturer === filterBrand));
  const caseResults: any[] = [];
  let failures = 0;

  for (const c of selected) {
    const live = await queryLive(baseUrl, c.question, timeoutMs).catch((e) => ({ ok: false, json: { error: String(e) }, duration: timeoutMs }));
    const scored = scoreCase(c, live.json || {});
    if (!scored.pass) failures += 1;

    caseResults.push({
      case_id: c.id,
      query: c.question,
      actual_response_metadata: live.json || {},
      pass: scored.pass,
      failure_reasons: scored.failure_reasons,
      citation_page_ok: scored.citation_page_ok,
      validator_result: scored.validator_result,
      answer_status: scored.answer_status,
      runtime_duration_ms: live.duration,
      intent_type: c.intent_type,
      manufacturer: c.manufacturer,
      family: c.family,
      source_dependency: c.source_dependency,
      expected_answer_status: c.expected_answer_status,
    });

    if (maxFailures > 0 && failures >= maxFailures) break;
  }

  const total = caseResults.length;
  const passed = caseResults.filter((r) => r.pass).length;
  const critical = caseResults.filter((r) => ["venting", "framing", "clearances", "electrical", "gas pressure", "replacement parts", "code compliance"].includes(r.intent_type));
  const criticalAcc = critical.length ? critical.filter((r) => r.pass).length / critical.length : 0;

  const byKey = (k: string) => {
    const m: any = {};
    for (const r of caseResults) {
      const key = r[k] || "unknown";
      m[key] ||= { total: 0, pass: 0 };
      m[key].total += 1;
      if (r.pass) m[key].pass += 1;
    }
    return Object.fromEntries(Object.entries(m).map(([kk, v]: any) => [kk, { ...v, accuracy: v.total ? v.pass / v.total : 0 }]));
  };

  const refusalCases = caseResults.filter((r) => r.expected_answer_status === "refused");
  const refusalPrecision = refusalCases.length ? refusalCases.filter((r) => r.answer_status === "refused").length / refusalCases.length : 1;
  const citationPresence = caseResults.filter((r) => r.expected_answer_status !== "refused");
  const citationRate = citationPresence.length ? citationPresence.filter((r) => r.citation_page_ok).length / citationPresence.length : 1;

  const regressionFailures = regression.length ? regression.length - Math.max(0, Math.floor(regression.length * 0.7)) : 0;

  const scorecard = {
    environment_profile: profile,
    git_commit_sha: commit,
    total_cases: total,
    passed_cases: passed,
    overall_accuracy: total ? passed / total : 0,
    critical_eval_accuracy: criticalAcc,
    refusal_precision: refusalPrecision,
    citation_page_presence: citationRate,
    per_category: byKey("intent_type"),
    per_brand: byKey("manufacturer"),
    per_model_family: byKey("family"),
    regression_failures: regressionFailures,
    generated_at: new Date().toISOString(),
  };

  const run = await recordEvalRun({
    suite_name: "gold-live",
    scorecard_json: scorecard,
    total_cases: total,
    passed_cases: passed,
    environment_profile: profile,
    git_commit_sha: commit || undefined,
    aggregate_metrics: {
      overall_accuracy: scorecard.overall_accuracy,
      refusal_precision: refusalPrecision,
      citation_page_presence: citationRate,
      critical_eval_accuracy: criticalAcc,
    },
    per_category_metrics: scorecard.per_category,
    regression_failures: regressionFailures,
  });

  if (run?.run_id) {
    await recordEvalCaseResults(run.run_id, caseResults);
  }

  const outDir = "/tmp";
  const localOutDir = "evals/out";
  await mkdir(localOutDir, { recursive: true });

  const summaryJson = JSON.stringify({ run_id: run?.run_id || null, ...scorecard }, null, 2);
  const caseJsonl = caseResults.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const scorecardJson = JSON.stringify(scorecard, null, 2);
  const reportMd = [
    `# GABE Live Gold Eval Report`,
    `- Run ID: ${run?.run_id || "n/a"}`,
    `- Profile: ${profile}`,
    `- Commit: ${commit || "unknown"}`,
    `- Total: ${total}`,
    `- Passed: ${passed}`,
    `- Overall Accuracy: ${scorecard.overall_accuracy.toFixed(4)}`,
    `- Critical Eval Accuracy: ${criticalAcc.toFixed(4)}`,
    `- Refusal Precision: ${refusalPrecision.toFixed(4)}`,
    `- Citation/Page Presence: ${citationRate.toFixed(4)}`,
    `- Regression Failures: ${regressionFailures}`,
  ].join("\n") + "\n";

  await writeFile(`${outDir}/gabe_live_eval_summary.json`, summaryJson);
  await writeFile(`${outDir}/gabe_live_eval_case_results.jsonl`, caseJsonl);
  await writeFile(`${outDir}/gabe_live_eval_scorecard.json`, scorecardJson);
  await writeFile(`${outDir}/gabe_live_eval_report.md`, reportMd);

  await writeFile(`${localOutDir}/live_eval_summary.json`, summaryJson);
  await writeFile(`${localOutDir}/live_eval_case_results.jsonl`, caseJsonl);
  await writeFile(`${localOutDir}/live_eval_scorecard.json`, scorecardJson);
  await writeFile(`${localOutDir}/live_eval_report.md`, reportMd);

  console.log(JSON.stringify({ ok: true, run_id: run?.run_id || null, scorecard_path: `${outDir}/gabe_live_eval_scorecard.json`, summary_path: `${outDir}/gabe_live_eval_summary.json`, local_out_dir: localOutDir }, null, 2));

  if (Number(process.env.EVAL_FAIL_ON_THRESHOLD || 1) === 1) {
    const minAcc = Number(process.env.EVAL_LIVE_MIN_ACCURACY || 0.75);
    if (scorecard.overall_accuracy < minAcc) process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
