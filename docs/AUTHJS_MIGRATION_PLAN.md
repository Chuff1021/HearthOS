# AUTHJS_MIGRATION_PLAN.md

## Objective
Migrate from Clerk to Auth.js with DB-backed sessions **after** stability is restored.

## Principles
- Keep `/tech/manuals`, `/tech/gabe`, `/api/gabe` stable first.
- Migrate in slices with rollback points.
- Keep auth out of runtime-critical path until validated.

## Proposed Phases

### Phase A — Preparation (no critical-path changes)
1. Add Auth.js dependencies and base config.
2. Add DB session adapter (Postgres/Neon-compatible).
3. Add env vars for Auth.js secrets/providers.
4. Add a non-critical test route protected by Auth.js.

### Phase B — Dual-run hardening
1. Add Auth.js session checks to low-risk internal routes first.
2. Validate session creation/refresh/logout behavior.
3. Add telemetry for auth failures and session expiry.

### Phase C — Tech route cutover
1. Protect `/tech` with Auth.js.
2. Protect `/tech/manuals` and `/tech/gabe` with Auth.js.
3. Protect tech-only APIs with Auth.js checks (excluding emergency fallback paths until verified).
4. Keep rollback toggle to perimeter-only mode.

### Phase D — Clerk decommission
1. Remove remaining Clerk hooks/components/pages.
2. Remove Clerk package/env vars.
3. Remove Clerk-specific docs/runbooks.

## Required Smoke Checks Before Each Promote
- `GET /tech/manuals` = 200
- `GET /tech/gabe` = 200
- manual-scoped `POST /api/gabe` returns:
  - `source_type = manual`
  - `selected_manual_title` present
  - `answered_from_selected_manual = true`
  - `cited_manual_title` matches selected manual
  - `cited_page_number` present

## Rollback Strategy
- Keep each phase in isolated PRs/branches.
- If smoke checks fail, rollback to last known-good deployment and re-run checks.
