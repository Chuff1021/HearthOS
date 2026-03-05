import { GabeAnswer, RetrievedChunk } from "../types";
import { validateAnswer } from "../validation/validate";

export function validateOrReject(answer: GabeAnswer, retrieved: RetrievedChunk[]) {
  try {
    validateAnswer(answer, retrieved);
    const certainty = (answer as any).certainty;
    const outcome = certainty === "Verified Exact" || certainty === "Verified Partial" || certainty === "Interpreted"
      ? (certainty === "Verified Partial" ? "approved_partial" : "approved")
      : "rejected";

    if (outcome === "rejected") {
      return {
        ok: false as const,
        reason: "certainty_unverified",
        rejectedAnswer: answer,
        validatorNotes: ["Answer certainty is Unverified"],
      };
    }

    return {
      ok: true as const,
      answer: {
        ...answer,
        validator_notes: [...((answer as any).validator_notes || []), `validator_outcome:${outcome}`],
      } as GabeAnswer,
      outcome,
    };
  } catch (err) {
    return {
      ok: false as const,
      reason: err instanceof Error ? err.message : "validation_failed",
      rejectedAnswer: answer,
      validatorNotes: [err instanceof Error ? err.message : "validation_failed"],
    };
  }
}
