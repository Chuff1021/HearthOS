# Production Design Release: September 9, 2026

## Scope

The owner approved prototype revision 3, then explicitly requested application to
the existing Aaron production app. This release ports presentation onto verified
production source `7cfbe34f1a4e6dd21358d35ce9384a1bea04dee4`. It does not deploy the
independent Vite prototype, its fixtures, or the dormant multi-tenant foundation.

Worktree: `/Users/fireplace/HearthOS-production-design`.
Branch: `codex/production-design-refinement`.
Canonical production: `https://hearth-os.vercel.app/`.
Vercel project: `prj_8V7U87V5ffehDKkeiYvl5XXMZqGl` (`hearth-os`).
Rollback: `dpl_2hEqatkuea22325DqDarB1CHPGuJ`,
`https://hearth-2sit7bk9u-chuff1021s-projects.vercel.app`.

Changes cover scoped surfaces, typography, spacing, contrast, responsive controls,
the existing sidebar/header and dashboard, current CRM pages, and tech surfaces.
Customers, estimates/generator, projects, and schedule retain their existing
workflows. Banking is removed only from navigation at the owner's request; no
route or API is deleted or added. The dashboard job link is corrected to the
existing selected-job URL. Recent PO numbers now open the existing authorized,
read-only document drawer in a modal; no order creation/send/delete handler is
changed. No auth, provider, persistence, schema, migration,
upload, API, dependency, or Vercel configuration changes are included.

## Recovery And Baseline

Encrypted recovery archive was created and successfully restored into disposable
local PostgreSQL. The temporary cluster was removed after verification.

- Archive: `hearthos-production-2026-09-09T20-12-39-781Z.dump.enc`
- SHA256: `aa9541cfd739ebee96bf47c8f822072d094aa6b4170f5a971e2b3c706051efea`
- Read-only baseline: `production-baseline-2026-09-09T20-12-54-675Z.json`
- Baseline digest: `fc521517e4e2c48e4ee32d618ba841d0089d7a1c9c5a2697d133a94da23cd6e8`
- One existing organization, 67 tables, 4,916 customers, 9,626 invoices,
  9,379 payments, 190 stored jobs, 36 Meeks requests, and 9 projects.
- Invoice total: 9,997,391.83; invoice balance: 251,665.78;
  payment total: 9,773,307.82.

Files remain outside the repository in the owner's secure backup directory.
Database backup includes photo references, not a duplicate of private object
storage. Existing photo objects and upload paths are untouched. Never restore or
reseed production to force a snapshot match during normal business activity.

## Verification

`scripts/testing/design-preservation.mjs` compares the actual production base with
the candidate: event bindings, fetch calls, state/effect hooks, protected backend
files, and route inventory. This is a focused regression guard, not proof that
every possible business workflow is defect-free.

Release checks include security and quality tests, customer/payment persistence
tests on temporary PostgreSQL, website-inbox persistence tests, TypeScript,
ESLint, production dependency audit, and an isolated production build. Browser
tests render actual production components with synthetic HTTP responses. They
exercise search, address autofill, job forms, failed-save retention, calendar,
navigation, document selection, estimates/generator, and responsive presentation.
Synthetic responses are confined to test harnesses, never application source.

Known build warnings concern existing dynamic JSON-store file tracing. Existing
lint warnings and development-tool dependency findings are not silently repaired
with unrelated changes. Production dependency audit passed without findings.

## Rollout Gate

At document creation the changes are local and production is unchanged. Merge
through the protected pull request only after its required checks pass. Use a new
production-environment build with existing server-managed environment values;
never promote a preview-environment artifact over production. Keep the rollback
deployment available. Inspect the new build, runtime errors, authenticated data
visibility, and fresh read-only reconciliation after activation.

No real charges, estimate emails, QuickBooks reimports, or job mutations are
submitted just to test a presentation release. Actual provider transactions and
separate staff/Meeks sign-ins are not newly certified by this work. This release
does not certify multi-tenant readiness or replace the existing security roadmap.
