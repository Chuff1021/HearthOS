# Guarded Rollout Readiness Proof — 2026-03-06

## 1) Final guarded-rollout readiness by engine

### Venting
- Expanded scorer: **32/32 (100.0%)** after venting-only hardening (`scripts/venting_32_hardening_report.json`)
- Validator status: passing in harness
- Truth-audit status: no failures in hardened 32-case pass
- Known limitations: production engine currently returns inconsistent metadata (`run_outcome` null in live responses)
- Rollout recommendation: **Guarded rollout (yes)**

### Wiring
- Expanded scorer: **28/32 (87.5%)** (`scripts/expanded_engine_eval_report.json`)
- Validator status: passing on accepted answers
- Truth-audit status: no blocker in current regression artifacts
- Known limitations: residual scorer mismatch for some transformer phrasing variants
- Rollout recommendation: **Guarded rollout (yes, with close monitoring)**

### Parts
- Expanded scorer: **32/32 (100.0%)** after parts gating cleanup (`scripts/parts_32_gating_cleanup_report.json`)
- Validator status: passing
- Truth-audit status: passing
- Known limitations: none blocking in current harness
- Rollout recommendation: **Guarded rollout (yes)**

### Compliance
- Expanded scorer: **32/32 (100.0%)** (`scripts/expanded_engine_eval_report.json`)
- Validator status: passing
- Truth-audit status: passing
- Known limitations: strict marker gating may refuse some borderline paraphrases
- Rollout recommendation: **Guarded rollout (yes)**

## 2) E2E support-flow proof (real stack)

Test target: `https://hearth-os.vercel.app`

### A) /api/gabe normal answer path
- Request: `POST /api/gabe` with user message asking venting question
- Observed: `source_type=manual`, `certainty=Verified Partial` (answered_partial class behavior)
- Result: **PASS** for normal answered path

### B) /api/gabe refused path
- Request: `POST /api/gabe` with nonsense input
- Observed: `source_type=none`, `certainty=Unverified`
- Result: **PASS** for refused_unverified class behavior

### C) escalated_handoff path
- Request: `POST /api/gabe/support/chatwoot/handoff`
- Observed: `{ ok: true, handoff: true, event_id: "..." }`
- Result: **PASS**

### D) source_evidence_missing path
- Current production upstream is healthy; explicit outage-path not naturally triggered in this live run.
- `source_evidence_missing` behavior exists in `/api/gabe` code for upstream unavailable/not-ok.
- Result: **NOT PROVEN LIVE in this run** (requires controlled upstream outage simulation)

## 3) Real-stack path verification

### Chatwoot webhook path
- Request: `POST /api/gabe/support/chatwoot/webhook`
- Observed: `{ ok: true, linked_run_id: "1", run_outcome: "answered_partial", handoff: false }`
- Status: **PASS**

### Chatwoot reply path
- Request: `POST /api/gabe/support/chatwoot/reply`
- Observed: `chatwoot_not_configured` with missing creds flags
- Status: **EXPECTED BLOCKER** (credentials missing)

### Chatwoot handoff path
- Request: `POST /api/gabe/support/chatwoot/handoff`
- Observed: `{ ok: true, handoff: true, event_id: "2" }`
- Status: **PASS**

### Conversation linking
- Webhook returns `linked_run_id`
- Handoff returns `event_id`
- Status: **PASS**

### Run metadata persistence
- Request: `GET /api/gabe/run-metadata?limit=20`
- Observed total increased to **13** and latest tested question present
- Status: **PASS**

## 4) Blockers to guarded production rollout

1. **Chatwoot outbound credentials missing** (reply path cannot send outbound yet)
2. **Live metadata normalization drift** in deployed engine responses (`run_outcome` and `selected_engine` often null), causing fallback defaults in wrappers
3. **source_evidence_missing live proof** still needs controlled outage test to fully certify E2E matrix

## 5) Recommended initial rollout mode

- **Mode:** Guarded canary rollout
- **Traffic split:** 10% live support traffic first, then 25% after 24h clean metrics
- **Gate checks:**
  - non-null `run_outcome` rate > 99%
  - refusal correctness spot-checks
  - handoff path latency + success
  - metadata persistence continuity
