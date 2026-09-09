# Aaron Website Inbox

## Status

Implemented locally on `codex/website-inbox`, based on released CRM main
`8e15cc7`. Not deployed, connected, migrated or populated with production data.
Matching website changes live in `/Users/fireplace/fireplace-webstore-hearthos-inbox`
on `codex/hearthos-inbox-connection`, based on existing customer-inbox source
`3aa2bd38`. Website main is older (`2378cdee`); do not deploy that older main over
the live website. Re-attest the exact website production source before deployment.

## Behavior

- Sidebar Website Inbox, searchable by contact details/subject, status filters,
  pagination and phone-compatible request dialog using the existing CRM shell.
- Contact messages, service requests and order requests are copied from the
  website's private Vercel Blob customer-inbox prefix into separate Neon tables.
- Website checkout currently sends requests, not paid orders. No payment capture,
  invoice creation, inventory reservation, fulfillment or automatic QB write.
- New, Contacted, Follow-up and Closed status; explicit follow-up date and dated,
  authored notes. Stable action IDs and revisions prevent duplicate retries and
  stale overwrites. Original website payload and prior activity are preserved.
- Call/email links open the appropriate handler. Schedule job prefills the
  existing schedule form but does not save a job or invent a customer ID. Existing
  customers must still be selected/confirmed in that form. No auto customer merge.
- Server-only read credential permits a prefix-limited, paginated website export.
  The website's Blob token is not copied into HearthOS. Browser cannot choose the
  source URL or organization. No CORS access or public contact-data endpoint.
- Organization binding is explicit configuration checked against authenticated
  CRM actor. Only office roles can read/update; technicians/read-only are denied.
- Import and cursor checkpoint commit atomically. Source ID uniqueness prevents
  duplicate mirrored records; reimport never overwrites local status/notes.
  Failed/invalid/partial pages stop without advancing. No original blobs deleted.
- Five-minute cron processes one bounded page (10 records) per call. Manual
  Check website processes up to 10 pages. Scans restart after reaching the end to
  reconcile source records. Large backlogs take multiple passes; this is polling,
  not real-time delivery, and is not a five-minute arrival SLA. Before high-volume
  operation, add a durable incremental feed or immediate push plus reconciliation.
- Browser refreshes the mirrored inbox every minute while visible. It does not
  invoke upstream sync from GET or silently write financial/customer data.

## Activation Checklist

1. Fresh database backup and a production-clone rehearsal of only
   `scripts/sql/website-inbox.sql`; compare original table fingerprints.
   This additive script creates three new tables and one index. No DROP, UPDATE,
   DELETE, schema-wide push, dormant tenant migration or production restore.
2. Review current website production source vs the local source before publishing
   the three-file export addition. Preserve forms, checkout and existing storage.
3. Provision a new random, server-only export secret (at least 32 bytes) into
   website `HEARTHOS_INBOX_EXPORT_SECRET` and CRM
   `HEARTHOS_WEBSITE_INBOX_SECRET`. Bind CRM
   `HEARTHOS_WEBSITE_INBOX_ORG_ID` to Aaron's verified existing UUID. Never use a
   client-provided org or expose keys in NEXT_PUBLIC settings, logs or chat.
4. Use isolated Blob and database fixtures for authenticated full HTTP acceptance,
   including wrong secret, foreign org, body deadline, pagination, schema absence,
   CSRF, duplicate import and status persistence. Current tests are local, not a
   real credential acceptance claim. Keep credentials production-only unless
   explicitly isolated test credentials are provisioned.
5. Deploy website export, verify unauthorized requests return 401; deploy CRM
   through its protected PR/checks. Keep both prior deployment IDs for rollback.
6. Initial import and source-ID reconciliation, then owner signs in and verifies
   actual submissions and one approved follow-up. No test messages/orders to live
   public forms without identifying them and obtaining specific consent.
7. Monitor scheduled sync failures/backlog. Failed exports retain the checkpoint;
   a malformed source record requires review, not silent skipping. SMTP mailbox
   ingestion is not included; the scope question is still unanswered.

## Verification

- CRM 230 security tests and 183 quality tests passed, including 13 new contract
  and permission cases. Navigation expectations now include the new sidebar link.
- Ten disposable PostgreSQL tests passed: migration replay twice, repeat import,
  dated notes, idempotent action, revision conflicts, preserved local follow-up,
  foreign-org/source isolation and failed-page checkpoint retention.
- Website export token test passed; both apps typecheck and build without live
  credentials. Existing CRM tracing/local Node warnings and website tracing
  warnings remain. Targeted changed-file lint passed before final visual edits.
- Actual React components with synthetic HTTP passed at 390 and 1440 widths:
  dialog, no horizontal overflow, opaque surface pixel check, follow-up fields,
  and retrying the exact same action payload. No live Clerk/provider acceptance.
  Screenshots: `/tmp/hearthos-website-inbox-qa/`.

Original production CRM data, website blobs, DNS, domains, credentials, deployment
aliases and payment settings were not changed during implementation.
