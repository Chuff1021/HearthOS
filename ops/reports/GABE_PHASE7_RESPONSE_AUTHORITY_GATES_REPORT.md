# GABE Phase 7: Response-Time Authority Crosscheck + Release Gates

## Implemented
1. Response-time authority crosscheck module (`authorityCrosscheck.ts`) verifies selected fact is still valid before emission.
2. Blocks install-critical answers when:
   - contradicted by higher-authority/newer fact
   - selected fact is superseded
   - selected fact no longer wins precedence
3. Validator tightened for final consistency:
   - unresolved fact conflict -> refusal
   - source/page/quote alignment checks
   - numeric claims must be supported by selected fact/quote
4. Release gate engine (`releaseGates.ts`) with configurable thresholds for critical quality metrics.
5. Added `/ops/release-readiness` endpoint to compute pass/fail against gates.
6. Metrics expanded:
   - response_time_authority_override_blocks
   - superseded_fact_block_count
   - unresolved_conflict_refusal_rate
   - authority_crosscheck_failures
   - fact_selection_reversal_count
7. Audit trace metadata expanded with final authority outcome fields.

## Definition-of-done check
- Install-critical answers blocked when higher-authority contradiction exists: yes.
- Release readiness measurable/enforceable: yes via release gates endpoint.
- Audit explains final authority: yes via final_authority_reason/final_fact_id/final_precedence_rank.
