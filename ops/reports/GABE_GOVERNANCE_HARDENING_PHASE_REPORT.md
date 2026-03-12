# GABE Governance Hardening Phase

## Delivered
1. Full worker queue lifecycle tables + processor logic:
   - queued/download/parse/checksum/validation/retry/failure status handling
2. Checksum snapshot history with changed-binary/metadata flags for diff visibility.
3. Supersession graph edges with accepted/proposed states and confidence-based linking.
4. Role-based reviewer actions with durable activation audit logging.
5. Activation audit history for discovery/worker/review events.
6. Jurisdiction-aware query authority policy injection into live answer metadata.
7. Expanded governance dashboards/endpoints for queue, failures, approvals, supersession, and jurisdiction health.
8. Safe activation hardening by policy: risky/ambiguous/weak-confidence classes route to review queue.
9. Query-time machine-visible metadata for authority/jurisdiction/activation/supersession checks.
10. Tests and scripts for governance hardening and worker processing.

## New/updated components
- Migration: `0006_governance_hardening.sql`
- Module: `sourceGovernanceHardening.ts`
- Script: `process_source_queue_once.ts`
- Endpoints:
  - `/ops/source-governance/queue-job`
  - `/ops/source-governance/process-next-job`
  - `/ops/source-governance/reviewer-action`
  - `/ops/source-governance/dashboard-expanded`

## Safety outcomes
- Ambiguous revisions and unresolved supersession relationships are visible and auditable.
- Reviewer actions are durable and traceable.
- Jurisdiction/code authority context can now be attached to live query decisions without bypassing manual-first model-specific safety.
