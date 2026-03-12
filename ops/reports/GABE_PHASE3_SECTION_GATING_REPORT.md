# GABE Phase 3: Manual-ID Scoped + Section-Aware Retrieval

## What changed
1. Ingest now resolves canonical `manual_id` from registry before chunk upsert.
2. Chunks without confident `manual_id` are quarantined (`$MANUALS_PATH/quarantine/unassigned_chunks.ndjson`) and not indexed.
3. Chunk metadata expanded with canonical identity and section attributes:
   - manual_id, manufacturer, brand, model, normalized_model, family, size, manual_type, page_number,
     section_type, section_title, content_kind, source_url, revision, language.
4. Section classifier added at ingest (`sectionClassifier.ts`).
5. Query-to-section router added (`querySectionRouter.ts`).
6. Qdrant search now supports strict scope filter by:
   - allowed manual IDs
   - allowed manual types
   - preferred section types
7. Validator now checks topic-to-evidence relevance and fails on evidence topic mismatch.

## Definition-of-done mapping
- Pipe/venting answer from door-operation text: blocked by section targeting + relevance validator.
- Retrieval manual scoped: done via `manual_id` scope filter.
- Section targeting visible in audit: `section_targets` in response metadata.
- Irrelevant evidence causes refusal/downgrade: `evidence_topic_mismatch` rejection path.

## Rollout notes
1. Run phase2 backfill first so registry IDs exist.
2. Re-ingest manuals to stamp `manual_id` and section metadata onto chunks.
3. Monitor refusals after hard gating; expect temporary refusal increase until reingest catches up.
4. Once full corpus has `manual_id`, remove tuple-based fallback paths entirely.
