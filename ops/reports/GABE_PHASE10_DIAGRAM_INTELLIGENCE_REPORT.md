# GABE Phase 10: Diagram, Figure, and Callout Intelligence

## Implemented
1. Added diagram type classifier (`diagramClassifier.ts`) for framing/venting/wiring/clearance/exploded/spec/sequence categories.
2. Added figure-note linker (`figureNoteLinker.ts`) to connect caption, notes, nearby explanation, image ref, and callout labels.
3. Expanded ingest payload metadata (manual + diagram ingestion) with figure/diagram fields:
   - figure_present, figure_caption, heading_scope, figure_note_text, page_image_ref, diagram_type, callout_labels.
4. Added diagram-aware retrieval preference for diagram-likely intents and preserved strict manual-id scoping.
5. Added validator rejection when diagram evidence is expected+available but answer lacks diagram-linked/fact support.
6. Added response metadata:
   - diagram_used, diagram_type, figure_caption, figure_page_number, figure_note_linked, evidence_source_mode.
7. Added eval/test scaffolding for diagram-dependent scenarios.

## Expected impact
- Better install-critical answers where drawings/tables/figure notes are primary evidence.
- Better parts foundation through exploded view callout capture.
- Stronger auditability when diagram evidence is used.
