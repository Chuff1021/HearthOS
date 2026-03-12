"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const partsEngine_1 = require("../src/swarm/partsEngine");
const validate_1 = require("../src/validation/validate");
function toChunk(c) {
    return {
        manual_title: c.manual_title,
        manufacturer: "Travis Industries",
        model: c.model,
        page_number: c.page_number,
        source_url: c.source_url,
        chunk_text: c.chunk,
        score: 0.93,
        source_type: "manual",
    };
}
function main() {
    const fixturePath = node_path_1.default.join(__dirname, "parts_test_set.json");
    const cases = JSON.parse(node_fs_1.default.readFileSync(fixturePath, "utf8"));
    const rows = [];
    let pass = 0;
    for (const c of cases) {
        const chunk = toChunk(c);
        const records = (0, partsEngine_1.extractPartsRecords)([chunk]);
        const best = (0, partsEngine_1.pickBestPartsRecord)(c.question, records);
        if (!best) {
            rows.push({ id: c.id, status: "fail", reason: "no_best_record", records: records.length });
            continue;
        }
        const answer = (0, partsEngine_1.buildPartsAnswerFromRecord)(best, c.question, records);
        let status = "pass";
        let reason = "";
        try {
            (0, validate_1.validateAnswer)(answer, [chunk]);
            pass += 1;
        }
        catch (err) {
            status = "fail";
            reason = err instanceof Error ? err.message : String(err);
        }
        rows.push({
            id: c.id,
            status,
            reason,
            records: records.length,
            confidence: answer.confidence,
            certainty: answer.certainty,
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
    const outPath = node_path_1.default.join(__dirname, "parts_truth_audit_report.json");
    node_fs_1.default.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2));
    console.log("=== PARTS TRUTH AUDIT ===");
    console.log(`Total: ${summary.total_cases}`);
    console.log(`Passed: ${summary.passed_cases}`);
    console.log(`Failed: ${summary.failed_cases}`);
    console.log(`Pass rate: ${(summary.pass_rate * 100).toFixed(1)}%`);
    console.log(`Acceptable: ${summary.acceptable ? "yes" : "no"}`);
    console.log(`Wrote report: ${outPath}`);
}
main();
