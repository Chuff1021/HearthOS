# Launch Hardening Proof — 2026-03-06

## 1) Metadata consistency fix + deployment

### Change applied
- File: `src/app/api/gabe/route.ts`
- Added normalization for every live response and persisted run payload:
  - `selected_engine`
  - `run_outcome`
  - `certainty`
  - `truth_audit_status`
  - `validator_version`
- Added controlled outage drill trigger: question contains `[DRILL_SOURCE_EVIDENCE_MISSING]`
  - returns non-500 `source_evidence_missing`
  - persists normalized run metadata

### Deployment
- Commit pushed to `main`: `d5e457c`
- Production deploy executed via Vercel CLI and aliased to:
  - `https://hearth-os.vercel.app`

## 2) Metadata consistency proof (5 live samples)

Endpoint: `POST /api/gabe`

All 5 samples returned non-null required fields.

1) Q: `What is the maximum horizontal vent run allowed for Apex 42?`
- `selected_engine=general_engine`
- `run_outcome=answered_partial`
- `certainty=Verified Partial`
- `truth_audit_status=pending`
- `validator_version=v1`

2) Q: `What is the replacement part number for thermopile?`
- `selected_engine=general_engine`
- `run_outcome=answered_verified`
- `certainty=Verified Exact`
- `truth_audit_status=pending`
- `validator_version=v1`

3) Q: `How is wall switch connected to control module?`
- `selected_engine=general_engine`
- `run_outcome=refused_unverified`
- `certainty=Unverified`
- `truth_audit_status=pending`
- `validator_version=v1`

4) Q: `asdfghjkl qwerty`
- `selected_engine=general_engine`
- `run_outcome=refused_unverified`
- `certainty=Unverified`
- `truth_audit_status=pending`
- `validator_version=v1`

5) Q: `[DRILL_SOURCE_EVIDENCE_MISSING]`
- `selected_engine=general_engine`
- `run_outcome=source_evidence_missing`
- `certainty=Unverified`
- `truth_audit_status=pending`
- `validator_version=v1`

Run metadata persistence check:
- `GET /api/gabe/run-metadata?limit=5`
- Latest 5 runs include all required fields non-null and match above outcomes.

## 3) Chatwoot outbound proof

### Webhook inbound (`/api/gabe/support/chatwoot/webhook`)
- Result: PASS
- Observed: `{ ok: true, linked_run_id: "3", run_outcome: "answered_partial", handoff: false }`

### Reply outbound (`/api/gabe/support/chatwoot/reply`)
- Result: BLOCKED (credentials missing)
- Observed: `chatwoot_not_configured`
- Missing env vars:
  - `CHATWOOT_API_URL`
  - `CHATWOOT_API_TOKEN`
  - `CHATWOOT_ACCOUNT_ID`

### Handoff outbound (`/api/gabe/support/chatwoot/handoff`)
- Result: PASS
- Observed: `{ ok: true, handoff: true, event_id: "4" }`

### Conversation linking persisted
- Webhook produced `linked_run_id`
- Handoff produced `event_id`
- Status: PASS

## 4) Controlled outage/failure drill proof

### Drill
- Trigger: `POST /api/gabe` with `[DRILL_SOURCE_EVIDENCE_MISSING]`
- Response:
  - HTTP success (no 500)
  - `run_outcome=source_evidence_missing`
  - `source_type=none`
  - required metadata fields populated

### Persistence
- Verified in `/api/gabe/run-metadata` latest rows with:
  - `run_outcome=source_evidence_missing`
  - normalized required metadata fields present

## 5) Blockers + final guarded launch recommendation

### Blockers
1. Chatwoot outbound credentials are not configured in production env.
2. Because of (1), full outbound reply proof to real Chatwoot endpoint is blocked.

### Final guarded launch recommendation
- **Recommendation:** Proceed with guarded launch for GABE core + inbound/handoff flows.
- **Mode:** Canary 10% traffic, then 25% after 24h if error/metadata metrics remain stable.
- **Condition before broader rollout:** configure real Chatwoot outbound credentials and run one live outbound reply proof.
