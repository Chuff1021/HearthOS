# GABE Release Gates

## Must Pass Before Deploy
- Build succeeds
- Regression suite pass threshold met
- No schema/citation violations
- Smoke tests pass (`/health`, `/metrics`, query contract)

## Blockers
- Wrong-manual spike above threshold
- Any missing citation in `source_type=manual`
- Any unsupported answer that bypasses `none`

## Rollback Trigger
- Wrong-manual or missing-citation alert breach after release
- Revert to last known good commit/image and re-run smoke tests
