# GABE Phase 4: Strict Manual-ID Enforcement + Corpus Completeness

## Implemented
1. Install-critical retrieval now enforces `manual_id` scope requirement (no broad fallback path when strict mode enabled).
2. Added corpus completeness computation and ops endpoints:
   - `GET /ops/corpus-completeness`
   - `GET /ops/reingest-needed`
3. Added machine-visible audit metadata:
   - retrieval_scope_mode
   - manual_id_filter_applied
   - section_filter_applied
   - fallback_disabled
   - corpus_completeness_status
4. Added strict-mode tests/evals and re-ingest planning outputs.

## Legacy compatibility boundary
- Install-critical intents: strict manual_id mode only.
- Non-install-critical intents: legacy/hybrid fallback still allowed temporarily and marked in metadata (`retrieval_scope_mode=hybrid_legacy_allowed`).

## Re-ingest workflow
Use `/ops/reingest-needed` output to split manuals into:
- safe_manuals
- incomplete_manuals
- quarantined_manuals
- legacy_tuple_only_manuals

Re-ingest incomplete and legacy manuals before enabling hard fail in all environments.

## Definition-of-done check
- Install-critical answers impossible without manual_id scoping: enforced in query path.
- Corpus gaps visible: completeness endpoints and report fields added.
- Incomplete manuals surfaced: status + refusal path metadata.
- Audit metadata shows strict enforcement state.
