import { GabeAnswer, RetrievedChunk } from "../types";
import { validateAnswer } from "../validation/validate";

function manualTypeMismatchRisk(answer: any, retrieved: RetrievedChunk[]) {
  if (answer?.source_type !== "manual") return false;
  const m = retrieved.find((c) => c.source_type === "manual" && c.manual_title === answer.manual_title && c.page_number === answer.page_number);
  if (!m) return false;
  const q = String(answer?.answer || "").toLowerCase();
  const installIntent = /framing|clearance|vent|install|gas pressure|wc\b/.test(q);
  if (installIntent && m.doc_type === "owner") return true;
  return false;
}

export function validateOrReject(answer: GabeAnswer, retrieved: RetrievedChunk[], context?: any) {
  try {
    validateAnswer(answer, retrieved);
    if (manualTypeMismatchRisk(answer as any, retrieved)) {
      return {
        ok: false as const,
        reason: "manual_type_mismatch",
        rejectedAnswer: answer,
        validatorNotes: ["manual_type_mismatch"],
      };
    }

    const selected = answer as any;
    const registry = context?.registry_selection;
    const installCritical = Boolean(context?.install_critical);
    if (installCritical) {
      if (!context?.manual_id_filter_applied) {
        return { ok: false as const, reason: "install_query_no_manual_id_filter", rejectedAnswer: answer, validatorNotes: ["install_query_no_manual_id_filter"] };
      }
      const qr = context?.query_resolution || {};
      if (!qr?.model_candidate || (qr?.confidence ?? 0) < 0.6) {
        return { ok: false as const, reason: "exact_model_unresolved_install_critical", rejectedAnswer: answer, validatorNotes: ["exact_model_unresolved_install_critical"] };
      }
      if ((registry?.candidate_manuals || []).length > 1 && (registry?.registry_match_confidence ?? 0) < 0.7) {
        return { ok: false as const, reason: "conflicting_candidates", rejectedAnswer: answer, validatorNotes: ["conflicting_candidates"] };
      }
    }

    const hasNumeric = /\d/.test(String((answer as any)?.answer || ""));
    if (installCritical && hasNumeric) {
      const numericSupportedByFact = Boolean((answer as any)?.fact_type);
      const numericInQuote = /\d/.test(String((answer as any)?.quote || ""));
      if (!numericSupportedByFact && !numericInQuote) {
        return { ok: false as const, reason: "unsupported_numeric_answer", rejectedAnswer: answer, validatorNotes: ["unsupported_numeric_answer"] };
      }
    }

    if (installCritical && context?.fact_conflict_detected && context?.fact_conflict_resolution_strategy === "ambiguous_conflict") {
      return { ok: false as const, reason: "fact_conflict_unresolved", rejectedAnswer: answer, validatorNotes: ["fact_conflict_unresolved"] };
    }

    const intent = String(context?.query_resolution?.intent || "");
    if (intent === "replacement parts" && selected?.source_type === "manual") {
      const hasPartEvidence = Boolean((selected as any).part_number_matched || (selected as any).figure_callout_used || (selected as any).fact_type === "parts_reference");
      if (!hasPartEvidence) {
        return { ok: false as const, reason: "unsupported_part_match", rejectedAnswer: answer, validatorNotes: ["unsupported_part_match"] };
      }
      const ocrUsed = Boolean((selected as any).ocr_used || context?.ocr_used);
      const ocrConf = Number((selected as any).ocr_confidence ?? context?.ocr_confidence ?? 0);
      if (ocrUsed && ocrConf < 0.75 && !(selected as any).part_number_matched) {
        return { ok: false as const, reason: "weak_ocr_uncorroborated", rejectedAnswer: answer, validatorNotes: ["weak_ocr_uncorroborated"] };
      }
    }

    if (installCritical && selected?.source_type === "manual") {
      const allowed = new Set((registry?.candidate_manuals || []).map((m: any) => `${m.source_url}|${m.manual_title || ""}|${m.model || ""}`));
      const key = `${selected.source_url}|${selected.manual_title || ""}|${selected.model || ""}`;
      if (allowed.size > 0 && !allowed.has(key) && !Array.from(allowed).some((a) => String(a).startsWith(`${selected.source_url}|`))) {
        return {
          ok: false as const,
          reason: "selected_manual_not_in_gated_set",
          rejectedAnswer: answer,
          validatorNotes: ["selected_manual_not_in_gated_set"],
        };
      }
      if (!selected.page_number) {
        return { ok: false as const, reason: "citation_missing", rejectedAnswer: answer, validatorNotes: ["citation_missing"] };
      }
      if (!selected.source_url) {
        return { ok: false as const, reason: "source_url_missing", rejectedAnswer: answer, validatorNotes: ["source_url_missing"] };
      }
      if (!selected.quote) {
        return { ok: false as const, reason: "evidence_excerpt_missing", rejectedAnswer: answer, validatorNotes: ["evidence_excerpt_missing"] };
      }
      const mt = String(selected.manual_type || selected.doc_type || "").toLowerCase();
      if (/flyer|brochure|spec/.test(mt)) {
        return { ok: false as const, reason: "install_critical_disallowed_doc_type", rejectedAnswer: answer, validatorNotes: ["install_critical_disallowed_doc_type"] };
      }

      const numericClaims = String(selected.answer || "").match(/\d+(?:\.\d+)?/g) || [];
      if (numericClaims.length > 0 && selected.fact_type) {
        const valueBlob = JSON.stringify(selected.value_json || {});
        const quoteBlob = String(selected.quote || "");
        const unsupported = numericClaims.some((n: string) => !valueBlob.includes(n) && !quoteBlob.includes(n));
        if (unsupported) {
          return { ok: false as const, reason: "numeric_claim_not_supported_by_selected_fact", rejectedAnswer: answer, validatorNotes: ["numeric_claim_not_supported_by_selected_fact"] };
        }
      }

      const matchedChunk = retrieved.find((c) => c.source_type === "manual" && c.manual_title === selected.manual_title && c.page_number === selected.page_number && c.source_url === selected.source_url) || retrieved[0];
      const targets: string[] = Array.isArray(context?.section_targets) ? context.section_targets : [];
      if (targets.length > 0) {
        const section = String((matchedChunk as any)?.section_type || "").toLowerCase();
        if (section && !targets.some((t) => section.includes(String(t).toLowerCase()))) {
          return {
            ok: false as const,
            reason: "evidence_topic_mismatch",
            rejectedAnswer: answer,
            validatorNotes: ["evidence_topic_mismatch"],
          };
        }
      }

      const diagramExpected = Boolean(context?.diagram_expected);
      const diagramAvailable = Boolean(context?.diagram_available);
      const diagramSupported = Boolean((selected as any).diagram_used) || Boolean((matchedChunk as any)?.figure_present) || Boolean((matchedChunk as any)?.diagram_type) || Boolean((selected as any).fact_type);
      if (diagramExpected && diagramAvailable && !diagramSupported) {
        return {
          ok: false as const,
          reason: "diagram_evidence_expected_but_missing",
          rejectedAnswer: answer,
          validatorNotes: ["diagram_evidence_expected_but_missing"],
        };
      }
    }
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
