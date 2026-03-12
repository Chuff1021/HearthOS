# GABE Source Intake & Governance System

## Implemented scope
Built a persistent Source Intake and Governance foundation to continuously discover, ingest, govern, and safely activate technical sources.

## 1) Source registry
Added DB migration + schema support for:
- `gabe_source_registry`
- `gabe_source_review_queue`
- `gabe_jurisdiction_registry`

Fields include source identity, classification, model/family/size, revision/effective dates, checksum, ingest/activation status, confidence, supersession, and recheck timestamps.

## 2) Source classes
Supported classes in governance module:
- manufacturer_manual
- service_bulletin
- parts_list
- wiring_diagram
- standards_document
- code_document
- jurisdiction_adoption_record
- internal_sop
- training_reference

## 3) Discovery agents/jobs
Added discovery watch job:
- `scripts/discovery_watch_sources.ts`

Also added scheduled/manual GitHub workflow:
- `.github/workflows/gabe-source-discovery.yml`

## 4) Governance pipeline behavior
Implemented discover-time governance with policy:
- high-risk/ambiguous/weak-confidence/weak-OCR docs route to review queue
- safe high-confidence docs can auto-activate
- no silent activation for risky classes

## 5) Activation policy
`upsertDiscoveredSource()` enforces:
- pending review for standards/code/service bulletins and low-confidence docs
- review queue records with reason + severity

## 6) Jurisdiction layer
Added persistent `gabe_jurisdiction_registry` with adopted code edition mapping fields and confidence.

## 7) Monitoring + dashboard endpoints
Added ops endpoints:
- `/ops/source-governance/dashboard`
- `/ops/source-governance/discovered`
- `/ops/source-governance/query-policy`
- `/ops/source-governance/missing-source-suggestions`

Dashboard includes:
- new/changed/failed/quarantined/stale docs
- open review items
- manufacturer coverage summary

## 8) Query policy integration
Added source-priority policy integration at query-time metadata layer:
- model-specific technical queries prioritize manufacturer manuals
- code/standards queries prioritize jurisdiction/code sources
- parts queries prioritize parts/service/manual path
- brochure/flyer remain non-authoritative for install-critical

## Notes
This phase establishes governance scaffolding + operational endpoints and discovery automation. Next hardening step can add deeper external metadata parsers for NFPA/ICC edition lineage and stricter activation workflows with human approvals per role.
