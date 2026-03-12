"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const undici_1 = require("undici");
const baseUrl = process.env.GABE_ENGINE_URL || "http://localhost:4100";
const cases = [
    {
        id: "fpx42-air",
        question: "For FPX 42 Apex NexGen-Hybrid, is outside combustion air required? Cite page.",
        requiredTerms: ["air", "combustion", "outside"],
        expectedModelHints: ["42 apex", "nexgen"],
        expectedSourceUrlHints: ["100-01577", "100-01436"]
    },
    {
        id: "fpx36-air",
        question: "For FPX 36 Elite NexGen-Hybrid, what are outside air intake requirements?",
        requiredTerms: ["air", "intake"],
        expectedModelHints: ["36 elite", "nexgen"],
        expectedSourceUrlHints: ["100-01584", "100-01585"]
    },
    {
        id: "lopi-answer-vent",
        question: "For Lopi Answer NexGen-Hybrid, what is minimum chimney or vent height?",
        requiredTerms: ["chimney", "vent", "height"],
        expectedModelHints: ["answer nexgen"],
        expectedSourceUrlHints: ["100-01568"]
    },
    {
        id: "lopi-liberty-hearth",
        question: "For Lopi Liberty NexGen-Hybrid, what floor protection or hearth requirements apply?",
        requiredTerms: ["hearth", "floor", "protection"],
        expectedModelHints: ["liberty nexgen"],
        expectedSourceUrlHints: ["100-01586", "100-01511"]
    },
    {
        id: "rockport-clearance",
        question: "For Lopi Rockport NexGen-Hybrid, what is rear wall clearance requirement?",
        requiredTerms: ["clearance", "rear"],
        expectedModelHints: ["rockport nexgen"],
        expectedSourceUrlHints: ["100-01593", "rockport"]
    },
    {
        id: "probuilder-pressure",
        question: "For FPX ProBuilder 42, what are gas inlet/manifold pressure specs?",
        requiredTerms: ["pressure", "gas", "manifold"],
        expectedModelHints: ["probuilder 42"],
        expectedSourceUrlHints: ["100-01493"]
    },
    {
        id: "fpx42-framing-dimensions",
        question: "For FPX 42 Apex NexGen-Hybrid, what are the minimum framing dimensions?",
        requiredTerms: ["framing", "dimension", "minimum"],
        expectedModelHints: ["42 apex", "nexgen"],
        expectedSourceUrlHints: ["100-01577"]
    }
];
async function runOne(test) {
    const res = await (0, undici_1.fetch)(`${baseUrl}/query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: test.question })
    });
    const data = await res.json();
    const hasCitation = data?.source_type === "manual" && data?.source_url && data?.page_number && data?.quote;
    const answerText = `${data?.answer || ""} ${data?.quote || ""}`.toLowerCase();
    const termHits = test.requiredTerms.filter((t) => answerText.includes(t.toLowerCase())).length;
    const relevant = data?.source_type === "none" ? true : termHits >= 1;
    let modelMatch = true;
    let urlMatch = true;
    if (data?.source_type === "manual") {
        const modelHay = `${data?.manual_title || ""}`.toLowerCase();
        if (test.expectedModelHints && test.expectedModelHints.length > 0) {
            modelMatch = test.expectedModelHints.some((h) => modelHay.includes(h));
        }
        const urlHay = `${data?.source_url || ""}`.toLowerCase();
        if (test.expectedSourceUrlHints && test.expectedSourceUrlHints.length > 0) {
            urlMatch = test.expectedSourceUrlHints.some((h) => urlHay.includes(h));
        }
    }
    const manualPass = hasCitation && relevant && modelMatch && urlMatch;
    const webPass = data?.source_type === "web" && relevant && modelMatch && urlMatch;
    const pass = data?.source_type === "none" || manualPass || webPass;
    return { id: test.id, pass, source_type: data?.source_type, modelMatch, urlMatch, data };
}
async function main() {
    const results = [];
    for (const c of cases) {
        results.push(await runOne(c));
    }
    const passed = results.filter((r) => r.pass).length;
    console.log(JSON.stringify({ passed, total: results.length, results }, null, 2));
    if (passed < results.length)
        process.exit(1);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
