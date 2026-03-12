# GABE Phase 12.1: Live Gold Eval Runner

## What changed
1. Replaced simulated score scaffold with live eval runner that hits real `/query` path.
2. Added true case-level scoring against actual responses/validator metadata.
3. Added persistent case result storage (`gabe_eval_case_results`) and extended eval run metadata.
4. Added trend support via eval history/trends endpoints and trend report script.
5. Added CI hooks for optional live eval execution and artifact outputs.
6. Hardened release readiness to consume real live eval metrics (critical eval accuracy + regression failures).

## New runner
- `scripts/run_live_gold_eval.ts`

Features:
- real `/query` execution
- subset filters by intent/brand
- timeout control per case
- max-failure short-circuit
- environment profile support
- machine-readable + human-readable artifacts

## Persistence additions
- migration: `0009_live_eval_runner.sql`
- extended `gabe_eval_runs` columns:
  - environment_profile
  - git_commit_sha
  - aggregate_metrics
  - per_category_metrics
  - regression_failures
- new table: `gabe_eval_case_results`

## New artifacts
Per run generates:
- `/tmp/gabe_live_eval_summary.json`
- `/tmp/gabe_live_eval_case_results.jsonl`
- `/tmp/gabe_live_eval_scorecard.json`
- `/tmp/gabe_live_eval_report.md`
- mirrored under `evals/out/` for CI artifact collection.

## Release gate linkage
`check_release_readiness.ts` now reads live eval summary when available and gates on:
- `critical_eval_accuracy`
- `regression_failures`

## Endpoints
- `/ops/eval/history`
- `/ops/eval/trends`
- `/ops/eval/run-record`

## Definition-of-done mapping
- Gold eval executes against real GABE stack: implemented.
- Scores reflect actual outputs/validator behavior: implemented.
- Historical run data trendable: implemented.
- Release gates can consume real eval evidence: implemented.
