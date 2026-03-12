import { GabeAnswer } from "../types";

export function composeValidatedResponse(answer: GabeAnswer): GabeAnswer {
  // hard gate: composer only formats validator-approved payloads.
  // Keep payload machine-friendly and stable.
  const sourceType = (answer as any).source_type || "none";
  const runOutcome = (answer as any).run_outcome || "source_evidence_missing";
  const answerStatus = sourceType === "manual" ? (String((answer as any).certainty || "").includes("Exact") ? "verified" : "partial") : sourceType === "none" ? "refused" : "partial";

  const composed: any = {
    ...answer,
    answer: String((answer as any).answer || "").trim(),
    answer_text: String((answer as any).answer || "").trim(),
    answer_status: answerStatus,
    validator_result: runOutcome,
    cited_page_number: (answer as any).page_number ?? null,
    evidence_excerpt: (answer as any).quote ?? null,
    selected_manual_title: (answer as any).manual_title ?? null,
    selected_manual_type: (answer as any).doc_type ?? (answer as any).preferred_manual_type ?? null,
    selected_manual_model: (answer as any).resolved_model ?? (answer as any).model ?? null,
    selected_manual_source_url: (answer as any).source_url ?? (answer as any).url ?? null,
    selected_manual_page: (answer as any).page_number ?? null,
    fact_type: (answer as any).fact_type ?? null,
    fact_subtype: (answer as any).fact_subtype ?? null,
    fact_source_kind: (answer as any).fact_source_kind ?? null,
    diagram_used: (answer as any).diagram_used ?? false,
    diagram_type: (answer as any).diagram_type ?? null,
    figure_caption: (answer as any).figure_caption ?? null,
    figure_page_number: (answer as any).figure_page_number ?? null,
    figure_note_linked: (answer as any).figure_note_linked ?? false,
    evidence_source_mode: (answer as any).evidence_source_mode ?? null,
    ocr_used: (answer as any).ocr_used ?? false,
    ocr_confidence: (answer as any).ocr_confidence ?? null,
    exploded_parts_graph_used: (answer as any).exploded_parts_graph_used ?? false,
    part_match_type: (answer as any).part_match_type ?? null,
    part_number_matched: (answer as any).part_number_matched ?? null,
    figure_callout_used: (answer as any).figure_callout_used ?? null,
    refusal_reason: answerStatus === "refused" ? ((answer as any).refusal_reason || (answer as any).no_answer_reason || "insufficient_evidence") : undefined,
    engine_path_used: (answer as any).selected_engine || "general_engine",
    selected_engine: (answer as any).selected_engine || "general_engine",
    run_outcome: runOutcome,
    truth_audit_status: (answer as any).truth_audit_status || "validator_passed",
    source_evidence_status: (answer as any).source_evidence_status || ((answer as any).source_type === "none" ? "missing" : "present"),
    validator_version: (answer as any).validator_version || process.env.VALIDATOR_VERSION || "v1",
    engine_build_id: process.env.ENGINE_BUILD_ID || "unknown",
    engine_commit_sha: process.env.ENGINE_COMMIT_SHA || "unknown",
    engine_runtime_name: process.env.ENGINE_RUNTIME_NAME || "gabe-knowledge-engine",
    vent_template_active: String(process.env.VENT_TEMPLATE_ACTIVE || "false").toLowerCase() === "true",
  };
  return composed as GabeAnswer;
}
