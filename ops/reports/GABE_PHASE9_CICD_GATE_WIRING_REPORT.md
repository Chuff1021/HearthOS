# GABE Phase 9: CI/CD Gate Wiring Enforcement

## Delivered
1. Added CI workflow `gabe-safety-gates.yml` covering PR, push main, and manual dispatch.
2. Added promotion workflow `gabe-promotion-gate.yml` to block staging/production promotion when readiness fails.
3. Added CI scripts:
   - `check_release_readiness.ts` (JSON + human summary + nonzero on fail)
   - `eval_threshold_check.ts`
   - `ci_release_gate.sh`
4. Added environment-aware gate profile support and strictness progression in release gate module.
5. Added branch protection documentation with stable required check names.
6. Added artifact uploads for readiness/corpus/eval outputs.

## Enforcement behavior
- PR/merge safety checks fail automatically when gates fail.
- Production/staging promotion is blocked by readiness gate failure.
- CI outputs include machine-readable JSON and human-readable failure guidance.

## Definition-of-done mapping
- Unsafe builds can fail automatically in CI and pre-promotion workflows.
- Operators can see exactly why blocked via failed gate names + thresholds + actuals + suggestions.
- Branch protection can enforce stable gate jobs by name.
