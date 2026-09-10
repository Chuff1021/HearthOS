# Gas, Wood and Pellet Service Reports

## Release Scope

Based on production/main `fc1e85e`. The three approved masters in
`Documents/Company-Service-Forms` are represented by version-1 digital templates.
The Tech job has a separate Service Report tab; existing checklists and photos
remain accessible. Customer profiles gain Service Reports history.

Forms have explicit fuel selection (with a suggestion from recorded equipment or
job title), customer/job prefills, required conditions, measurements, findings,
outcomes, photo slots, documented exceptions, and acknowledgment records.
No model-specific universal limits or automatic safety approvals are invented.
Drafts require Save changes and display unsaved state; there is no claim of
offline autosave. Revision checks reject concurrent overwrites. Finalization
does not change the job's schedule or completion status.

Finalized reports store a fixed snapshot, actual authenticated finalizer identity,
timestamp, PDF and photo references. Allura (OFL license included) renders the
technician name electronically; no customer signature is synthesized. Corrections
use a new report; the old report/PDF remains unchanged. Evidence photos are
embedded in the customer PDF. Blank legacy reports no longer default to PASSED.

## Photos and Persistence

The old checklist Add Photo bug was an unmounted file input. Shared inputs now
remain mounted across tabs. New legacy uploads use an authenticated atomic append
endpoint with row locking and retry deduplication. Previously saved photos,
including duplicate historical entries, are never removed by that append.

New report photos and PDFs use the existing private object-storage configuration,
not new public URLs. JPG/PNG bytes are validated, decoded and normalized. Draft
photo removal does not delete retained object bytes; finalized photos cannot be
removed. Maximum 30 photos, 350 KB normalized photo size and 12 MB PDF size.
No arbitrary external image URLs are fetched. Exceptions require stated reasons;
the workflow never requires unsafe operation or roof access to satisfy a slot.

Three additive Neon tables store reports, photo references and delivery attempts.
There is no runtime schema creation and no rewrite of old job/photo records.
The current released job table is single-organization; new report access binds it
explicitly to Aaron's existing default organization. Do not reuse that legacy
table for another tenant without the separate tenancy rollout. Technician access
checks current assignment; office report history remains available after job
deletion. Download URLs require authentication and return private/no-store.

## Email

Use the existing SMTP transport, with a dedicated report email and the exact
stored PDF. The new optional one-attempt mode prevents blind SMTP replay without
changing invoice/estimate callers' retry behavior. Recipient confirmation and
stable action IDs prevent double sends. Provider acceptance is not labeled inbox
delivery. Uncertain attempts block a new send until office investigation; no
automatic mail retry or customer email is sent by opening a report.

An owner/admin-only file-connection check writes, reads, verifies, and deletes its
own random synthetic object. It creates no job/customer/report records and cannot
delete an existing user-selected object. It is not automatically invoked.

## Verification Before Rollout

- Fresh encrypted archive: `hearthos-production-2026-09-10T14-28-59-295Z.dump.enc`,
  SHA-256 `0ce2fb802a35b608ad8a8340ebcb8224d929987adbf4d11fe2d9f898f7ffa37a`;
  394 archive entries. Kept in the secure backup directory, never in Git.
- Restored isolated PostgreSQL rehearsal applied only `service-reports.sql` twice:
  all 67 original table fingerprints unchanged, three new empty tables.
- 60 dedicated persistence/HTTP/access tests pass, including original photo
  preservation, concurrent appends/saves, missing photo enforcement, immutable
  PDF, mail idempotency, origin checks, unauthorized and cross-organization access.
- Security inventory covers all 179 HTTP handlers; 230 security tests pass.
- 241 quality tests, TypeScript and the isolated production build pass. Full lint
  has zero errors and 24 existing warnings. Required PDF fonts and canvas are
  present in the built function trace.
- All 46 synthetic PDF pages rendered and inspected, including long narratives;
  evidence under `/tmp/hearthos-service-report-qa`.
- Phone and desktop browser checks use synthetic local APIs only. Production
  credentials were not copied to previews or the browser test server.

## Operational Limits and Rollout

Await final frozen checks and protected PR before migration/deployment. Run only
the reviewed additive SQL; never schema push, bulk restore, or tenant migrations.
An internal test recipient was requested. Do not email real customers as a test.
Actual live SMTP receipt remains unverified until an approved recipient is given.
Production sensitive storage credentials cannot be downloaded through Vercel env
pull; a redacted empty local value is not evidence that production is broken.
Verify private storage in the deployed authenticated administrator workflow.

No production report records, customer emails, database migration or deployment
have been performed at the time this record was first written.

## Final Compatibility Audit

Read-only production inspection found all 191 job payloads use JSONB strings.
The new context/photo paths decode both strings and objects, preserving the old
encoding and every original field on a photo append. No bulk conversion occurs.
Tests exercise both encodings, invalid payloads and concurrent appends.

Missing old equipment/job-number/address metadata no longer prevents a PDF;
missing optional metadata is explicitly Not recorded. Finalization uses the
actual calendar-valid service date entered in the report and its service address
and equipment entries, without updating the underlying job or customer.

Pre-migration baseline: `production-baseline-2026-09-10T14-42-53-026Z.json`,
67 tables, digest `0458f8967e1ce1b38349756425c52927b31f3d90c8c09a1b51dda74c1dfe9549`.
