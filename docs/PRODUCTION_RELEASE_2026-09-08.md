# Production Release: September 8, 2026

## Incident Rollback: Supersedes Released Status Below

After the user signed in, customers, schedule, and QuickBooks appeared empty/disconnected. Vercel request logs show 403 across `/api/customers/center`, `/api/jobs`, `/api/dashboard`, `/api/dispatch`, `/api/meeks/jobs`, and `/api/quickbooks/status`. The new authorization boundary blocked the signed-in user's access. The specific identity/role rejection still requires diagnosis; do not bypass authentication or grant unknown users access to repair it.

Executed `vercel rollback https://hearth-q7skz1kl6-chuff1021s-projects.vercel.app --yes`, successful. Canonical production resolves to previous Ready deployment `dpl_37QrQtVu7YLHBWvab1C43FVYbLSC`. No database restore, migration, or intentional record edits. Read-only verification still returned 4915 customers, 9622 invoices, 9379 payments, 180 jobs in hearth_jobs_store, 36 Meeks requests, and 9 projects; all three financial aggregates below match. Browser dashboard after rollback again displays financial data and QB Synced. This verifies restored data visibility, not a newly executed QuickBooks sync.

GitHub main remains at `5ee9990`; the production deployment is deliberately rolled back. Do not redeploy main until authenticated owner, technician, and Meeks compatibility is verified. The rollback also reintroduces earlier security issues and removes the stabilization changes. Record-count and signed-out checks were insufficient release gates; authenticated business workflow tests are mandatory before retrying.

## Released

- User explicitly authorized the full stabilization release to the existing production site after discussion of staging and compatibility risks.
- Production: https://hearth-os.vercel.app/
- Git release: `5ee9990`, pushed to `origin/main`.
- Final production deployment: `dpl_9FovMDWz663DKxtcaiD16GXE8WAY`, Ready.
- Deployment URL: https://hearth-jd7wh7v5x-chuff1021s-projects.vercel.app/
- An initial CLI deployment of the same source was promoted before the Git push triggered the final automatic deployment.
- No migrations, database connection replacements, intentional business-record edits, or demo deployment changes were performed.

## Recovery

- Fresh encrypted backup: `/Users/fireplace/HearthOS-secure-backups/hearthos-production-2026-09-08T15-16-37-863Z.dump.enc`.
- SHA256: `801ee8afbde8206f0ae7df411966e5dbf0b3d63eac1203d83af5fb9af96663c1`.
- Archive restored successfully into a temporary loopback PostgreSQL instance; instance removed after verification. 380 archive entries.
- Previous Ready production deployment: `dpl_37QrQtVu7YLHBWvab1C43FVYbLSC`, https://hearth-q7skz1kl6-chuff1021s-projects.vercel.app/ (commit `4bd8ab6`).
- For a code regression, use a code rollback after checking compatibility. Never restore an old database over new daily transactions. A code rollback may also reintroduce security issues fixed in this release.

## Data Reconciliation

The restored backup and the post-promotion read-only production check matched on:

| Measure | Value |
| --- | ---: |
| Customers | 4915 |
| Invoices | 9622 |
| Payments | 9379 |
| Jobs | 180 |
| Meeks requests | 36 |
| Projects | 9 |
| Invoice total | 9996098.26 |
| Invoice balance | 250372.21 |
| Payment total | 9773307.82 |

The restored snapshot also contained 33 embedded photos; photos were not independently re-counted after deployment. Aggregate reconciliation does not prove every record or workflow is correct.

## Configuration

Added production-only `HEARTHOS_PUBLIC_LINK_SECRET`, `HEARTHOS_PUBLIC_ORIGIN`, and `CRON_SECRET`. Secrets were randomly generated and stored as sensitive Vercel values. Existing database, Clerk, QuickBooks, and Square credentials were not changed.

Existing unsigned public payment and estimate links are rejected by the new guards. Reissue links through the authenticated office workflow when needed; no customer links or emails were sent automatically.

## Verification

- Security suite: 22 passing tests; route inventory covers 166 handlers.
- Vercel production build: successful compilation and type checking. Existing tracing warnings remain.
- Canonical production resolves to the final Ready deployment.
- Signed-out jobs, customer search, dashboard, Meeks jobs, and cron checks reject unauthenticated access with 401 on the promoted release. Final automatic deployment jobs check also returned 401.
- Initial error-level log scans found no entries; this is a limited observation, not complete runtime validation.
- Browser navigated to the Clerk sign-in page. Authenticated dashboard and staff workflows were not verified because the browser requires fresh sign-in.

## Remaining Limitations

- This is an Aaron compatibility/security release, not completed multi-tenant isolation, RLS, or audit certification.
- Staff role matrix and full owner/technician/Meeks workflows require authenticated testing.
- Technicians are intentionally restricted from direct financial APIs; technician invoice/estimator compatibility is not resolved.
- Legacy customer/invoice read-write store inconsistencies and durable financial reconciliation/webhook idempotency work remain.
- Square webhook signature configuration and Chatwoot webhook secret are absent; those new handlers fail closed. A read-only Square subscription lookup returned no subscriptions. No webhook subscriptions were created.
- Clerk currently shows a development instance. Production identity-provider readiness remains follow-up work.
- QuickBooks sync, real payment capture, attachment upload, and end-to-end business workflows were not exercised during deployment. Do not interpret successful builds and 401 checks as proof of these flows.

## User Test Checklist

1. Refresh the production site and sign in with the existing account, not a new signup. Confirm Aaron's identity and existing customer, job, invoice, and payment records.
2. Check Projects and today's jobs, customer search, and address prefilling on Schedule and Jobs.
3. Create one clearly labeled internal TEST job, assign the intended technician, and confirm their separate login shows their identity and assigned job. Test a note, photo, and completion only on that test job.
4. Have Shawn verify his own Meeks login and existing calendar requests.
5. Review integration status and failures before relying on synchronization. Do not run fake charges or send test invoices/emails to real customers in production.

This report and the memory-bank follow-up are local documentation added after the deployed commit; they do not constitute another application deployment.
