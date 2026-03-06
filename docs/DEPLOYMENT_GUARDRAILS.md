# DEPLOYMENT_GUARDRAILS.md

## Production Deployment Policy (HearthOS)

### 1) Production deploy source control
- Locked baseline pointers:
  - Deployment: `dpl_FvHRQE4x6XkeU3ETC2s443hBNRiN`
  - URL: `https://hearth-mwbgyf1ds-chuff1021s-projects.vercel.app`
  - Git baseline: `cfbdbf1`
  - Branch: `production-recovered-safe`
  - Tag: `production-recovered-safe-tag`
- Vercel Git auto-deploys are disabled (`gitProviderOptions.createDeployments=disabled`).
- Production must be changed only by explicit manual promotion / alias action from an approved preview deployment.
- `main` and feature branches are not allowed to auto-deploy production.

### 2) Preview gate before any production promote
- Every change must deploy to Preview first.
- Required checks in Preview:
  - Build passes
  - Manual-scoped QA suite passes
  - No regression in `/tech/manuals` and `/tech/gabe`

### 3) Mandatory post-promote production checks
After any promotion, all must pass:
- `GET /tech/manuals` = `200`
- `GET /tech/gabe` = `200`
- Manual-scoped `POST /api/gabe` returns:
  - `source_type = manual`
  - `selected_manual_title` present
  - `answered_from_selected_manual = true`
  - `cited_manual_title` matches selected manual
  - `cited_page_number` present

### 4) Rollback rule
- If any post-promote check fails:
  1. Immediately promote previous known-good deployment.
  2. Freeze further promotions until root cause is documented.
  3. Fix in Preview first, then re-promote.

### 5) Promote parity rule
- Never promote blindly from Preview unless commit/build parity is confirmed.
- Record before promote:
  - Preview deployment URL + deployment ID
  - Git commit hash intended for release
- Confirm the promoted production deployment maps to that intended build path.

---

## Operational Notes
- No ingestion, Qdrant, schema, or Docker changes during deployment-only recovery actions.
- Keep a running log of:
  - approved preview URL
  - promoted production URL
  - validation results
