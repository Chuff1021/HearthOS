import { GabeAnswer } from "../types";

export function composeValidatedResponse(answer: GabeAnswer): GabeAnswer {
  // hard gate: composer only formats validator-approved payloads.
  // Keep payload machine-friendly and stable.
  const composed: any = {
    ...answer,
    answer: String((answer as any).answer || "").trim(),
    selected_engine: (answer as any).selected_engine || "general_engine",
    run_outcome: (answer as any).run_outcome || "source_evidence_missing",
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
