"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const ventingEngine_1 = require("../src/swarm/ventingEngine");
function mkCases() {
    const seeds = [
        {
            question: "Need min rise b4 horizontal run on Apex42?",
            expectedQtype: "min_rise_before_horizontal",
            expectedRule: "minimum vertical rise before horizontal",
            expectedKeyTerms: ["minimum", "rise", "horizontal"],
            shouldAnswer: true,
            chunk: "Venting rules: minimum vertical rise of 24 inches before any horizontal run is required.",
            model: "Apex 42",
        },
        {
            question: "max hori run?? gsb2 dv",
            expectedQtype: "max_horizontal_run",
            expectedRule: "maximum horizontal run",
            expectedKeyTerms: ["max", "horizontal", "run"],
            shouldAnswer: true,
            chunk: "Direct vent maximum horizontal run of 20 feet when configured per vent table.",
            model: "GSB2",
        },
        {
            question: "vertical limit for this vent setup",
            expectedQtype: "max_vertical_run",
            expectedRule: "maximum vertical run",
            expectedKeyTerms: ["maximum", "vertical", "run"],
            shouldAnswer: true,
            chunk: "Maximum vertical run of 40 feet is allowed with approved cap per vent chart.",
            model: "Apex 42",
        },
        {
            question: "do elbows kill run length",
            expectedQtype: "elbow_offset_effect",
            expectedRule: "elbow equivalent run penalty",
            expectedKeyTerms: ["elbow", "equivalent", "run"],
            shouldAnswer: true,
            chunk: "Each 90-degree elbow counts as 3 feet equivalent run.",
            model: "Apex 42",
        },
        {
            question: "termination near window/door opening?",
            expectedQtype: "termination_restriction",
            expectedRule: "termination/window-door clearances",
            expectedKeyTerms: ["termination", "window", "door", "clearance"],
            shouldAnswer: true,
            chunk: "Vent termination must maintain clearance from window and door openings.",
            model: "Apex 42",
        },
        {
            question: "which pipe family is approved",
            expectedQtype: "pipe_or_family",
            expectedRule: "approved vent family/pipe type",
            expectedKeyTerms: ["approved", "vent family", "pipe"],
            shouldAnswer: true,
            chunk: "Approved vent family: Simpson Dura-Vent direct vent components only.",
            model: "Apex 42",
        },
        {
            question: "Apex maybe 36 or 42, what venting applies?",
            expectedQtype: "general_venting",
            expectedRule: "model-specific vent table guidance",
            expectedKeyTerms: ["model", "vent table"],
            shouldAnswer: true,
            chunk: "For Apex family models, venting must follow model-specific vent tables in this manual.",
            model: "Apex",
        },
        {
            question: "random question about paint color",
            expectedQtype: "general_venting",
            expectedRule: "refusal expected (non-venting)",
            expectedKeyTerms: ["none"],
            shouldAnswer: false,
            chunk: "Finish options include matte black, bronze, and nickel trims.",
            model: "Apex 42",
        },
    ];
    const out = [];
    for (let i = 1; i <= 4; i++) {
        for (let s = 0; s < seeds.length; s++) {
            out.push({ ...seeds[s], id: `V${s + 1}-${i}` });
        }
    }
    return out;
}
function mkChunk(c) {
    return {
        manual_title: "VENTING Test Manual",
        manufacturer: "Travis Industries",
        model: c.model,
        page_number: 10,
        source_url: `https://example.com/venting/${c.id}.pdf`,
        chunk_text: c.chunk,
        score: 0.92,
        source_type: "manual",
    };
}
function legacyClassifyVentingQuestionType(question) {
    const q = question.toLowerCase();
    if ((q.includes('minimum') || q.includes('min')) && q.includes('rise'))
        return 'min_rise_before_horizontal';
    if (q.includes('maximum') && q.includes('horizontal'))
        return 'max_horizontal_run';
    if (q.includes('maximum') && q.includes('vertical'))
        return 'max_vertical_run';
    if (q.includes('elbow') || q.includes('offset'))
        return 'elbow_offset_effect';
    if (q.includes('termination') || q.includes('window') || q.includes('door') || q.includes('opening'))
        return 'termination_restriction';
    if (q.includes('pipe') || q.includes('vent family') || q.includes('approved'))
        return 'pipe_or_family';
    return 'general_venting';
}
function legacyExtractVentRuleRecords(chunks) {
    return chunks.flatMap((c) => {
        if (c.source_type !== 'manual')
            return [];
        const text = (c.chunk_text || '').replace(/\s+/g, ' ');
        const lc = text.toLowerCase();
        if (!/vent|termination|horizontal|vertical|elbow|pipe/.test(lc))
            return [];
        const has = (re) => re.test(text);
        const hasAny = has(/\b(4\s*[x×]\s*6\s*5?\b|5\s*[x×]\s*8\b|3\s*[x×]\s*5\b)/i) ||
            has(/approved\s+vent/i) ||
            has(/minimum\s+(?:vertical\s+)?rise/i) ||
            has(/maximum\s+vertical/i) ||
            has(/maximum\s+horizontal/i) ||
            has(/90\s*°|90-degree|elbow/i) ||
            has(/window|door|opening/i);
        if (!hasAny)
            return [];
        return (0, ventingEngine_1.extractVentRuleRecords)([c]);
    });
}
function evaluate(cases, mode) {
    const rows = [];
    let passed = 0;
    for (const c of cases) {
        const chunk = mkChunk(c);
        const recs = mode === "legacy" ? legacyExtractVentRuleRecords([chunk]) : (0, ventingEngine_1.extractVentRuleRecords)([chunk]);
        const qtype = mode === "legacy" ? legacyClassifyVentingQuestionType(c.question) : (0, ventingEngine_1.classifyVentingQuestionType)(c.question);
        const best = (0, ventingEngine_1.pickBestVentRule)(c.question, recs);
        const answered = Boolean(best);
        const pass = qtype === c.expectedQtype && answered === c.shouldAnswer;
        if (pass)
            passed += 1;
        const answer = best ? (0, ventingEngine_1.buildVentingAnswerFromRecord)(best, c.question) : null;
        const bucket = pass ? null : (!answered ? "retrieval gap" : "scorer mismatch");
        rows.push({
            test_id: c.id,
            question: c.question,
            expected_key_terms: c.expectedKeyTerms,
            expected_rule: c.expectedRule,
            detected_vent_qtype: qtype,
            selected_vent_rule_record: best?.record_id || null,
            source_page: best?.source_page ?? null,
            structured_fields_populated: best
                ? Object.entries(best)
                    .filter(([k, v]) => [
                    "vent_system_pipe_type",
                    "approved_vent_family",
                    "min_rise",
                    "max_vertical",
                    "max_horizontal",
                    "elbow_offset_constraints",
                    "equivalent_run_penalty",
                    "window_door_clearance_notes",
                    "required_conditions",
                    "termination_constraints",
                ].includes(k) && !!v)
                    .map(([k]) => k)
                : [],
            final_response: answer?.answer || "<no answer>",
            exact_failure_bucket: bucket,
            pass,
        });
    }
    const total = cases.length;
    const accuracy = Number((passed / total).toFixed(3));
    const failures = rows.filter((r) => !r.pass);
    const counts = {};
    for (const f of failures) {
        if (!f.exact_failure_bucket)
            continue;
        counts[f.exact_failure_bucket] = (counts[f.exact_failure_bucket] || 0) + 1;
    }
    const topModes = Object.entries(counts)
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    return { total, passed, accuracy, rows, failures, topModes };
}
function main() {
    const cases = mkCases();
    const before = evaluate(cases, "legacy");
    const after = evaluate(cases, "current");
    const result = {
        before: { total: before.total, passed: before.passed, accuracy: before.accuracy },
        after: { total: after.total, passed: after.passed, accuracy: after.accuracy },
        delta: {
            passed: after.passed - before.passed,
            accuracy: Number((after.accuracy - before.accuracy).toFixed(3)),
        },
        failed_cases_before: before.failures,
        failed_cases_after: after.failures,
        top_failure_modes_after: after.topModes,
    };
    const outPath = node_path_1.default.join(__dirname, "venting_32_hardening_report.json");
    node_fs_1.default.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`Before: ${before.passed}/${before.total} (${(before.accuracy * 100).toFixed(1)}%)`);
    console.log(`After : ${after.passed}/${after.total} (${(after.accuracy * 100).toFixed(1)}%)`);
    console.log(`Delta : +${after.passed - before.passed}, +${((after.accuracy - before.accuracy) * 100).toFixed(1)}%`);
    console.log(`Wrote report: ${outPath}`);
}
main();
