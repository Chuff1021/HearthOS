"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALIDATOR_VERSION = void 0;
exports.validateAnswerPath = validateAnswerPath;
exports.VALIDATOR_VERSION = "gabe-validator@1";
function validateAnswerPath(candidate, context) {
    if (!isGabeAnswer(candidate)) {
        return invalidAnswer("answer schema invalid");
    }
    if (candidate.source_type === "none") {
        return {
            answer: candidate,
            result: {
                approved: false,
                certainty: "unverified",
                runOutcome: "source_evidence_missing",
                truthAuditStatus: "needs_review",
                sourceEvidenceStatus: "missing",
                auditClassification: "source_evidence",
                reasons: ["no verified source evidence was returned"],
            },
        };
    }
    if (candidate.source_type === "manual") {
        return {
            answer: candidate,
            result: {
                approved: true,
                certainty: context.selectedEngine === "general_retrieval" ? "verified_partial" : "verified_exact",
                runOutcome: context.selectedEngine === "general_retrieval" ? "answered_partial" : "answered_verified",
                truthAuditStatus: "pending",
                sourceEvidenceStatus: "present",
                auditClassification: "standard",
                reasons: [],
            },
        };
    }
    return {
        answer: candidate,
        result: {
            approved: false,
            certainty: "interpreted",
            runOutcome: "answered_partial",
            truthAuditStatus: "needs_review",
            sourceEvidenceStatus: "partial",
            auditClassification: "validator",
            reasons: ["web evidence is not approved for verified technical answers"],
        },
    };
}
function invalidAnswer(reason) {
    return {
        answer: {
            answer: "This information is not available in verified manufacturer documentation.",
            source_type: "none",
            confidence: 0,
        },
        result: {
            approved: false,
            certainty: "unverified",
            runOutcome: "source_evidence_missing",
            truthAuditStatus: "needs_review",
            sourceEvidenceStatus: "missing",
            auditClassification: "validator",
            reasons: [reason],
        },
    };
}
function isGabeAnswer(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    if (typeof candidate.answer !== "string")
        return false;
    if (typeof candidate.confidence !== "number")
        return false;
    if (candidate.source_type === "manual") {
        return (typeof candidate.manual_title === "string" &&
            typeof candidate.page_number === "number" &&
            typeof candidate.source_url === "string" &&
            typeof candidate.quote === "string");
    }
    if (candidate.source_type === "web") {
        return (typeof candidate.url === "string" &&
            typeof candidate.section === "string" &&
            typeof candidate.quote === "string");
    }
    return candidate.source_type === "none" && candidate.confidence === 0;
}
