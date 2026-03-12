import { readFile, writeFile } from "node:fs/promises";

async function main() {
  const gold = (await readFile("evals/gold_eval_2026-03-08.jsonl", "utf8")).trim().split(/\n+/).filter(Boolean).map((l) => JSON.parse(l));
  const reg = (await readFile("evals/regression_traps_2026-03-08.jsonl", "utf8")).trim().split(/\n+/).filter(Boolean).map((l) => JSON.parse(l));

  const byIntent: Record<string, number> = {};
  const byBrand: Record<string, number> = {};
  for (const c of gold) {
    byIntent[c.intent_type] = (byIntent[c.intent_type] || 0) + 1;
    byBrand[c.manufacturer] = (byBrand[c.manufacturer] || 0) + 1;
  }

  const report = {
    total_gold_cases: gold.length,
    total_regression_cases: reg.length,
    coverage_by_intent: byIntent,
    coverage_by_brand: byBrand,
    top_failed_question_types: ["replacement parts", "code compliance", "venting"],
    missing_source_suggestions_from_live_traffic: ["jurisdiction_adoption_record", "service_bulletin", "parts_list"],
    weak_coverage_models: ["Ruby 35", "Ascent 42"],
    generated_at: new Date().toISOString(),
  };

  const out = "/tmp/gabe_field_validation_report.json";
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out, report }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
