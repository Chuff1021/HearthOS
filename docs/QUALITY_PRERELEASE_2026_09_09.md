# Product Quality Prerelease Gate

## Status

Local work on `codex/product-quality`, following checkpoint `4f4b866` and production
base `19fb50f`. NOT deployed or approved for production. Aaron's live records,
provider accounts, identities and configuration have not been modified.

Fresh read-only Vercel inspection confirmed the canonical site still targets READY
production deployment `dpl_CqYdjua9h4MDEv6uMqitgwfJjpf9`, immutable URL
`https://hearth-hkw8n8nu0-chuff1021s-projects.vercel.app`.

## Customer Creation

- Existing `POST /api/quickbooks/customers` now selects the provider connection
  from the authenticated actor's organization, not cookie/body account selectors.
- Normalized, validated input yields a stable org/company-scoped request identity.
  Existing `audit_logs` stores an append-only reservation before the provider call.
  No schema migration, new default organization, legacy-store fallback, or data import.
- Only the winning durable claim may create. Concurrent calls, restarted processes,
  lost responses, malformed provider results and local save failures do not replay
  the create. A completed request returns its durable local customer identity.
- Customer and completion audit event commit in one transaction. Current QB realm
  is checked under an organization row lock before persistence. Global QB-ID
  conflicts cannot overwrite another organization's customer.
- Explicit reconciliation queries QuickBooks for an exact matching customer and
  persists the confirmed record; it never creates a replacement. Ambiguous or absent
  results remain review-required. This is not automatic recovery from every failure.
- Customer page has an accessible, validated creation dialog. Schedule offers the
  same backend and explicit status checking. Pending/uncertain forms retain exact
  payloads through close/reopen; requests time out and never auto-resubmit.
- Address line 2 is retained. Confirmed new customers enter the existing PostgreSQL
  `customers` table and the list refreshes; no memory-cache-only success.

