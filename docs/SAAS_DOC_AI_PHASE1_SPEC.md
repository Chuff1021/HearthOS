# SaaS Document AI Phase 1 Spec (HearthOS / GABE)

## Goal
Deliver a production-capable Phase 1 that improves manual extraction accuracy for diagram/table-heavy fireplace docs (starting with framing dimensions), while preserving strict citation and no-hallucination behavior.

## Scope (Phase 1)
- Integrate one managed Document AI provider as primary extraction path.
- Keep existing OCR/open-source extraction as fallback.
- Extract and store structured framing dimensions with page-level citation metadata.
- Use structured facts first in GABE query runtime; fall back to current RAG when needed.
- Add basic eval and release gate checks for structured extraction correctness.

## Out of Scope (Phase 1)
- Full multi-provider failover orchestration.
- Billing implementation.
- Full reviewer UI (manual approval workflow can be CLI/file based in Phase 1).
- Non-framing domain coverage (venting/clearance/pressure added in Phase 2).

## Success Criteria
1. FPX 42 Apex framing queries return model-correct, page-correct, numeric dimensions.
2. Wrong-manual rate for Phase 1 benchmark < 1%.
3. Missing citation fields for manual answers = 0%.
4. Structured fact hit-rate for framing benchmark >= 80%.
5. Regression gate passes with strict model/url assertions.

## Provider Decision (Phase 1)
Primary recommendation: **Google Document AI** (with Azure Document Intelligence as backup option if contract/compliance favors Azure).

Decision due: before implementation day 1.

## Architecture Changes

### A) Extraction Pipeline
1. Ingest manual PDF.
2. Compute manual hash and check extraction cache.
3. If cache miss:
   - Send selected pages (or full document initially) to managed Document AI processor.
   - Receive text/layout/table outputs with confidence and coordinates.
4. Normalize extraction output to internal `DimensionRecord` schema.
5. Upsert into dimensions store.

### B) Runtime Query Path
1. Parse question intent (`framing dimensions`) + model hints.
2. Query structured dimensions store first (`topic=framing`, model-scoped).
3. If high-confidence structured facts found:
   - Return structured answer with citation (manual title, page, URL, quote/value).
4. Else fall back to existing retrieval/RAG pipeline.
5. If evidence weak: return `source_type=none`.

### C) Fallback Behavior
- If Document AI fails/unavailable, run existing OCR extraction path.
- Always preserve deterministic output contract and citations.

## Data Contract (Phase 1)
Use/keep `DimensionRecord`:
- install_angle: standard|45|unknown
- dimension_key
- value_imperial
- value_metric
- units
- page_number
- source_url
- manual_title
- manufacturer
- model
- confidence

Add metadata fields (Phase 1 extension):
- extraction_provider (`gdocai`|`azure`|`fallback_ocr`)
- extraction_version
- manual_hash
- extracted_at

## API/Service Work Items

1. `services/gabe-knowledge-engine/src/ingest/docAiProvider.ts`
   - Provider adapter interface + first provider implementation.

2. `services/gabe-knowledge-engine/src/ingest/docAiNormalize.ts`
   - Map provider output -> `DimensionRecord[]`.

3. `scripts/extract_framing_dimensions.ts`
   - Add `--provider` flag and provider credentials/env support.

4. `src/index.ts`
   - Ensure `/query` prefers structured dimensions for framing.
   - Preserve fallback and strict no-answer safety.

5. Config additions
   - `DOC_AI_PROVIDER`
   - `DOC_AI_ENDPOINT` / project/location settings
   - `DOC_AI_API_KEY` or service account path
   - `DOC_AI_TIMEOUT_MS`

## Security & Compliance (Phase 1)
- No secrets in repo.
- Provider credentials via env only.
- Log redaction for request/response payloads.
- Tenant ID included in all extraction and storage writes.

## Observability (Phase 1)
Add counters:
- `gabe_docai_requests_total`
- `gabe_docai_failures_total`
- `gabe_structured_fact_hits_total`
- `gabe_structured_fact_misses_total`

Add logs:
- provider, manual_hash, model, topic, page_count, extraction duration, fallback used.

## Test Plan (Phase 1)

### Benchmark set
- Start with 20 framing questions across top models.
- Include ambiguous prompts and shorthand model names.

### Required checks
- strict model/url match
- numeric value presence for framing answers
- citation completeness
- no wrong-manual citations

### Gate
`scripts/gabe_release_gate.sh` must include structured-fact framing checks before pass.

## Rollout Plan

### Week 1
- Provider integration + normalization.
- Run against FPX 42 Apex + 5 related manuals.
- Validate extraction quality and storage shape.

### Week 2
- Expand to top 20 framing manuals.
- Enable runtime structured-first for framing in production.
- Monitor metrics and fallback rates.

## Risks & Mitigations
1. Provider extraction variability
   - Mitigation: normalization + confidence thresholds + fallback path.
2. Cost increase
   - Mitigation: hash cache, selective page extraction, batch mode.
3. Wrong angle interpretation (standard vs 45°)
   - Mitigation: region/tag rule + conservative ambiguity handling.

## Deliverables
- Provider adapter + normalization modules.
- Updated extraction script with provider mode.
- Runtime structured-first framing behavior.
- Phase 1 benchmark report and go/no-go summary.
