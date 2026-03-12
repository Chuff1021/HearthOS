# GABE Phase 12: Gold Evaluation and Field Validation

## Delivered
1. Gold eval dataset (180 cases) covering installation, venting/chimney, framing, clearances, electrical/wiring, gas specs, troubleshooting, replacement parts, standards/code, and sales/spec contexts.
2. Eval taxonomy schema with manufacturer/model/family/size, intent type, fact category, source dependency, and expected answer status tags.
3. Scorecard script generating overall and segmented performance metrics.
4. Permanent regression trap pack for prior bad-answer patterns (wrong manual/diagram, weak OCR, unresolved conflicts).
5. Production feedback capture scaffolding (unresolved/low-confidence/user outcome/admin notes/promote-to-regression).
6. Ops feedback/eval endpoints and history tracking.
7. Field validation reporting output for top failed question types, missing source suggestions, weak model coverage.
8. Release-gate integration extended with critical eval accuracy + regression failure thresholds.

## New data assets
- `evals/gold_eval_2026-03-08.jsonl` (180 cases)
- `evals/eval_taxonomy_schema.json`
- `evals/regression_traps_2026-03-08.jsonl`

## New scripts
- `scripts/score_gold_eval.ts`
- `scripts/generate_field_validation_report.ts`

## New feedback/eval persistence
- migration `0008_gold_eval_feedback.sql`
- tables: `gabe_feedback_events`, `gabe_eval_runs`
- module: `feedbackLoop.ts`

## New ops endpoints
- `/ops/feedback/capture`
- `/ops/feedback/list`
- `/ops/feedback/dashboard`
- `/ops/eval/run-record`
- `/ops/eval/history`

## Release gating extension
Added gate dimensions:
- `critical_eval_accuracy` (min threshold)
- `regression_failures` (max threshold)

## Definition-of-done alignment
- Quality is measurable across business-relevant question categories.
- Regression traps are durable and CI-addressable.
- Live misses can be captured and promoted into future regression sets.
- Release decisions can consume eval/regression evidence via gate thresholds.
