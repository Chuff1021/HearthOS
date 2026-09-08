# Aaron's CRM Stabilization Checkpoint

Status: local implementation checkpoint, NOT approved for deployment or dealer onboarding.
Branch: `codex/aarons-crm-stabilization`, based on live `main` commit `4bd8ab6`.
Workspace: `/Users/fireplace/HearthOS-stabilization`.

## Production Safety

- No production deployment, migration, record mutation, sync, payment, email, or upload was performed during this implementation.
- No production environment file was copied into this worktree. Build, browser, and automated tests ran without live database/provider credentials.
- A fresh encrypted PostgreSQL archive was created with a read-only dump and restored successfully into a temporary, loopback-only PostgreSQL cluster. The cluster and decrypted archive were removed after verification.
- Archive: `/Users/fireplace/HearthOS-secure-backups/hearthos-production-2026-09-08T14-33-31-197Z.dump.enc`.
- Archive SHA256: `61154e22964e2f0d70709512cb9690a5018aa01aa37b90384d5d1019b8dda4b5`.
- Restore inventory: 4,915 customers; 9,622 invoices; 9,379 payments; 180 operational jobs; 36 Meeks requests; 9 projects; 33 embedded job-photo entries. Invoice totals, balances, and payment totals were read successfully from the fixed restored snapshot.
- This is restoration evidence, not a completed migration, byte-level media recovery test, or production financial reconciliation. Today's live records can continue changing independently.
- Existing main expenses, browser QuickBooks sync, Meeks, and operational data stores were retained. No demo records were introduced. Neither demo deployment was touched.

## Implemented

1. Updated supported production dependencies, including Clerk, Next.js, Drizzle, Undici, and Nodemailer. Production dependency audit currently reports zero known vulnerabilities.
2. Added a server-derived Aaron compatibility actor: verified primary Clerk email must match exactly one active employee in the existing `default` organization. No employee auto-creation, fuzzy-name matching, unsafe-metadata privilege grants, or missing-auth local-admin fallback.
3. Classified all 166 exported API handlers with explicit access boundaries. Ordinary handlers check role authorization before their business logic; cron, Meeks, payment/estimate links, and provider webhooks have separate boundaries.
4. Scoped technicians' job reads/updates, time entries, requests, inbox tasks, and location identity. Printable job reports also check membership and assignment. Technician updates cannot reassign a job or change arbitrary job fields.
5. Replaced admin-layout email assumptions and protected all three settings/content/integration server actions. Organization identity is server-derived, not a hidden form field. JSON settings updates preserve unrelated keys.
6. Restored the Projects route/API/sidebar from the existing project implementation and fixed dashboard parsing of the `{ jobs, total }` API response. Existing stored projects are not reconstructed.
7. Replaced customer-lookup's internal HTTP/QB-sync chain with an organization-scoped Neon read. Added shared multi-term name/address/email/phone matching and recorded address fields to customer-center responses. Jobs lookup cancels stale requests and shows addresses/errors; schedule lookup checks HTTP failures.
8. Added cancellation-safe record loading for customer profiles, document drawers, and job-profit details. Old responses cannot replace a newly selected record.
9. Reset technician GPS identity on account changes; ignore callbacks from disposed watchers and reject unsuccessful location submissions.
10. Removed false inspection/signature success and the nonfunctional tech-invoice offline-queue message. This does NOT repair the underlying invoice write path.
11. Restricted the service worker to public assets. Private documents are network-only; an offline page contains no customer data. Only superseded HearthOS cache entries are removed; unrelated caches and local drafts are retained.
12. Added expiring, document-bound signed customer links, Square webhook fail-closed verification, a Chatwoot bearer boundary, QuickBooks OAuth-state validation, and source-token-derived Square request idempotency. These are partial hardening, not a durable financial ledger or complete replay protection.
13. Added repeatable tests and a CRM CI workflow. Existing source lint errors were corrected without changing page layouts.

