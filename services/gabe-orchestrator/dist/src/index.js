"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const src_1 = require("../../gabe-validator/src");
const config_1 = require("./config");
const compliance_1 = require("./engines/compliance");
const general_retrieval_1 = require("./engines/general-retrieval");
const parts_1 = require("./engines/parts");
const venting_1 = require("./engines/venting");
const wiring_1 = require("./engines/wiring");
const server = (0, node_http_1.createServer)(async (request, response) => {
    try {
        if (!request.url) {
            return sendJson(response, 400, { error: "missing url" });
        }
        if (request.method === "GET" && request.url === "/health") {
            return sendJson(response, 200, {
                ok: true,
                runtime: config_1.env.ENGINE_RUNTIME_NAME,
                buildId: config_1.env.ENGINE_BUILD_ID,
                commitSha: config_1.env.ENGINE_COMMIT_SHA,
                validatorVersion: src_1.VALIDATOR_VERSION,
            });
        }
        if (request.method === "POST" && request.url === "/query") {
            const body = (await readJson(request));
            if (!body?.question) {
                return sendJson(response, 400, { error: "question required" });
            }
            const selectedEngine = selectEngine(body.question);
            const candidate = await executeEngine(selectedEngine, body.question);
            const { answer, result } = (0, src_1.validateAnswerPath)(candidate, { selectedEngine });
            const diagnostics = {
                engine_build_id: config_1.env.ENGINE_BUILD_ID,
                engine_commit_sha: config_1.env.ENGINE_COMMIT_SHA,
                engine_runtime_name: config_1.env.ENGINE_RUNTIME_NAME,
                selected_engine: selectedEngine,
                certainty: result.certainty,
                run_outcome: result.runOutcome,
                validator_version: src_1.VALIDATOR_VERSION,
            };
            const payload = {
                ...answer,
                run: {
                    selectedEngine,
                    certainty: result.certainty,
                    runOutcome: result.runOutcome,
                    truthAuditStatus: result.truthAuditStatus,
                    sourceEvidenceStatus: result.sourceEvidenceStatus,
                    auditClassification: result.auditClassification,
                    validatorVersion: src_1.VALIDATOR_VERSION,
                    diagnostics,
                },
            };
            if (config_1.debugModeEnabled || body.debug) {
                payload.debug = diagnostics;
            }
            return sendJson(response, 200, payload);
        }
        return sendJson(response, 404, { error: "not found" });
    }
    catch (error) {
        return sendJson(response, 500, {
            error: "orchestrator failure",
            detail: error instanceof Error ? error.message : String(error),
        });
    }
});
server.listen(Number(config_1.env.PORT), "0.0.0.0", () => {
    console.log(`gabe-orchestrator listening on ${config_1.env.PORT}`);
});
function selectEngine(question) {
    const q = question.toLowerCase();
    if (/(vent|termination|horizontal run|vertical rise|elbow)/.test(q))
        return "venting";
    if (/(wire|wiring|millivolt|thermopile|switch leg|voltage)/.test(q))
        return "wiring";
    if (/(part number|part #|replacement part|exploded view)/.test(q))
        return "parts";
    if (/(clearance|code|listed|approved|inspection|compliance)/.test(q))
        return "compliance";
    return "general_retrieval";
}
async function executeEngine(selectedEngine, question) {
    switch (selectedEngine) {
        case "venting":
            return (0, venting_1.runVentingEngine)(config_1.env.GABE_RETRIEVAL_URL, question);
        case "wiring":
            return (0, wiring_1.runWiringEngine)(config_1.env.GABE_RETRIEVAL_URL, question);
        case "parts":
            return (0, parts_1.runPartsEngine)(config_1.env.GABE_RETRIEVAL_URL, question);
        case "compliance":
            return (0, compliance_1.runComplianceEngine)(config_1.env.GABE_RETRIEVAL_URL, question);
        case "general_retrieval":
        default:
            return (0, general_retrieval_1.runGeneralRetrievalEngine)(config_1.env.GABE_RETRIEVAL_URL, question);
    }
}
async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sendJson(response, statusCode, payload) {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(payload));
}
