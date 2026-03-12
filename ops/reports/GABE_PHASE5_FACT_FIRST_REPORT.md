# GABE Phase 5: Structured Fact-First Technical Engine

## Summary
Phase 5 prioritizes fact extraction and fact-first routing for install-critical/spec questions before observability-only work.

## Implemented
1. Added normalized technical facts storage (`fireplace_technical_facts`) with manual/page evidence links.
2. Added fact extraction pipeline from ingested chunks for:
   - vent systems/size
   - framing dimensions
   - clearances (mantel/wall)
   - gas pressure
   - electrical requirements
   - approvals/listings
   - remote compatibility
   - parts references
3. Added source-kind metadata (`prose|table|diagram|figure_note`) on facts.
4. Added fact-first answer routing for install-critical intents.
5. Added numeric validator hardening: numeric answers must be supported by facts or numeric quote evidence.
6. Added metrics:
   - strict_manual_id_coverage_rate
   - incomplete_manual_refusal_rate
   - install_query_no_manual_id_attempts
   - fact_answer_rate
   - unsupported_numeric_answer_attempts
7. Added phase5 eval/test scaffolding.

## Expected quality impact
- More deterministic answers for common technical/spec questions.
- Reduced wrong-chunk numeric/spec responses.
- Better refusal behavior where fact support is missing.
