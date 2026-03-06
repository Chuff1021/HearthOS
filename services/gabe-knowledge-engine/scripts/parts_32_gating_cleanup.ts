import fs from "node:fs";
import path from "node:path";
import { RetrievedChunk } from "../src/types";
import { buildPartsAnswerFromRecord, classifyPartsQuestionType, extractPartsRecords, pickBestPartsRecord } from "../src/swarm/partsEngine";
import { validateOrReject } from "../src/swarm/validatorAgent";

type Case = {
  id: string;
  question: string;
  expectedQtype: "part_lookup" | "diagram_callout" | "revision_disambiguation" | "alias_lookup";
  shouldAnswer: boolean;
  chunk: string;
};

function mkCases(): Case[] {
  const seeds: Omit<Case, "id">[] = [
    { question: "need replacement p/n for pilot generator thermopile", expectedQtype: "part_lookup", shouldAnswer: true, chunk: "Replacement parts list: Thermopile pilot generator part no 94400999." },
    { question: "diagram callout 14 what part", expectedQtype: "diagram_callout", shouldAnswer: true, chunk: "Exploded diagram callout 14 identifies burner assembly, item #14, P/N 250-01488." },
    { question: "rev B vs rev A family 616 valve", expectedQtype: "revision_disambiguation", shouldAnswer: true, chunk: "Family 616 revision B uses part 250-02011; revision A uses 250-02010." },
    { question: "aka / alias for convection fan kit", expectedQtype: "alias_lookup", shouldAnswer: true, chunk: "Convection fan kit (blower) also called circulation fan, part 99000111." },
    { question: "Apex 42 maybe 36, same igniter?", expectedQtype: "part_lookup", shouldAnswer: true, chunk: "Igniter electrode replacement part #93007456 listed for Apex series variants." },
    { question: "is paint code same as part number", expectedQtype: "part_lookup", shouldAnswer: false, chunk: "Finish color code BK-01 refers to paint option, not replacement parts." },
    { question: "callout ref A12 harness", expectedQtype: "diagram_callout", shouldAnswer: true, chunk: "Wiring diagram ref A12 identifies wire harness P/N 945-00421." },
    { question: "random install step question", expectedQtype: "part_lookup", shouldAnswer: false, chunk: "Step 3 install firestop and secure vent collar with screws." },
  ];

  const out: Case[] = [];
  for (let i = 1; i <= 4; i++) {
    for (let s = 0; s < seeds.length; s++) out.push({ ...seeds[s], id: `P${s + 1}-${i}` });
  }
  return out;
}

function mkChunk(c: Case): RetrievedChunk {
  return {
    manual_title: "PARTS Test Manual",
    manufacturer: "Travis Industries",
    model: "Apex 42",
    page_number: 12,
    source_url: `https://example.com/parts/${c.id}.pdf`,
    chunk_text: c.chunk,
    score: 0.91,
    source_type: "manual",
  };
}

function legacyExtractPartsRecords(chunks: RetrievedChunk[]) {
  const out: any[] = [];
  for (const c of chunks) {
    if (c.source_type !== 'manual') continue;
    const text = (c.chunk_text || '').replace(/\s+/g, ' ').trim();
    const lc = text.toLowerCase();
    if (!/(part|replacement|diagram|callout|sku|item\s*#|p\/?n\b|revision|rev\.|series|family|aka|alias)/i.test(lc)) continue;

    const partNums = Array.from(new Set((text.match(/\b(?:[A-Z]{0,3}-)?\d{3,7}[A-Z0-9-]{0,8}\b/g) || []).map((m) => m.toUpperCase())));
    const callouts = Array.from(new Set((text.match(/\b(?:item|callout|ref)\s*#?\s*[a-z0-9-]{1,8}\b/gi) || []).map((s) => s.trim())));
    const aliases = /thermopile|pilot generator|thermocouple|blower|fan/i.test(text) ? ["legacy_alias"] : [];

    if (partNums.length + callouts.length + aliases.length === 0) continue;

    out.push({
      record_id: `${c.source_url}|${c.page_number}|${c.manual_title}`,
      manual_title: c.manual_title,
      model: c.model,
      canonical_part_numbers: partNums,
      aliases_found: aliases,
      callout_refs: callouts,
      source_page: c.page_number,
      source_url: c.source_url,
      confidence: 70,
      quote: text.split(/\s+/).slice(0, 28).join(' '),
    });
  }
  return out;
}

function evaluate(mode: "legacy" | "current") {
  const cases = mkCases();
  const rows: any[] = [];
  let passed = 0;

  for (const c of cases) {
    const chunk = mkChunk(c);
    const qtype = classifyPartsQuestionType(c.question);
    const records = mode === "legacy" ? legacyExtractPartsRecords([chunk]) : extractPartsRecords([chunk]);
    const best = pickBestPartsRecord(c.question, records as any);
    const answered = Boolean(best);

    let answer: any = null;
    let validatorResult = "not_run";
    let gatingFailureReason: string | null = null;

    if (best) {
      answer = buildPartsAnswerFromRecord(best as any, c.question, records as any);
      const verdict = validateOrReject(answer as any, [chunk]);
      if (verdict.ok) {
        validatorResult = "approved";
      } else {
        validatorResult = "rejected";
        gatingFailureReason = verdict.reason;
      }
    }

    const pass = c.shouldAnswer ? (qtype === c.expectedQtype && answered === true) : (answered === false);
    if (pass) passed += 1;

    rows.push({
      test_id: c.id,
      question: c.question,
      selected_qtype: qtype,
      selected_part_record: best?.record_id || null,
      citation_fields_present: best
        ? {
            manual_title: Boolean(answer?.manual_title),
            page_number: Boolean(answer?.page_number),
            source_url: Boolean(answer?.source_url),
            quote: Boolean(answer?.quote),
          }
        : { manual_title: false, page_number: false, source_url: false, quote: false },
      final_response: answer?.answer || "<no answer>",
      validator_result: validatorResult,
      exact_gating_failure_reason: gatingFailureReason,
      pass,
    });
  }

  const total = rows.length;
  const accuracy = Number((passed / total).toFixed(3));
  const failed = rows.filter((r) => !r.pass);
  return { total, passed, accuracy, rows, failed };
}

function main() {
  const before = evaluate("legacy");
  const after = evaluate("current");

  const out = {
    before: { total: before.total, passed: before.passed, accuracy: before.accuracy },
    after: { total: after.total, passed: after.passed, accuracy: after.accuracy },
    delta: {
      passed: after.passed - before.passed,
      accuracy: Number((after.accuracy - before.accuracy).toFixed(3)),
    },
    failed_cases_before: before.failed,
    failed_cases_after: after.failed,
  };

  const outPath = path.join(__dirname, "parts_32_gating_cleanup_report.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Before: ${before.passed}/${before.total} (${(before.accuracy * 100).toFixed(1)}%)`);
  console.log(`After : ${after.passed}/${after.total} (${(after.accuracy * 100).toFixed(1)}%)`);
  console.log(`Delta : +${after.passed - before.passed}, +${((after.accuracy - before.accuracy) * 100).toFixed(1)}%`);
  console.log(`Wrote report: ${outPath}`);
}

main();
