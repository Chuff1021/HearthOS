# GABE Phase 8: Enforced Release Blocking

## What changed
1. Added strict release-block enforcement at startup.
2. Startup now computes release readiness snapshot and blocks service start when strict mode is enabled and gates fail.
3. Added environment-aware gate profiles (development/staging/production) with stricter production defaults.
4. Added deploy/CI scripts and non-zero exit behavior for failed readiness checks.
5. Added hardened ops visibility endpoints and machine-visible release-block metadata in responses.

## Enforcement controls
- `RELEASE_BLOCK_STRICT_MODE=true` enables enforcement.
- `RELEASE_BLOCK_ALLOW_DEV_OVERRIDE=true` allows explicit local development bypass.
- `RELEASE_GATE_PROFILE=development|staging|production` chooses threshold profile.

## Blocking behavior
- In strict protected envs (staging/production), failed gates block startup (`process.exit(1)`).
- `prestart` and `predeploy` scripts run readiness checks and fail with CI-friendly exit codes.
- `/ops/release-readiness` and `/ops/deployment-status` expose pass/fail + failed gate details.

## CI wiring
- `npm run ci:release-gates` executes required phase tests + corpus/readiness checks.
- CI should fail hard when release gates fail or strict coverage threshold is not met.
