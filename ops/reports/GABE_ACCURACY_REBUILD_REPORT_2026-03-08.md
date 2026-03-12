# GABE Accuracy Rebuild Report (2026-03-08)

## 1) What was wrong (confirmed)
1. Retrieval could search too broadly across nearby models/families before deterministic model scoping.
2. Manual ranking was chunk-first and heuristic-heavy; no explicit manual-level deterministic ranker.
3. Model resolution relied on narrow phrase matching (`buildModelPhrases`) and missed alias/family/size variants.
4. Manual-type preference (installation vs owner vs parts) was not strongly enforced early.
5. UI and API contract did not always expose resolved target + selected manual metadata clearly.
6. Wrong-manual risk relied mostly on overlap checks late in pipeline.

## 2) Quick wins implemented now
- Added `resolveQuery()` pre-retrieval resolver (`src/swarm/modelResolver.ts`) with manufacturer/model alias normalization, family+size extraction, confidence, preferred manual type.
- Added deterministic manual-level ranking (`src/swarm/manualRanker.ts`) before chunk selection.
- Added manual scoping to top-ranked manuals before strong candidate selection.
- Added manual-type weighting and penalties for family-size mismatch and low-value doc types (flyer/spec/TOC/intro).
- Added output metadata for resolved model/manufacturer, confidence, alternatives considered.
- Added response contract expansion in composer: `answer_text`, `answer_status`, `validator_result`, `selected_manual_*`, `evidence_excerpt`, `engine_path_used`, `refusal_reason`.
- Added validator hard reject for `manual_type_mismatch` risk.

## 3) Current architecture snapshot (post quick-win)
Question -> intent classify + query resolve -> retrieval (vector/keyword/diagram/qa-memory) -> route + technical filters -> **manual-level ranking/scoping** -> engine path (vent/wiring/parts/compliance/general) -> validator -> response composer -> metadata persistence.

## 4) Priority next (full rebuild phases)
### P0 (next commits)
1. Canonical `fireplace_manual_registry` store + migration/backfill from existing Qdrant payloads.
2. Replace static phrase matching fully with resolver + registry catalog lookup.
3. Manual-first retrieval against registry IDs, then chunk retrieval only inside top manuals.
4. Structured stores expansion:
   - aliases, framing, clearances, vent rules, wiring specs, parts, fuel pressure, approvals, electrical specs.
5. Validator numeric consistency checks and citation page verification against chunk provenance.

### P1
1. Eval suite expansion to 150-300 model-specific trap cases.
2. Wrong-manual telemetry dashboard + release gates.
3. Revision-aware manual preference and active manual lifecycle.

## 5) Data gaps blocking full accuracy
- Missing canonical `manual_id` across older chunks.
- Inconsistent model formatting in payload (`42 Apex` vs `42 Apex NexGen-Hybrid`).
- Weak/absent revision metadata on many manuals.
- Incomplete manual type assignment in legacy ingestion.

## 6) Top 10 likely reasons prior answers underperformed
1. Broad retrieval pool too early.
2. No deterministic manual-level ranking gate.
3. Alias/synonym model resolution gaps.
4. Weak size mismatch penalties.
5. Installation intent not forcing install docs strongly enough.
6. QA memory occasionally mixing context ahead of manual specificity.
7. Intro/TOC/warranty noise not sufficiently suppressed early.
8. Single-turn ambiguity handling too permissive.
9. Output contract did not force explicit resolved/selected metadata.
10. Eval set too small for near-model confusion traps.

## 7) Rollout order
1. Deploy quick wins (done in code, run regression).
2. Add registry + backfill script and dual-read mode.
3. Enable resolver+registry hard filter for high-confidence queries.
4. Turn on strict validator mode for verified answers.
5. Expand eval and add deploy gates.
6. Remove legacy broad fallback path once metrics stabilize.
