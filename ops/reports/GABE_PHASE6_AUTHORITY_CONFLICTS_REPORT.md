# GABE Phase 6: Authoritative Fact Parsing + Conflict-Safe Resolution

## What was upgraded
1. Added section-aware table parser (`sectionTableParser.ts`) to extract table/chart facts with page + section context.
2. Added extraction confidence tiers:
   - exact_table
   - exact_prose
   - inferred_from_diagram_note
   - weak_pattern_match
3. Added deterministic source authority / precedence policy (`factPrecedence.ts`).
4. Added conflict detection and resolution (`factConflictResolver.ts`) with safe refusal when ambiguity remains.
5. Added fact metadata for precedence and provenance:
   - extraction_confidence_tier
   - source_authority
   - precedence_rank
   - superseded_fact_ids
   - provenance_detail (table_row/table_cell/figure_note/diagram_callout/heading_scope)
6. Updated fact-first query routing to resolve conflicts before answering install-critical questions.
7. Added audit metadata explaining chosen authoritative fact and conflict strategy.

## Safety behavior
- If conflict resolution is not clearly authoritative, answer is refused (`fact_conflict_unresolved`).
- Install-critical numeric/spec responses now require precedence-checked fact support.

## Expected impact
- Better table-derived fact quality for venting/framing/clearances/gas/electrical.
- Safer handling of revision/manual-type disagreements.
- Clear audit trace for why one fact won.