## Verification Executed

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run build` | Pass; 7 existing persistence/tracing warnings plus runtime localStorage warnings |
| `npm run lint` | Zero errors; remaining nonblocking warnings require follow-up |
| `npm run test:security` | 22 passing tests |
| `npm audit --omit=dev` | Zero known production dependency vulnerabilities |
| Encrypted backup restore | Pass; records and aggregate financial fields readable |
| Built app, auth unconfigured | Seven private API/page probes returned 503 without private data |
| Synthetic browser fixture | Slow-to-fast record switch retained latest record; failed fetch displayed error |

The 166-handler check is a static inventory, NOT 166 end-to-end security tests. Runtime tests cover the real shared actor/guard, assigned-job handlers with isolated storage fixtures, cron authentication, and Meeks partner/internal separation. Additional tests cover role policies, signed-link tampering/expiry, SQL parameter binding, public-only service-worker caching, and Nodemailer rendering without sending email.

The browser fixture uses only synthetic records and the actual shared loading hook. It is not an authenticated full-CRM walkthrough. No real Clerk staff session, Square sandbox charge, QuickBooks sandbox sync, R2 upload, production-clone application mutation, or complete cross-tenant suite was run. CI is checked in but has not run remotely; branch protection is not configured by this change. Development dependency advisories remain outside the clean production-only audit.

## Hard Release Gates

Do not deploy this branch directly over Aaron's production site.

1. Provision a preview with an isolated database and test-only integrations, private storage namespace, disabled cron, and no outbound production mail. Verify the intended Vercel project and alias before any deployment.
2. Review the seven existing employees' actual role/email mappings against Clerk verified primary emails. Confirm Colton, Chris, John, Lucas, office staff, and Shawn independently. No guess-based automatic remapping.
3. Complete the role/workflow matrix. The current conservative policy restricts QuickBooks writes/sync to owner/admin and denies technician direct financial-list/payment APIs and estimator endpoints. Scoped technician invoice/estimate/payment workflows need to be implemented and tested before release; do not broaden access globally to make buttons work.
4. Configure a new random `HEARTHOS_PUBLIC_LINK_SECRET` (at least 32 bytes) and explicit HTTPS `HEARTHOS_PUBLIC_ORIGIN` on the correct environment. Do not put the secret in public variables or Git.
5. Plan the transition for already-issued unsigned payment/estimate URLs. They will be rejected by this implementation. Inventory/reissue legitimate links with office approval before enforcing the new boundary. Existing links must not be silently broken during Aaron's daily work.
6. Verify `CRON_SECRET`, Square webhook signature key/exact webhook URL, QuickBooks callback state/session behavior, and any active Chatwoot integration. The new Chatwoot bearer requirement needs a compatible authenticated sender/relay; missing credentials intentionally reject requests.
7. Verify Projects against all nine restored rows, dashboard jobs against the same date/filter, receipts/photos/PO attachments, technician completion, and customer-address selection in the isolated preview.
8. Run complete financial and tenant-isolation suites before dealer onboarding. This branch is single-organization compatibility hardening, NOT the multi-tenant foundation. It still has default-org stores, global integration caches, and no effective RLS isolation.
9. Promote only the reviewed commit after compatibility approval, then monitor authentication, sync, saves, payment recording, and webhook failures. A code rollback must not restore an old database over new daily transactions.

## Next Engineering Work

- Canonical invoice/customer repository adapters and validated tech invoice creation; reconcile legacy records without discarding them. Remove remaining false-delivery states in tech estimates.
- Durable payment/webhook inbox, atomic idempotency/allocation, QuickBooks retry outbox, and reconciliation views. A stable Square source-token key alone does not solve duplicate ledger writes or repeated new card tokenizations.
- Transactional QuickBooks child-row updates, resumable sync, and tenant-bound credentials/caches.
- Atomic Meeks-to-main transfer with duplicate-request prevention.
- Private direct-to-R2 upload intents, assignment authorization, checksums, thumbnails, and verified legacy-photo retention. Existing embedded photos were not migrated.
- Complete tenant membership/revocation, transaction-scoped RLS with restricted roles, onboarding readiness, support-session enforcement, and immutable audit trails.
- Timezone/DST consistency, honest dashboard metrics, mobile outbox, remaining lint/build warnings, tooling dependency advisories, and independent security review.

Audit reference: `/Users/fireplace/HearthOS/docs/CRM_AUDIT_2026-09-08.md`.
