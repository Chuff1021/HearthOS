# GABE Branch Protection + CI Gate Setup

## Required GitHub checks (stable names)
Mark these jobs as **required status checks** in branch protection for `main`:
- `gabe-install-build`
- `gabe-db-migration-validation`
- `gabe-phase-tests`
- `gabe-corpus-completeness`
- `gabe-eval-gates`
- `gabe-release-readiness`

These are produced by workflow: `.github/workflows/gabe-safety-gates.yml`

## Promotion protection
Use `.github/workflows/gabe-promotion-gate.yml` for staging/production promotions.
`promote` job depends on `gabe-release-readiness` and will not run when readiness fails.

## Environment profiles
Set `RELEASE_GATE_PROFILE` by environment:
- development: PR/local checks (lenient)
- staging: strict pre-main/promotion checks
- production: strictest thresholds

## Required CI artifacts
Each run uploads machine-readable artifacts:
- release readiness JSON
- corpus completeness report
- reingest-needed report
- eval threshold summary

Use artifact files to debug failures (failed gates, thresholds, actual values, and suggested actions).

## Suggested next actions by gate type
- `strict_manual_id_coverage_rate`: run re-ingest workflow and resolve legacy tuple-only/incomplete manuals.
- `unresolved_conflict_rate`: resolve fact conflicts or improve precedence metadata.
- `fact_answer_rate`: improve fact extraction coverage for install-critical categories.
- `unsupported_numeric_answer_attempts`: tighten numeric consistency and fact citation alignment.
