# GABE Phase 11: OCR-Assisted Callouts + Exploded Parts Graph

## Implemented
1. Added OCR-assisted fallback foundation (`ocrFallback.ts`) for weak native extraction and image-heavy pages.
2. Added callout extraction enhancement (`calloutExtractor.ts`) capturing callout labels, part numbers, part names, page/figure context, and OCR confidence source mode.
3. Added structured exploded-parts graph storage (`fireplace_exploded_parts_graph`) + query/upsert service (`partsGraphStore.ts`).
4. Updated ingest pipelines (manual + diagram) to populate OCR metadata and parts graph callouts.
5. Added parts-aware retrieval preference for replacement-parts intent using parts graph first under manual-id scoping.
6. Added confidence-safe handling: weak OCR-only matches are refused when not corroborated.
7. Added response metadata:
   - ocr_used, ocr_confidence
   - exploded_parts_graph_used
   - part_match_type, part_number_matched, figure_callout_used
8. Added validator checks for parts/callout evidence sufficiency and OCR confidence safeguards.
9. Added phase11 tests/evals and CI wiring.

## Safety and authority behavior
- OCR does not silently override stronger native/manual evidence.
- OCR-only low-confidence part matches are downgraded/refused.
- Manual-id scoping and existing authority gates remain active.
