"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeValidatedResponse = composeValidatedResponse;
function composeValidatedResponse(answer) {
    // hard gate: composer only formats validator-approved payloads.
    // Keep payload machine-friendly and stable.
    const sourceType = answer.source_type || "none";
    const runOutcome = answer.run_outcome || "source_evidence_missing";
    const answerStatus = sourceType === "manual" ? (String(answer.certainty || "").includes("Exact") ? "verified" : "partial") : sourceType === "none" ? "refused" : "partial";
    const composed = {
        ...answer,
        answer: String(answer.answer || "").trim(),
        answer_text: String(answer.answer || "").trim(),
        answer_status: answerStatus,
        validator_result: runOutcome,
        cited_page_number: answer.page_number ?? null,
        evidence_excerpt: answer.quote ?? null,
        selected_manual_title: answer.manual_title ?? null,
        selected_manual_type: answer.doc_type ?? answer.preferred_manual_type ?? null,
        selected_manual_source_url: answer.source_url ?? answer.url ?? null,
        selected_manual_page: answer.page_number ?? null,
        refusal_reason: answerStatus === "refused" ? (answer.refusal_reason || answer.no_answer_reason || "insufficient_evidence") : undefined,
        engine_path_used: answer.selected_engine || "general_engine",
        selected_engine: answer.selected_engine || "general_engine",
        run_outcome: runOutcome,
        truth_audit_status: answer.truth_audit_status || "validator_passed",
        source_evidence_status: answer.source_evidence_status || (answer.source_type === "none" ? "missing" : "present"),
        validator_version: answer.validator_version || process.env.VALIDATOR_VERSION || "v1",
        engine_build_id: process.env.ENGINE_BUILD_ID || "unknown",
        engine_commit_sha: process.env.ENGINE_COMMIT_SHA || "unknown",
        engine_runtime_name: process.env.ENGINE_RUNTIME_NAME || "gabe-knowledge-engine",
        vent_template_active: String(process.env.VENT_TEMPLATE_ACTIVE || "false").toLowerCase() === "true",
    };
    return composed;
}
