import { GabeAnswer } from "../types";

export function composeValidatedResponse(answer: GabeAnswer): GabeAnswer {
  // hard gate: composer only formats validator-approved payloads.
  // Keep payload machine-friendly and stable.
  return {
    ...answer,
    answer: String(answer.answer || "").trim(),
  } as GabeAnswer;
}
