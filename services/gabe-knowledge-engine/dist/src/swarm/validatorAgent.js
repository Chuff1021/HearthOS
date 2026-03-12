"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOrReject = validateOrReject;
const validate_1 = require("../validation/validate");
function manualTypeMismatchRisk(answer, retrieved) {
    if (answer?.source_type !== "manual")
        return false;
    const m = retrieved.find((c) => c.source_type === "manual" && c.manual_title === answer.manual_title && c.page_number === answer.page_number);
    if (!m)
        return false;
    const q = String(answer?.answer || "").toLowerCase();
    const installIntent = /framing|clearance|vent|install|gas pressure|wc\b/.test(q);
    if (installIntent && m.doc_type === "owner")
        return true;
    return false;
}
function validateOrReject(answer, retrieved) {
    try {
        (0, validate_1.validateAnswer)(answer, retrieved);
        if (manualTypeMismatchRisk(answer, retrieved)) {
            return {
                ok: false,
                reason: "manual_type_mismatch",
                rejectedAnswer: answer,
                validatorNotes: ["manual_type_mismatch"],
            };
        }
        const certainty = answer.certainty;
        const outcome = certainty === "Verified Exact" || certainty === "Verified Partial" || certainty === "Interpreted"
            ? (certainty === "Verified Partial" ? "approved_partial" : "approved")
            : "rejected";
        if (outcome === "rejected") {
            return {
                ok: false,
                reason: "certainty_unverified",
                rejectedAnswer: answer,
                validatorNotes: ["Answer certainty is Unverified"],
            };
        }
        return {
            ok: true,
            answer: {
                ...answer,
                validator_notes: [...(answer.validator_notes || []), `validator_outcome:${outcome}`],
            },
            outcome,
        };
    }
    catch (err) {
        return {
            ok: false,
            reason: err instanceof Error ? err.message : "validation_failed",
            rejectedAnswer: answer,
            validatorNotes: [err instanceof Error ? err.message : "validation_failed"],
        };
    }
}
