#!/usr/bin/env bash
set -euo pipefail

npm run test:phase5-facts
npm run test:phase6-conflicts
npm run test:phase7-gates
npm run test:phase8-enforcement
npm run test:phase10-diagrams
npm run test:phase11-ocr-parts
npm run test:governance-hardening
npm run test:governance-ops-hardening
npm run test:phase12-live-eval
npm run eval:governance-hardening > /tmp/gabe_eval_governance_hardening.json

npm run report:corpus > /tmp/gabe_corpus_ci.json
npm run report:reingest > /tmp/gabe_reingest_ci.json

if [[ "${RUN_LIVE_GOLD_EVAL:-false}" == "true" ]]; then
  npm run eval:gold-live > /tmp/gabe_live_eval_runner_ci.json
  npm run smoke:live-pipe-guard > /tmp/gabe_live_smoke_pipe_guard_ci.json
else
  npm run score:gold-eval > /tmp/gabe_gold_eval_scorecard_ci.json
fi

npm run report:field-validation > /tmp/gabe_field_validation_ci.json
npm run check:release-readiness > /tmp/gabe_release_readiness_ci.json
npm run check:eval-thresholds > /tmp/gabe_eval_thresholds_ci.json

echo "CI release gate checks passed"
