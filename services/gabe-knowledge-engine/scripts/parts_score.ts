import fs from "node:fs";
import path from "node:path";
import { buildPartsAnswerFromRecord, canonicalizePartNumbers, classifyPartsQuestionType, extractPartsRecords, pickBestPartsRecord } from "../src/swarm/partsEngine";
import { RetrievedChunk } from "../src/types";

type Case = {
  id: string;
  question: string;
  expectedQtype: "part_lookup" | "diagram_callout" | "revision_disambiguation" | "alias_lookup";
  expectedParts?: string[];
  expectedAliases?: string[];
  expectedCallouts?: string[];
  chunk: string;
  manual_title: string;
  model: string;
  page_number: number;
  source_url: string;
};

function baselineClassify(question: string): Case["expectedQtype"] {
  const q = question.toLowerCase();
  if (/diagram|callout|exploded/.test(q)) return "diagram_callout";
  if (/revision|rev\b|variant|family|series/.test(q)) return "revision_disambiguation";
  if (/alias|also called|aka|same as/.test(q)) return "alias_lookup";
  return "part_lookup";
}

function baselineCanonicalize(text: string): string[] {
  const matches = (text.match(/\b(?:[A-Z]{0,3}-)?\d{3,7}[A-Z0-9-]{0,8}\b/g) || []);
  return Array.from(new Set(matches.map((m) => m.toUpperCase().replace(/\s+/g, "")))).slice(0, 40);
}

function asChunk(c: Case): RetrievedChunk {
  return {
    manual_title: c.manual_title,
    manufacturer: "Travis Industries",
    model: c.model,
    page_number: c.page_number,
    source_url: c.source_url,
    chunk_text: c.chunk,
    score: 0.91,
    source_type: "manual",
  };
}

function overlapScore(expected: string[] = [], actual: string[] = []) {
  if (!expected.length) return 1;
  const a = new Set(actual.map((x) => x.toLowerCase()));
  let hits = 0;
  for (const e of expected) if (a.has(e.toLowerCase())) hits += 1;
  return hits / expected.length;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function main() {
  const fixturePath = path.join(__dirname, "parts_test_set.json");
  const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Case[];

  let beforeQ = 0;
  let afterQ = 0;
  let beforeParts = 0;
  let afterParts = 0;
  let afterAlias = 0;
  let afterCallout = 0;
  let validAnswers = 0;
  let structuredRecords = 0;

  const details: any[] = [];

  for (const c of cases) {
    const chunk = asChunk(c);

    const bq = baselineClassify(c.question);
    const aq = classifyPartsQuestionType(c.question);
    if (bq === c.expectedQtype) beforeQ += 1;
    if (aq === c.expectedQtype) afterQ += 1;

    const bp = baselineCanonicalize(c.chunk);
    const ap = canonicalizePartNumbers(c.chunk);
    beforeParts += overlapScore(c.expectedParts || [], bp);
    afterParts += overlapScore(c.expectedParts || [], ap);

    const records = extractPartsRecords([chunk]);
    structuredRecords += records.length;
    const best = pickBestPartsRecord(c.question, records);

    if (best) {
      const answer = buildPartsAnswerFromRecord(best, c.question, records);
      if (answer.manual_title && answer.page_number && answer.source_url && answer.quote && answer.certainty) {
        validAnswers += 1;
      }
      afterAlias += overlapScore(c.expectedAliases || [], best.aliases_found);
      afterCallout += overlapScore(c.expectedCallouts || [], best.callout_refs);
    }

    details.push({
      id: c.id,
      expectedQtype: c.expectedQtype,
      baselineQtype: bq,
      newQtype: aq,
      expectedParts: c.expectedParts || [],
      baselineParts: bp,
      newParts: ap,
      recordsCreated: records.length,
      bestRecordId: best?.record_id || null,
    });
  }

  const n = cases.length;
  const summary = {
    cases: n,
    structured_records_created: structuredRecords,
    before: {
      qtype_accuracy: Number((beforeQ / n).toFixed(3)),
      part_extraction_recall: Number((beforeParts / n).toFixed(3)),
    },
    after: {
      qtype_accuracy: Number((afterQ / n).toFixed(3)),
      part_extraction_recall: Number((afterParts / n).toFixed(3)),
      alias_match_recall: Number((afterAlias / n).toFixed(3)),
      callout_match_recall: Number((afterCallout / n).toFixed(3)),
      contract_fields_present: Number((validAnswers / n).toFixed(3)),
    },
  };

  const delta = {
    qtype_accuracy: Number((summary.after.qtype_accuracy - summary.before.qtype_accuracy).toFixed(3)),
    part_extraction_recall: Number((summary.after.part_extraction_recall - summary.before.part_extraction_recall).toFixed(3)),
  };

  console.log("=== PARTS SCORER (10-case focused set) ===");
  console.log(`Cases: ${n}`);
  console.log(`Structured records created: ${structuredRecords}`);
  console.log(`Before qtype accuracy: ${pct(summary.before.qtype_accuracy)}`);
  console.log(`After  qtype accuracy: ${pct(summary.after.qtype_accuracy)}`);
  console.log(`Delta  qtype accuracy: ${pct(delta.qtype_accuracy)}`);
  console.log(`Before part extraction recall: ${pct(summary.before.part_extraction_recall)}`);
  console.log(`After  part extraction recall: ${pct(summary.after.part_extraction_recall)}`);
  console.log(`Delta  part extraction recall: ${pct(delta.part_extraction_recall)}`);
  console.log(`After alias recall: ${pct(summary.after.alias_match_recall)}`);
  console.log(`After callout recall: ${pct(summary.after.callout_match_recall)}`);
  console.log(`After contract fields present: ${pct(summary.after.contract_fields_present)}`);

  const outPath = path.join(__dirname, "parts_score_report.json");
  fs.writeFileSync(outPath, JSON.stringify({ summary, delta, details }, null, 2));
  console.log(`Wrote report: ${outPath}`);
}

main();
