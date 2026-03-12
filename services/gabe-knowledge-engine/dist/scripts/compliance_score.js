"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const complianceEngine_1 = require("../src/swarm/complianceEngine");
function baselineClassify(question) {
    const q = question.toLowerCase();
    if (/listing|ul|csa/.test(q))
        return "listing";
    if (/approved|approval/.test(q))
        return "approval";
    if (/inspection|inspect/.test(q))
        return "inspection";
    if (/permit/.test(q))
        return "permit";
    if (/code vs|local code/.test(q))
        return "code_vs_manufacturer";
    return "clearance_compliance";
}
function baselineHasExplicit(chunk) {
    return /code|inspection|permit|approved|listed/i.test(chunk);
}
function toChunk(c) {
    return {
        manual_title: c.manual_title,
        manufacturer: "Travis Industries",
        model: c.model,
        page_number: c.page_number,
        source_url: c.source_url,
        chunk_text: c.chunk,
        score: 0.9,
        source_type: "manual",
    };
}
function main() {
    const fixturePath = node_path_1.default.join(__dirname, "compliance_test_set.json");
    const cases = JSON.parse(node_fs_1.default.readFileSync(fixturePath, "utf8"));
    let beforeQ = 0;
    let afterQ = 0;
    let beforeSupport = 0;
    let afterSupport = 0;
    let contractPass = 0;
    let structuredRecords = 0;
    const details = [];
    for (const c of cases) {
        const bq = baselineClassify(c.question);
        const aq = (0, complianceEngine_1.classifyComplianceQuestionType)(c.question);
        if (bq === c.expectedQtype)
            beforeQ += 1;
        if (aq === c.expectedQtype)
            afterQ += 1;
        const chunk = toChunk(c);
        const bSupport = baselineHasExplicit(c.chunk);
        if (bSupport === c.shouldAnswer)
            beforeSupport += 1;
        const records = (0, complianceEngine_1.extractComplianceRecords)([chunk], c.question);
        structuredRecords += records.length;
        const best = (0, complianceEngine_1.pickBestComplianceRecord)(c.question, records);
        const aSupport = Boolean(best);
        if (aSupport === c.shouldAnswer)
            afterSupport += 1;
        const answer = best ? (0, complianceEngine_1.buildComplianceAnswerFromRecord)(best, c.question) : (0, complianceEngine_1.buildComplianceRefusal)(c.question);
        const hasContract = answer.source_type === "manual"
            ? Boolean(answer.manual_title && answer.page_number && answer.source_url && answer.quote && answer.certainty && answer.run_outcome)
            : Boolean(answer.certainty && answer.run_outcome);
        if (hasContract)
            contractPass += 1;
        details.push({
            id: c.id,
            expectedQtype: c.expectedQtype,
            baselineQtype: bq,
            newQtype: aq,
            expectedSupport: c.shouldAnswer,
            baselineSupport: bSupport,
            newSupport: aSupport,
            recordsCreated: records.length,
            outcome: answer.run_outcome,
        });
    }
    const n = cases.length;
    const summary = {
        cases: n,
        structured_records_created: structuredRecords,
        before: {
            qtype_accuracy: Number((beforeQ / n).toFixed(3)),
            support_gating_accuracy: Number((beforeSupport / n).toFixed(3)),
        },
        after: {
            qtype_accuracy: Number((afterQ / n).toFixed(3)),
            support_gating_accuracy: Number((afterSupport / n).toFixed(3)),
            contract_fields_present: Number((contractPass / n).toFixed(3)),
        },
    };
    const delta = {
        qtype_accuracy: Number((summary.after.qtype_accuracy - summary.before.qtype_accuracy).toFixed(3)),
        support_gating_accuracy: Number((summary.after.support_gating_accuracy - summary.before.support_gating_accuracy).toFixed(3)),
    };
    const outPath = node_path_1.default.join(__dirname, "compliance_score_report.json");
    node_fs_1.default.writeFileSync(outPath, JSON.stringify({ summary, delta, details }, null, 2));
    console.log("=== COMPLIANCE SCORER (10-case focused set) ===");
    console.log(`Cases: ${n}`);
    console.log(`Structured records created: ${structuredRecords}`);
    console.log(`Before qtype accuracy: ${(summary.before.qtype_accuracy * 100).toFixed(1)}%`);
    console.log(`After  qtype accuracy: ${(summary.after.qtype_accuracy * 100).toFixed(1)}%`);
    console.log(`Delta  qtype accuracy: ${(delta.qtype_accuracy * 100).toFixed(1)}%`);
    console.log(`Before support gating accuracy: ${(summary.before.support_gating_accuracy * 100).toFixed(1)}%`);
    console.log(`After  support gating accuracy: ${(summary.after.support_gating_accuracy * 100).toFixed(1)}%`);
    console.log(`Delta  support gating accuracy: ${(delta.support_gating_accuracy * 100).toFixed(1)}%`);
    console.log(`After contract fields present: ${(summary.after.contract_fields_present * 100).toFixed(1)}%`);
    console.log(`Wrote report: ${outPath}`);
}
main();
