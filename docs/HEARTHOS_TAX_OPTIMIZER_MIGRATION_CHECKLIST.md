# HearthOS Tax Optimizer — Drizzle Migration Checklist

## Goal
Create a safe, phased DB rollout for Tax Optimizer + AI CPA features with backward compatibility.

## Phase 0 — Foundations (no user-facing behavior changes)
- [ ] Add enums:
  - `tax_entity_type` (`llc`, `s_corp`, `c_corp`, `sole_prop`, `partnership`, `nonprofit`)
  - `filing_status` (`draft`, `ready_for_review`, `approved`, `submitted`, `accepted`, `rejected`, `paid`, `void`)
  - `obligation_type` (`sales_tax`, `payroll_tax`, `income_estimated`, `w2`, `1099`, `annual_report`)
  - `automation_mode` (`manual`, `assisted`, `auto_submit`)
- [ ] Create table `tax_profiles`
  - `id`, `org_id`, `entity_type`, `federal_ein`, `state_account_refs` (jsonb), `default_automation_mode`, `created_at`, `updated_at`
  - index: `(org_id)` unique
- [ ] Create table `tax_periods`
  - `id`, `org_id`, `year`, `quarter`, `month`, `period_start`, `period_end`, `is_closed`
  - index: `(org_id, year, quarter, month)`
- [ ] Create table `tax_obligations`
  - `id`, `org_id`, `period_id`, `obligation_type`, `jurisdiction`, `due_date`, `status`, `estimated_amount_cents`, `final_amount_cents`, `currency`
  - indexes: `(org_id, due_date)`, `(org_id, status)`
- [ ] Create table `tax_filing_runs`
  - `id`, `org_id`, `obligation_id`, `status`, `submitted_at`, `accepted_at`, `rejected_reason`, `payload_hash`, `provider`, `external_ref`
  - indexes: `(org_id, obligation_id)`, `(org_id, status)`
- [ ] Create table `tax_documents`
  - `id`, `org_id`, `obligation_id`, `doc_type`, `storage_key`, `checksum`, `created_by`, `created_at`
- [ ] Create table `tax_audit_events`
  - `id`, `org_id`, `actor_user_id`, `event_type`, `entity_type`, `entity_id`, `before_json`, `after_json`, `ip`, `user_agent`, `created_at`
  - indexes: `(org_id, created_at)`, `(org_id, entity_type, entity_id)`

## Phase 1 — Ingestion + readiness
- [ ] Create table `tax_data_sources`
  - QuickBooks/payroll/bank source metadata, sync state, last_success_at
- [ ] Create table `tax_ingestion_runs`
  - source run logs, records_seen, records_imported, warnings/errors jsonb
- [ ] Create table `tax_readiness_checks`
  - per-org per-period readiness score + missing item flags

## Phase 2 — Automation
- [ ] Create table `tax_automation_rules`
  - `id`, `org_id`, `obligation_type`, `jurisdiction`, `rule_json`, `enabled`
- [ ] Create table `tax_payment_instructions`
  - account token refs, auth method refs, approval requirements
- [ ] Create table `tax_submission_queue`
  - queued actions with `idempotency_key`, `scheduled_at`, `attempts`, `last_error`

## Phase 3 — Payroll artifacts
- [ ] Create table `w2_batches`
  - year/org batch state, generated_at, approved_by, filed_at
- [ ] Create table `w2_forms`
  - employee refs, wage/tax fields jsonb, status, correction refs
- [ ] Create table `w2_delivery_events`
  - delivery channel and status

## Migration execution order
1. Enums + core tables (Phase 0)
2. Ingestion/readiness tables (Phase 1)
3. Automation queue/rules tables (Phase 2)
4. W2 artifacts (Phase 3)

## Runtime safety
- [ ] Add all new columns/tables as additive only (no destructive changes)
- [ ] Add nullable fields first; backfill; then tighten constraints in later migration
- [ ] Add indexes concurrently where needed (production)
- [ ] Implement idempotency keys for submission queue + filing runs
- [ ] Use feature flags per module:
  - `taxOptimizer.enabled`
  - `taxOptimizer.autoSubmit.enabled`
  - `taxOptimizer.w2.enabled`

## Drizzle checklist
- [ ] Update `src/db/schema.ts` with new enums/tables
- [ ] Generate migration: `npm run db:generate`
- [ ] Review SQL for index/constraint correctness
- [ ] Apply migration in staging: `npm run db:migrate`
- [ ] Smoke test endpoints (see API contracts doc)
- [ ] Apply to production in maintenance window
- [ ] Verify post-migration health dashboards
