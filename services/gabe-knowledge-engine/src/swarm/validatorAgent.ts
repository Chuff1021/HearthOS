import { GabeAnswer, RetrievedChunk } from "../types";
import { validateAnswer } from "../validation/validate";

export function validateOrReject(answer: GabeAnswer, retrieved: RetrievedChunk[]) {
  try {
    validateAnswer(answer, retrieved);
    return { ok: true as const, answer };
  } catch (err) {
    return {
      ok: false as const,
      reason: err instanceof Error ? err.message : "validation_failed",
      rejectedAnswer: answer,
    };
  }
}
