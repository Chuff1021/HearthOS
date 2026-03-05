import { GabeAnswer } from "../types";

export function composeValidatedResponse(answer: GabeAnswer): GabeAnswer {
  // hard gate: composer only formats validator-approved payloads.
  // Keep payload machine-friendly and stable.
  const composed: any = {
    ...answer,
    answer: String((answer as any).answer || "").trim(),
    engine_build_id: process.env.ENGINE_BUILD_ID || "unknown",
    engine_commit_sha: process.env.ENGINE_COMMIT_SHA || "unknown",
    engine_runtime_name: process.env.ENGINE_RUNTIME_NAME || "gabe-knowledge-engine",
    vent_template_active: String(process.env.VENT_TEMPLATE_ACTIVE || "false").toLowerCase() === "true",
  };
  return composed as GabeAnswer;
}
