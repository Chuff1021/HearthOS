import fs from "node:fs";
import path from "node:path";
import { buildComplianceAnswerFromRecord, classifyComplianceQuestionType, extractComplianceRecords, pickBestComplianceRecord } from "../src/swarm/complianceEngine";
import { validateAnswer } from "../src/validation/validate";
import { RetrievedChunk } from "../src/types";

type Case = { id: string; question: string; shouldAnswer: boolean; chunk: string; manual_title: string; model: string; page_number: number; source_url: string };

function toChunk(c: Case): RetrievedChunk {
  return {
    manual_title: c.manual_title,
    manufacturer: "Travis Industries",
    model: c.model,
    page_number: c.page_number,
    source_url: c.source_url,
    chunk_text: c.chunk,
    score: 0.92,
    source_type: "manual",
  };
}

function main() {
  const fixturePath = path.join(__dirname, "compliance_test_set.json");
  const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Case[];

  const rows: any[] = [];
  let pass = 0;

  for (const c of cases) {
    const chunk = toChunk(c);
    const records = extractComplianceRecords([chunk], c.question);
    const best = pickBestComplianceRecord(c.question, records);

    if (!best) {
      const okRefusal = !c.shouldAnswer;
      if (okRefusal) pass += 1;
      rows.push({
        id: c.id,
        qtype: classifyComplianceQuestionType(c.question),
        status: okRefusal ? "pass" : "fail",
        reason: okRefusal ? "refusal_expected" : "missing_required_support",
        run_outcome: "refused_missing_explicit_support",
        records: records.length,
      });
      continue;
    }

    const answer = buildComplianceAnswerFromRecord(best, c.question) as any;
    let status = "pass";
    let reason = "";

    try {
      validateAnswer(answer, [chunk]);
      if (!c.shouldAnswer) {
        status = "fail";
        reason = "answered_when_refusal_expected";
      }
    } catch (err) {
      status = "fail";
      reason = err instanceof Error ? err.message : String(err);
    }

    if (status === "pass") pass += 1;

    rows.push({
      id: c.id,
      qtype: classifyComplianceQuestionType(c.question),
      status,
      reason,
      run_outcome: answer.run_outcome,
      certainty: answer.certainty,
      records: records.length,
      manual_title: answer.manual_title,
      page_number: answer.page_number,
      source_url: answer.source_url,
      quote: answer.quote,
    });
  }

  const summary = {
    total_cases: cases.length,
    passed_cases: pass,
    failed_cases: cases.length - pass,
    pass_rate: Number((pass / cases.length).toFixed(3)),
    acceptable: pass / cases.length >= 0.8,
  };

  const outPath = path.join(__dirname, "compliance_truth_audit_report.json");
  fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2));

  console.log("=== COMPLIANCE TRUTH AUDIT ===");
  console.log(`Total: ${summary.total_cases}`);
  console.log(`Passed: ${summary.passed_cases}`);
  console.log(`Failed: ${summary.failed_cases}`);
  console.log(`Pass rate: ${(summary.pass_rate * 100).toFixed(1)}%`);
  console.log(`Acceptable: ${summary.acceptable ? "yes" : "no"}`);
  console.log(`Wrote report: ${outPath}`);
}

main();