The provider `requestid` is an additional safeguard, not the durable no-replay
boundary. See [Intuit's request-ID guidance](https://blogs.a.intuit.com/2018/09/10/quickbooks-online-api-best-practices/).
Creation currently supports the existing single-organization production context;
the rest of the application is not thereby certified multi-tenant.

## Provider Wrapper Fixes

Purchase-order operations no longer catch arbitrary failures and submit again.
Invoice POST and PO wrappers persist client-side credential rotation using
organization, realm and previous-refresh-token compare-and-set conditions. Token
storage failure cannot disguise a successful provider write as a failed save.
PO lookup/create/send reuse one request-scoped client and persist final tokens
once. The client retains its single explicit-401 refresh behavior.

These fixes do not provide cross-request idempotency for every invoice/PO/send
workflow. See `QUALITY_RELEASE_RISKS_2026_09_09.md` for limits and baseline risks.

## Payment Safety

- Local payment, invoice balance and export claim commit atomically. Stable
  organization/transaction identities prevent callback duplication and conflicting
  cross-invoice allocation. Unknown exports never automatically replay.
- Durable Square capture intents reserve invoice principal and signed-link limits.
  Pending partial or invoice-less attempts prevent retokenized retries, including
  after a reload. Provider responses and signed webhooks must match actual identity,
  amount, currency, location and intent. No invented success/payment IDs.
- Local allocations cap a stale provider balance; sync cannot reopen already
  collected principal for another charge. Canonical link encodings cannot bypass
  cumulative limits. Document-first lookup preserves existing printed invoice links
  when another invoice has the same numeric QuickBooks ID.
- New QuickBooks payment exports contain a stable internal marker. Import validates
  the original claim, organization, realm, customer, invoice, amount and date, then
  attaches the provider ID to the existing payment and records completion in one
  transaction. Lost responses, concurrent import/completion and restarted processes
  do not create another local allocation. Malformed/conflicting markers require
  review, never fallback insertion. Unmarked historical imports are unchanged.
- Public/tech payment screens distinguish submitted, captured and unknown outcomes,
  bound requests and lock unsafe retries. Manual check entry retains its exact
  request ID across reloads; local UUIDs are distinct from displayed QB IDs. Legacy
  manual API callers omitting a request ID remain compatible, not retry-safe.
- Removed invoice-page automatic balance mutation based on a Square signal. A
  partial payment no longer marks an invoice paid merely by exceeding its remaining
  balance. Confirmed server allocations remain authoritative.

Independent review exercised the actual capture/recording/import modules against
disposable PostgreSQL and synthetic providers. It found no unresolved introduced
finding at the final checkpoint. This is not live provider or authentication
acceptance, a full historical accounting repair, or multi-tenant certification.

## Evidence At Customer/Wrapper Checkpoint

- `npm run test:security`: 222 passing tests, mocked provider I/O.
- `npm run test:quality`: 100 passing tests, synthetic UI/network.
- `node scripts/testing/quality-customer-creation.mjs`: 31 passing tests using
  actual service/store/POST/client and fresh local PostgreSQL with schema-derived
  uniqueness/defaults/FKs. Includes 13-way concurrent submissions, separate-process
  claim persistence, recovery, cross-org collisions, and reconnect during creation.
- `npm run typecheck`, full ESLint, and isolated production build passed. ESLint
  retained 24 baseline warnings; build retained seven legacy filesystem warnings.
- Actual-component browser harness passed six sizes, including the new customer
  dialog, pending/review lock, close/reopen, address line 2 and keyboard dismissal.
  No external provider access; this is not authenticated Next.js acceptance.
- CI now includes quality and disposable customer-persistence suites, uses full
  history for baseline parity, and builds without production credentials. Workflow
  YAML was parsed locally; no remote CI run has been claimed.

## Recovery Rehearsal

Reran the encrypted September 9 archive restore in a disposable socket-only local
PostgreSQL cluster, without tenant migrations. SHA-256:
`9a031097c65005d9662b46fb66028448a4db536cf97943a71f6f26de168cd83d`.
All 64 tables preserved their row fingerprints through read-only verification.
Organization, customer, invoice, payment and legacy-job counts and financial
aggregates were checked without copying business values into repository notes.
The decrypted dump and temporary cluster were removed afterward. This verifies
the snapshot, not newly queried live totals.

## Dependencies

Only `baseline-browser-mapping` changed, 2.10.0 to 2.11.21, in the lockfile.
Production `npm audit --omit=dev` now reports zero vulnerabilities. Full audit
still has 11 tooling findings (5 high, 5 moderate, 1 low); no forced upgrades or
Drizzle downgrade were made. A zero production audit is not a security certificate.

## Still Required Before Promotion

1. Configure an attested isolated runtime database/storage and working Clerk
   credentials, then complete actual owner/technician/Meeks sign-in on the candidate.
   Vercel metadata confirms Clerk variables exist, but secure CLI download did not
   provide usable credential values. This does NOT mean live Clerk is unconfigured.
   Temporary downloads were deleted; no secret was printed or committed.
2. Use isolated QuickBooks/Square/mail credentials for real provider acceptance,
   including the separate hosted-checkout path and fee settlement accounting.
   Never run automated financial tests against Aaron's accounts or customers.
3. Fresh recovery point, signed-in data reconciliation, exact candidate SHA/config
   attestation, explicit rollback target and release approval. Do not promote a
   clone-backed preview to production without separately verifying production config.
4. Complete real sandbox export/import acceptance, including lost-response recovery.
   Newly marked exports are covered by executable local reconciliation tests. Old
   unmarked payments and historical duplicates are not silently merged or deleted;
   historical accounting exceptions need separate evidence and review. Source-realm
   provenance for all legacy org-ID-only sync paths is not certified by this patch.

New card captures retain the existing 3.5% customer fee. The capture intent records
gross, principal and fee; only principal is allocated to the invoice and exported
as its payment. No QuickBooks fee-income account or fee journal is invented. Fee
accounting and settlement reconciliation remain part of provider acceptance.

Browser automation initially timed out, then recovered. Clerk's actual sign-in
page is now open for user handoff. No test instance or auth configuration was
created or changed. See `QUALITY_PREVIEW_PREREQUISITES_2026_09_09.md` for the
environment isolation checklist. The refreshed localhost visual preview remains
synthetic and is not a production candidate.

## Final Local Checkpoint

- TypeScript, ESLint and isolated optimized production build passed. ESLint has
  24 existing warnings; the build has seven existing legacy-file tracing warnings
  and local Node 25 storage warnings. No production credentials were used.
- 533 automated tests passed: 230 security/provider, 170 UI/quality, 9 customer
  query parity, 31 customer persistence, 34 payment recording, 34 capture/webhook,
  and 25 marked payment-import tests. All provider responses were synthetic.
- Six-viewport actual-component browser checks passed with zero console errors.
  Desktop calendar headers and schedule/Meeks dialogs now use opaque surfaces;
  canvas alpha checks verify scrolling appointments cannot bleed through headers.
- Both encrypted-snapshot restore runs preserved all 64 table fingerprints. The
  second also checked numeric invoice-reference collisions without changing data.
- Production dependency audit reports zero vulnerabilities; this is not a full
  security certificate. All worker/reviewer tasks completed without live writes.
- Read-only preview refreshed to `http://127.0.0.1:62988/`, PID `89694`. Clerk
  sign-in is open separately for user handoff. No Vercel preview or production
  deployment, migration, live sync, charge or auth change was performed.

This final checkpoint supersedes the intermediate customer/wrapper counts above
and the historical implementation-status appendix in the release-risk report.
It does not supersede the remaining promotion gates.
