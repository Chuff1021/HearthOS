# GABE Engine Maturity Report — 2026-03-06

## Cross-engine normalization hardening (implemented)

### Canonical run outcomes now normalized in gate path
- `answered_verified`
- `answered_partial`
- `refused_unverified`
- `escalated_handoff`
- `source_evidence_missing`

### Canonical refusal reason codes now normalized
- `missing_explicit_support`
- `missing_structured_fields`
- `model_ambiguous`
- `source_not_found`

### Required metadata fields now enforced in gate/composer path
- `selected_engine`
- `certainty`
- `run_outcome`
- `truth_audit_status`
- `source_evidence_status`
- `validator_version`
- citation fields where applicable:
  - `manual_title`
  - `page_number`
  - `source_url`
  - `quote`

## Engine status

## 1) Venting Engine
- **Scorer status:** 9/10 pass (90.0%) from `ops/venting10-after.json`
- **Validator status:** passing gate for accepted answers; one refusal case observed
- **Truth audit status:** available via venting forensic artifacts; not yet expanded to broad ambiguity set
- **Known limitations:**
  - missing_fields on pipe family / min rise / run maxima in some prompts
  - one hard gate reject due to quote mismatch
- **Production readiness:** **Conditional (near-ready)**

## 2) Wiring Engine
- **Scorer status:** 10/10 pass (100.0%) from `ops/wiring10-after.json`
- **Validator status:** pass with citations
- **Truth audit status:** available (`ops/wiring-truth-audit.json` + scripts)
- **Known limitations:**
  - many answers are `Verified Partial` with missing edge-path details
  - multi-edge path completeness still weak
- **Production readiness:** **Ready with caveat (partial-heavy)**

## 3) Parts Engine
- **Scorer status:** 10/10 pass; qtype improved 90% → 100%
- **Validator status:** contract fields 100%
- **Truth audit status:** 10/10 pass (`scripts/parts_truth_audit_report.json`)
- **Known limitations:**
  - current set is focused; needs broader real-world phrasing set (20-40 cases)
- **Production readiness:** **Ready for guarded rollout**

## 4) Compliance Engine
- **Scorer status:** 10/10 on focused set; support gating 80% → 100%
- **Validator status:** contract fields 100%; includes `run_outcome`
- **Truth audit status:** 10/10 pass (`scripts/compliance_truth_audit_report.json`)
- **Known limitations:**
  - strict explicit-marker gating may refuse borderline but valid human paraphrases
  - needs larger ambiguity set with nuanced AHJ/code phrasing
- **Production readiness:** **Ready for guarded rollout**

---

## Live support readiness checklist

### Chatwoot (credential-dependent finalization)
Pending credentials to complete proof chain:
1. inbound webhook
2. GABE answer reply outbound
3. human handoff outbound
4. conversation linking verification
5. persisted run metadata verification in DB

Current code path coverage exists for webhook/reply/handoff + conversation linking.

## Next hardening sprint (recommended immediate)
1. Expand venting/wiring/parts/compliance scorer sets from 10 → 30 cases each (ambiguity-heavy).
2. Add per-engine truth audit threshold gates (e.g., fail CI if <90%).
3. Add regression matrix for refusal reason consistency across engines.
4. Run Chatwoot E2E as soon as credentials are available and publish transcript-backed proof.
