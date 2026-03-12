"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const ventingEngine_1 = require("../src/swarm/ventingEngine");
const wiringEngine_1 = require("../src/swarm/wiringEngine");
const partsEngine_1 = require("../src/swarm/partsEngine");
const complianceEngine_1 = require("../src/swarm/complianceEngine");
function mkChunk(c) {
    return {
        manual_title: `${c.engine.toUpperCase()} Test Manual`,
        manufacturer: "Travis Industries",
        model: c.question.includes("Apex") ? "Apex 42" : "GSB2",
        page_number: 10,
        source_url: `https://example.com/${c.engine}/${c.id}.pdf`,
        chunk_text: c.chunk,
        score: c.score ?? 0.9,
        source_type: "manual",
    };
}
function baselineVentingQType(question) {
    const q = question.toLowerCase();
    if (q.includes("horizontal"))
        return "max_horizontal_run";
    if (q.includes("vertical"))
        return "max_vertical_run";
    if (q.includes("elbow"))
        return "elbow_offset_effect";
    if (q.includes("termination") || q.includes("window") || q.includes("door"))
        return "termination_restriction";
    return "general_venting";
}
function baselineWiringQType(question) {
    const q = question.toLowerCase();
    if (q.includes("switch"))
        return "switch_module_relationship";
    if (q.includes("valve"))
        return "valve_module_relationship";
    if (q.includes("transformer"))
        return "transformer_relationship";
    return "connection_path";
}
function baselinePartsQType(question) {
    const q = question.toLowerCase();
    if (q.includes("diagram") || q.includes("callout"))
        return "diagram_callout";
    if (q.includes("revision") || q.includes("family"))
        return "revision_disambiguation";
    if (q.includes("alias") || q.includes("aka"))
        return "alias_lookup";
    return "part_lookup";
}
function baselineComplianceQType(question) {
    const q = question.toLowerCase();
    if (q.includes("listing") || q.includes("csa") || q.includes("ul"))
        return "listing";
    if (q.includes("approval") || q.includes("approved"))
        return "approval";
    if (q.includes("inspection"))
        return "inspection";
    if (q.includes("permit"))
        return "permit";
    if (q.includes("code"))
        return "code_vs_manufacturer";
    return "clearance_compliance";
}
function baselineShouldAnswer(c) {
    if (c.engine === "compliance")
        return /listed|approved|inspection|permit|code|clearance/i.test(c.chunk);
    if (c.engine === "parts")
        return /part|callout|sku|p\/n|revision|alias/i.test(c.chunk);
    if (c.engine === "wiring")
        return /wiring|switch|module|receiver|transformer|valve/i.test(c.chunk);
    return /vent|termination|horizontal|vertical|elbow|pipe/i.test(c.chunk);
}
function classifyCause(engine, shouldAnswer, answered, qtypeOk, notes) {
    const blob = notes.join("|").toLowerCase();
    if (shouldAnswer && !answered)
        return blob.includes("missing") ? "source-evidence limitation" : "retrieval gap";
    if (!shouldAnswer && answered)
        return "validator/gating issue";
    if (!qtypeOk)
        return "scorer mismatch";
    if (blob.includes("missing_fields"))
        return "extraction gap";
    return engine === "compliance" ? "validator/gating issue" : "extraction gap";
}
function top3Failures(rows) {
    const counts = new Map();
    for (const r of rows) {
        if (!r.pass && r.cause)
            counts.set(r.cause, (counts.get(r.cause) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cause, n]) => ({ cause, count: n }));
}
function evaluateEngine(engine, cases) {
    const rows = [];
    let beforePassed = 0;
    let afterPassed = 0;
    for (const c of cases) {
        const chunk = mkChunk(c);
        let bq = "";
        let aq = "";
        let answered = false;
        let notes = [];
        if (engine === "venting") {
            bq = baselineVentingQType(c.question);
            aq = (0, ventingEngine_1.classifyVentingQuestionType)(c.question);
            const recs = (0, ventingEngine_1.extractVentRuleRecords)([chunk]);
            const best = (0, ventingEngine_1.pickBestVentRule)(c.question, recs);
            answered = Boolean(best);
            notes = best ? (0, ventingEngine_1.buildVentingAnswerFromRecord)(best, c.question).validator_notes || [] : ["source_not_found"];
        }
        else if (engine === "wiring") {
            bq = baselineWiringQType(c.question);
            aq = (0, wiringEngine_1.classifyWiringQuestionType)(c.question);
            const recs = (0, wiringEngine_1.extractWiringRecords)([chunk]);
            const best = (0, wiringEngine_1.pickBestWiringRecord)(c.question, recs);
            answered = Boolean(best);
            notes = best ? (0, wiringEngine_1.buildWiringAnswerFromRecord)(best, c.question, recs).validator_notes || [] : ["source_not_found"];
        }
        else if (engine === "parts") {
            bq = baselinePartsQType(c.question);
            aq = (0, partsEngine_1.classifyPartsQuestionType)(c.question);
            const recs = (0, partsEngine_1.extractPartsRecords)([chunk]);
            const best = (0, partsEngine_1.pickBestPartsRecord)(c.question, recs);
            answered = Boolean(best);
            notes = best ? (0, partsEngine_1.buildPartsAnswerFromRecord)(best, c.question, recs).validator_notes || [] : ["source_not_found"];
        }
        else {
            bq = baselineComplianceQType(c.question);
            aq = (0, complianceEngine_1.classifyComplianceQuestionType)(c.question);
            const recs = (0, complianceEngine_1.extractComplianceRecords)([chunk], c.question);
            const best = (0, complianceEngine_1.pickBestComplianceRecord)(c.question, recs);
            answered = Boolean(best);
            const ans = best ? (0, complianceEngine_1.buildComplianceAnswerFromRecord)(best, c.question) : (0, complianceEngine_1.buildComplianceRefusal)(c.question);
            notes = ans.validator_notes || [];
        }
        const beforePass = bq === c.expectedQtype && baselineShouldAnswer(c) === c.shouldAnswer;
        const qtypeOk = aq === c.expectedQtype;
        const afterPass = qtypeOk && answered === c.shouldAnswer;
        if (beforePass)
            beforePassed += 1;
        if (afterPass)
            afterPassed += 1;
        rows.push({
            id: c.id,
            pass: afterPass,
            beforePass,
            cause: afterPass ? undefined : classifyCause(engine, c.shouldAnswer, answered, qtypeOk, notes),
        });
    }
    const total = cases.length;
    const beforeAcc = Number((beforePassed / total).toFixed(3));
    const afterAcc = Number((afterPassed / total).toFixed(3));
    return {
        total,
        before: { total, passed: beforePassed, accuracy: beforeAcc },
        after: { total, passed: afterPassed, accuracy: afterAcc },
        delta: {
            passed: afterPassed - beforePassed,
            accuracy: Number((afterAcc - beforeAcc).toFixed(3)),
        },
        topFailures: top3Failures(rows),
        rows,
    };
}
function buildCases() {
    const venting = [];
    const ventPrompts = [
        ["V01", "Need min rise b4 horizontal run on Apex42?", "min_rise_before_horizontal", true, "Venting rules: minimum vertical rise of 24 inches before any horizontal run is required."],
        ["V02", "max hori run?? gsb2 dv", "max_horizontal_run", true, "Direct vent maximum horizontal run of 20 feet when configured per table."],
        ["V03", "vertical limit for this vent setup", "max_vertical_run", true, "Maximum vertical run of 40 feet is allowed with approved cap."],
        ["V04", "do elbows kill run length", "elbow_offset_effect", true, "Each 90-degree elbow counts as 3 feet equivalent run."],
        ["V05", "termination near window/door opening?", "termination_restriction", true, "Vent termination must maintain clearance from window and door openings."],
        ["V06", "which pipe family is approved", "pipe_or_family", true, "Approved vent family: Simpson Dura-Vent direct vent components only."],
        ["V07", "Apex maybe 36 or 42, what venting applies?", "general_venting", true, "For Apex family models, venting must follow model-specific vent tables in this manual."],
        ["V08", "random question about paint color", "general_venting", false, "Finish options include matte black, bronze, and nickel trims."],
    ];
    for (let i = 0; i < 4; i++) {
        for (const [id, q, t, a, chunk] of ventPrompts) {
            venting.push({ id: `${id}-${i + 1}`, engine: "venting", question: `${q} ${i % 2 ? "pls" : ""}`.trim(), expectedQtype: t, shouldAnswer: a, chunk });
        }
    }
    const wiring = [];
    const wiringPrompts = [
        ["W01", "switch to module terminal mapping?", "switch_module_relationship", true, "Wiring: wall switch wires to control module TH/TP terminal."],
        ["W02", "xfmr feed path into IFC", "transformer_relationship", true, "24V transformer feeds the control module power input."],
        ["W03", "module output to valve relation", "valve_module_relationship", true, "Control module output commands gas valve opening."],
        ["W04", "receiver/ifc chain plz", "receiver_ifc_relationship", true, "Remote receiver connects to control module harness."],
        ["W05", "canonical components in circuit", "canonical_components", true, "Circuit includes transformer, wall switch, control module, receiver, gas valve."],
        ["W06", "full path power to valve??", "full_path_summary", true, "Transformer to control module to gas valve; receiver and switch provide control signals."],
        ["W07", "Apex or maybe GSB variant wiring?", "connection_path", true, "Wiring path differs by variant; module and valve relationship remains module to valve."],
        ["W08", "what glass media color fits", "connection_path", false, "Decorative media options include driftwood and glass bead kits."],
    ];
    for (let i = 0; i < 4; i++) {
        for (const [id, q, t, a, chunk] of wiringPrompts) {
            wiring.push({ id: `${id}-${i + 1}`, engine: "wiring", question: `${q} ${i % 2 ? "urgent" : ""}`.trim(), expectedQtype: t, shouldAnswer: a, chunk });
        }
    }
    const parts = [];
    const partsPrompts = [
        ["P01", "need replacement p/n for pilot generator thermopile", "part_lookup", true, "Replacement parts list: Thermopile pilot generator part no 94400999."],
        ["P02", "diagram callout 14 what part", "diagram_callout", true, "Exploded diagram callout 14 identifies burner assembly, item #14, P/N 250-01488."],
        ["P03", "rev B vs rev A family 616 valve", "revision_disambiguation", true, "Family 616 revision B uses part 250-02011; revision A uses 250-02010."],
        ["P04", "aka / alias for convection fan kit", "alias_lookup", true, "Convection fan kit (blower) also called circulation fan, part 99000111."],
        ["P05", "Apex 42 maybe 36, same igniter?", "part_lookup", true, "Igniter electrode replacement part #93007456 listed for Apex series variants."],
        ["P06", "is paint code same as part number", "part_lookup", false, "Finish color code BK-01 refers to paint option, not replacement parts."],
        ["P07", "callout ref A12 harness", "diagram_callout", true, "Wiring diagram ref A12 identifies wire harness P/N 945-00421."],
        ["P08", "random install step question", "part_lookup", false, "Step 3 install firestop and secure vent collar with screws."],
    ];
    for (let i = 0; i < 4; i++) {
        for (const [id, q, t, a, chunk] of partsPrompts) {
            parts.push({ id: `${id}-${i + 1}`, engine: "parts", question: `${q} ${i % 2 ? "pls" : ""}`.trim(), expectedQtype: t, shouldAnswer: a, chunk });
        }
    }
    const compliance = [];
    const compPrompts = [
        ["C01", "is this UL/CSA listed", "listing", true, "Appliance is listed to ANSI Z21.88 and certified by CSA."],
        ["C02", "approved for mfg home install?", "approval", true, "Approved for manufactured home installation when installed per manufacturer requirements."],
        ["C03", "inspection language required", "inspection", true, "Installation must be inspected by authority having jurisdiction."],
        ["C04", "permit needed or nah", "permit", true, "Permit and final inspection requirements are determined by local jurisdiction and AHJ."],
        ["C05", "code vs manufacturer for clearances", "code_vs_manufacturer", true, "Manufacturer requires listed clearances; local authority may require stricter code compliance."],
        ["C06", "clearance compliance sidewall", "clearance_compliance", true, "Minimum side clearance to combustibles shall be maintained as listed in Table 4."],
        ["C07", "is this approved?", "approval", false, "Decorative front options available in black and bronze."],
        ["C08", "permit for this??", "permit", false, "Daily operation instructions for remote control pairing."],
    ];
    for (let i = 0; i < 4; i++) {
        for (const [id, q, t, a, chunk] of compPrompts) {
            compliance.push({ id: `${id}-${i + 1}`, engine: "compliance", question: `${q} ${i % 2 ? "need quick answer" : ""}`.trim(), expectedQtype: t, shouldAnswer: a, chunk });
        }
    }
    return { venting, wiring, parts, compliance };
}
function main() {
    const sets = buildCases();
    const report = {
        venting: evaluateEngine("venting", sets.venting),
        wiring: evaluateEngine("wiring", sets.wiring),
        parts: evaluateEngine("parts", sets.parts),
        compliance: evaluateEngine("compliance", sets.compliance),
        generated_at: new Date().toISOString(),
    };
    const outPath = node_path_1.default.join(__dirname, "expanded_engine_eval_report.json");
    node_fs_1.default.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("=== EXPANDED ENGINE EVAL (32 cases each) ===");
    for (const key of ["venting", "wiring", "parts", "compliance"]) {
        const r = report[key];
        console.log(`${key}: before ${r.before.passed}/${r.before.total} (${(r.before.accuracy * 100).toFixed(1)}%) -> after ${r.after.passed}/${r.after.total} (${(r.after.accuracy * 100).toFixed(1)}%), delta ${r.delta.passed}, ${(r.delta.accuracy * 100).toFixed(1)}%`);
    }
    console.log(`Wrote report: ${outPath}`);
}
main();
