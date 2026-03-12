# GABE Phase 2 Rollout: Registry-First + Hard Manual Gating

## Implemented in this phase
1. Persistent canonical registry table: `fireplace_manual_registry` (migration + runtime ensure).
2. Registry candidate selection service with deterministic scoring and manual-type policy enforcement.
3. Query flow refactor to registry-first candidate selection before chunk retrieval for install-critical intents.
4. Hard gating on allowed manual candidates for install-critical intents.
5. Validator hard failures for invalid gated/manual-type conditions.
6. Backfill script upgraded to populate registry + reconciliation report.
7. Expanded response metadata with registry/gating trace fields.
8. Added gating tests and expanded eval cases.

## Rollout order
1. Apply DB migration `0001_fireplace_manual_registry.sql`.
2. Run `npm run backfill:manual-registry` in `services/gabe-knowledge-engine`.
3. Inspect `/tmp/gabe_manual_registry_reconciliation.json` and fix low-confidence rows.
4. Deploy with conservative thresholds:
   - `RESOLVER_CONFIDENCE_MIN=0.7`
   - `REGISTRY_MATCH_CONFIDENCE_MIN=2.0`
   - `INSTALL_INTENT_REQUIRES_INSTALL_MANUAL=true`
5. Monitor:
   - wrong_manual_rate
   - wrong_manual_type_rate
   - unresolved_but_answered_rate
6. Tighten or relax thresholds based on production eval.

## Known unresolved gaps
- Revision/date quality still sparse in source metadata.
- Chunk payloads currently do not carry explicit `manual_id`; mapping is inferred via source/model/title tuple.
- Multi-revision conflict resolution needs explicit revision-aware ranking once metadata improves.

## Immediate safety result
Install-critical questions now fail fast when resolver confidence or registry gating is weak, rather than running broad global retrieval.
