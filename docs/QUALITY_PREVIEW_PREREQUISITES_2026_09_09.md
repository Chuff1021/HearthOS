# Authenticated Quality Candidate Prerequisites

September 9, 2026. READ-ONLY sidecar evidence and handoff, not deployment approval.

## Decision

An authenticated, isolated application candidate is NOT yet evidenced. The next
step is coordinator-owned environment/identity provisioning and exact-build
attestation, followed by real Clerk sign-in on that candidate's own origin.
`scripts/quality-preview.mjs` is explicitly a synthetic UI harness, not this step.
No existing script inspected here provisions a persistent, authenticated clone.

This inspection ran local Git/source/document reads and file metadata checks only.
No secret values, dotenv contents, archive contents, or backup metadata contents
were read. No provider commands, network verification, restore, migrations,
deployment, database queries, or application/browser execution occurred. Only this
report was written. Customer-creation implementation and acceptance belong to the
main agent and are not duplicated here.

## Code and Production Evidence

| Evidence | Finding and limit |
| --- | --- |
| Local quality branch | `codex/product-quality`, inspected HEAD `4f4b8669114d750594b749cdd493efb0d1188bb7`; initially clean. Later main-agent changes require a new candidate SHA. |
| Local cached `origin/main` | `19fb50f84ac1fafe2884c2a7764f6eb0f00d91ae`; no fetch or remote lookup performed. |
| Latest recorded production | September 9 launch execution records that same `19fb50f...`, READY deployment `dpl_CqYdjua9h4MDEv6uMqitgwfJjpf9`, canonical `https://hearth-os.vercel.app/`. This is historical local evidence, not a fresh live attestation. |
| Production project | Swarm execution records `prj_8V7U87V5ffehDKkeiYvl5XXMZqGl`. This identifies the protected production boundary, not an approved isolated candidate project. |
| Hotfix deployment URL | Recorded `https://hearth-hkw8n8nu0-chuff1021s-projects.vercel.app`; do not use it as an isolated test target. |
| Source compatibility | Local `git diff --quiet` returned 0 for `src/db`, `src/lib/security`, `src/proxy.ts`, `src/lib/meeks-auth.ts`, `vercel.json`, `package.json`, and `package-lock.json` between the recorded production SHA and inspected quality HEAD. This does not prove authenticated runtime compatibility. |
| Workspace configuration | Eight standard dotenv paths and `.vercel/project.json` were absent at inspection. No configured candidate environment/project is established by this worktree. |

The September 8 release report records the failed `5ee9990` rollout and rollback
to `4bd8ab6`; that report is superseded for production lineage by the September 9
evidence. The later hotfix report names `dpl_3SMVUmQwGGzE5DXUYaLR4fzkqDAz` as its
previous rollback target. Neither historical rollback ID should be selected for
a new release without fresh compatibility and deployment verification.

At the closing status check, concurrent main-agent customer-creation changes were
present. They were not inspected or modified by this sidecar. The equality result
above applies to committed HEAD only, not those uncommitted changes or a future build.

Sources: `/Users/fireplace/HearthOS-dealer-readiness/docs/LAUNCH_EXECUTION_2026_09_09.md`
(Production and Recovery Evidence, Preview Configuration Caveat),
`/Users/fireplace/HearthOS-dealer-readiness/docs/SWARM_EXECUTION.md`
(Production Boundary Verified),
`/Users/fireplace/HearthOS-dealer-readiness/docs/LOPI_BIDS_PRODUCTION_TEST.md:9`,
and `/Users/fireplace/HearthOS-estimate-hotfix/docs/PRODUCTION_RELEASE_2026-09-08.md`.

## Recovery Artifacts

These are recorded verification results, not a new restore or checksum verification.
All archive filenames below are under `/Users/fireplace/HearthOS-secure-backups/`.

| Archive filename | Recorded SHA-256 | Recorded verification |
| --- | --- | --- |
| `hearthos-production-2026-09-09T12-56-41-861Z.dump.enc` | `9a031097c65005d9662b46fb66028448a4db536cf97943a71f6f26de168cd83d` | Latest: 380-entry listing; final full restored suite 199 tests, all 64 original tables preserved; all 14 candidates 0030-0043 replayed twice separately. |
| `hearthos-production-2026-09-08T15-47-25-745Z.dump.enc` | `ba6d4c1a229b8f9d3d69027bcb2d192fcc2bca62e6191b1ba26e886997255038` | Earlier readiness/swarm restored suites preserved 64 original tables. Superseded by September 9 evidence. |
| `hearthos-production-2026-09-08T15-16-37-863Z.dump.enc` | `801ee8afbde8206f0ae7df411966e5dbf0b3d63eac1203d83af5fb9af96663c1` | Release recovery: restored successfully, 380 archive entries, financial aggregates matched that snapshot. |
| `hearthos-production-2026-09-08T14-33-31-197Z.dump.enc` | `61154e22964e2f0d70709512cb9690a5018aa01aa37b90384d5d1019b8dda4b5` | Stabilization: temporary loopback restore; aggregate inventory readable. |

The latest encrypted archive and its `.dump.enc.json` sidecar exist locally, both
mode `0600`; the archive is 24,414,752 bytes. Only filesystem metadata was checked.
Its JSON sidecar's recorded source-worktree commit is not deployment lineage.
The expected digest above comes from the prior report, not a secret-bearing file.

Prior reports recorded organization, customer, invoice, payment and legacy-job
counts and financial aggregates. Business values are intentionally not copied
here. Do not treat live counts as immutable snapshot assertions or earlier totals
as newly verified values. Establish the candidate's aggregate baseline from its
exact approved snapshot. Never change production to match an older archive.

The original-column preservation check allows an added entirely-null
`organizations.clerk_organization_id` column; it does not permit original values
to change. The 33 recorded inline `data:image` references are database-covered,
not proof of original camera files, R2 objects, receipts, or Meeks attachment
recovery. Candidate media acceptance still needs separately authorized bytes.

Sources: launch execution above; readiness `docs/DEALER_READINESS.md:54`;
hotfix `docs/STABILIZATION_CHECKPOINT_2026-09-08.md` and production release report.

## What the Existing Scripts Actually Do

| Script in prior worktrees | Applicability |
| --- | --- |
| Hotfix `scripts/verify-recovery.mjs` | Decrypts via Keychain, starts trust-auth loopback PostgreSQL on 55439, restores and reads aggregates, then removes the cluster. No archive checksum check in this script; inherits environment. Do not run in this lane or use as an authenticated app launcher. |
| Readiness `scripts/testing/environment-safety.mjs` | Refuses eight standard dotenv files, reports filenames only, never deletes configuration. Useful local prerequisite check. Not a complete secret or isolation audit. |
| Readiness `scripts/testing/local-postgres.mjs` | Sanitized child environment, private temporary directory, random SCRAM password, Unix socket only, no TCP listener. Checks archive digest against sidecar before Keychain decryption. Always tears down the cluster. Preferred rehearsal design, not a Vercel-reachable persistent database. |
| Readiness `scripts/test-database.mjs --restore` / `npm run test:recovery` | Restores, runs fixture/candidate tests, fingerprints original values, cleans up. Reads secrets internally and writes a disposable database. PROHIBITED in this sidecar; not authenticated UI acceptance. |
| Readiness `scripts/test-migrations.mjs` | Executes every discovered candidate SQL twice, including without `--restore`. PROHIBITED here. Do not transfer all dealer candidates into this bounded quality release. |
| Readiness `scripts/test-isolated-build.mjs` | Credential-free Next build with temporary local data. Removes auth credentials; cannot demonstrate real sign-in. |
| Quality `scripts/quality-build.mjs` | Sanitized Next build with unreachable loopback DB. Not the build configuration for authenticated acceptance. |
| Quality `scripts/quality-preview.mjs` | Detached synthetic React/UI server, fake identity/HTTP, unsupported routes and failed mutations. Explicitly excluded as evidence for the requested candidate. |

Local `initdb`, `pg_ctl`, `pg_restore`, and OpenSSL executables exist at the scripts'
default `/usr/local/bin` paths. Version compatibility, Keychain access, database
ownership and approved persistent infrastructure were not checked. Never print a
Keychain passphrase or run secret retrieval directly in a shell/report.

## Prerequisites Before Candidate Startup or Navigation

1. **Pin the release slice.** Coordinator supplies the final reviewed commit after
   current main-agent work, its migration manifest (explicitly none if none), and
   expected production base. At inspected HEAD, no DB/schema changes were present.
   Do not merge the dealer-readiness foundation wholesale.
2. **Identify the isolated target.** Supply approved Vercel team/project ID,
   Preview environment and immutable deployment URL/ID. No production alias,
   production-target staging build, or demo target. Pin build SHA and configuration
   revision together; ensure no push/automation can promote it accidentally.
3. **Provision a persistent isolated database under separate authorization.** A
   recovery operator owns encrypted archive validation and any future restore.
   Supply private endpoint/database/role identity and an attestation that it cannot
   reach or write production. Vercel cannot access the existing local Unix socket.
   Use least-privilege application credentials, not restoration credentials. A
   read-only role for initial data checks must have any resulting denied background
   writes reported honestly. Do not activate dormant RLS/migrations merely to run
   this legacy quality candidate. New dealer runtime/control-plane work is separate.
4. **Quarantine restored integration authority before boot.** A database clone can
   retain production OAuth tokens, account IDs, settings and customer destinations.
   Separate env names alone do not make it safe. With separate approval, prepare an
   isolated acceptance copy with no usable production provider authority, preserve
   the pristine baseline, and record any intentional configuration-only differences.
   Block production DB/provider/storage/mail destinations independently of flags;
   permit only reviewed identity/test endpoints. No reconnect, reimport or sync.
5. **Private storage and background effects.** Require an independently scoped
   bucket/namespace and credentials; no access to production objects. Isolate any
   `HEARTHOS_DATA_DIR` and legacy filesystem stores; do not copy credential caches
   or silently fall back to empty/demo data. Disable scheduled cleanup, QB sync,
   reminders, workers, webhooks and outbound mail/SMS/payment delivery. `vercel.json`
   contains real cron paths; verify nonactivation rather than assuming Preview means
   every writer is off. Prior estimate-page navigation invoked a learning endpoint.
6. **Real Clerk identity.** Securely configure matching candidate
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`, candidate-origin login
   redirects and actual approved users. No copied browser cookies, session token
   output, synthetic actors, auth bypasses, or missing-auth fallbacks. Prefer isolated
   test auth infrastructure; use of existing identity infrastructure requires explicit
   owner approval. Map approved verified emails to existing cloned employee identities
   and roles. Have the coordinator securely supply any required
   `HEARTHOS_EMPLOYEE_LOGIN_ALIASES`, without reading or reporting its value here.
7. **Vercel protection is not app auth.** An authorized reviewer must first pass
   deployment protection using the normal approved Vercel access flow, then sign in
   to Clerk on the candidate origin. No protection-bypass token in commands/logs.
   A production-origin session does not establish candidate-origin authentication.

Earlier swarm metadata said DB/provider settings were Production-only; later launch
execution says Preview DB/storage settings exist. The latter supersedes absence,
but neither establishes isolation. Sensitive write-only values downloading empty
are unknown, not absent or safely isolated. Do not `vercel env pull`, copy production
dotenv files, or infer scope from differing bucket names.

## Exact Safe Next Commands

These commands are LOCAL READ-ONLY checks; they do not start an app, fetch remotes,
read secret values, restore, install dependencies, or execute candidate migrations.
Run each from the stated worktree. The report may be the only expected local diff;
preserve any concurrent main-agent edits and stop rather than resetting them.

```sh
cd /Users/fireplace/HearthOS-product-quality
git status --short --branch
git rev-parse HEAD refs/remotes/origin/main
git merge-base --is-ancestor 19fb50f84ac1fafe2884c2a7764f6eb0f00d91ae HEAD
git diff --name-only 19fb50f84ac1fafe2884c2a7764f6eb0f00d91ae HEAD
git diff --quiet 19fb50f84ac1fafe2884c2a7764f6eb0f00d91ae HEAD -- src/db src/lib/security src/proxy.ts src/lib/meeks-auth.ts vercel.json package.json package-lock.json
node --input-type=module -e 'import { assertIsolatedWorkspace } from "/Users/fireplace/HearthOS-dealer-readiness/scripts/testing/environment-safety.mjs"; await assertIsolatedWorkspace(process.cwd()); console.log("Standard dotenv paths absent");'
```

Exit 0 for `merge-base` establishes local ancestry; exit 0 for `diff --quiet`
establishes equality only for its listed paths. Nonzero is a review gate, not
permission to overwrite changes. Neither compares uncommitted edits to a deployable
build. The coordinator must pin those changes in the final reviewed commit.

Optional recovery-operator check of encrypted bytes only, no decryption/restore:

```sh
shasum -a 256 /Users/fireplace/HearthOS-secure-backups/hearthos-production-2026-09-09T12-56-41-861Z.dump.enc
```

Require the exact September 9 digest above; stop on mismatch. This command was NOT
executed by the sidecar. A matching encrypted checksum alone is not a new restore
verification or a current recovery point.

### Separately Authorized Metadata Checks

The following contact GitHub/Vercel. NOT executed, and NOT permitted under the
current no-provider-command instruction. They are a handoff for a later explicitly
authorized read-only verification session using an existing approved CLI session:

```sh
cd /Users/fireplace/HearthOS-estimate-hotfix
git ls-remote origin refs/heads/main
vercel inspect https://hearth-os.vercel.app/
```

For candidate inspection, the exact URL and team slug are missing prerequisites.
Only after supplying verified non-secret values in that separate session:

```sh
vercel inspect "$CANDIDATE_URL" --scope "$VERCEL_TEAM_SLUG"
```

Record only deployment/project IDs, state, environment, immutable URL and source
SHA. If CLI inspection does not expose Git lineage, have the owner verify deployment
metadata in Vercel; never infer SHA from a hostname or build success. No `--logs`,
environment download or raw credential diagnostics. No deploy/promote/alias/rollback
commands are provided. A persistent-clone/bootstrap command cannot honestly be
specified until the target, credentials, controls and authorization above exist.

## Authenticated Acceptance Workflow

Run later only on the attested isolated candidate, not production. No provider
business actions are included in the initial auth/read acceptance phase.

1. Verify the exact candidate deployment and environment evidence before opening
   business pages. Check signed-out `/api/access` denies access. 401 is expected
   with configured auth; 503 is a configuration/dependency failure, not auth success.
   Vercel's protection page is not an application response.
2. Reviewer completes fresh Clerk login on the candidate origin. Request
   `/api/access` in that authenticated browser. Require 200 JSON with the expected
   existing employee and role; privately compare identity, retain only pass/fail,
   role and non-PII failure classification in shared evidence. Response is private,
   no-store. Do not export cookies, tokens, full HARs or private response bodies.
3. On 403/503, record `EMAIL_NOT_VERIFIED`, `MEMBERSHIP_NOT_FOUND`,
   `ROLE_NOT_SUPPORTED`, `PERMISSION_DENIED`, `AUTH_NOT_CONFIGURED`, or
   `ACCESS_CHECK_FAILED` as applicable. Stop; do not reseed staff, grant owner from
   metadata, reconnect QB, or interpret denied requests as an empty business.
4. For the approved owner, verify dashboard/customer/job/dispatch reads and compare
   counts and financial definitions to the exact clone baseline. Actual operational
   jobs are in `hearth_jobs_store`; an empty normalized `jobs` table does not prove
   missing production jobs. Verify Projects and other required local records without
   invoking sync, sends or provider-backed fallback reads.
5. Repeat with independently approved technician and Meeks identities. Verify
   technician assignment boundaries and forbidden financial/admin access. Meeks uses
   its separate verified-email partner/internal guard; partner-only access need not
   pass the internal CRM `/api/access` membership gate. Test its portal/API behavior
   separately without broadening internal permissions.
6. Exercise real Next navigation/API/session expiry/sign-out, map assets and phone
   layouts (390x844, 430x932, 1440x1000, 1600x1100; retain quality's smaller sizes).
   Record exact SHA/URL/config revision, role, status, viewport and outcomes. Protect
   screenshots containing cloned customer data. Synthetic screenshots cannot replace
   this evidence. Refresh/restart persistence checks need separately authorized
   clone-only mutations; customer creation is reserved to the main agent.
7. Keep sandbox OAuth, payment, email, media upload and full business mutations as
   separately authorized later acceptance. The hotfix report explicitly said no
   Intuit sandbox was available then; no current sandbox is evidenced here. Prior
   permission for one live estimate is not reusable authority for any new test.

Auth evidence: hotfix `.kilocode/rules/memory-bank/context.md:5` records the
diagnostic `MEMBERSHIP_NOT_FOUND` and explicit alias fix. Quality
`src/lib/security/crm-access.ts:14`, `src/app/api/access/route.ts:3`,
`src/proxy.ts`, and `src/lib/meeks-auth.ts` implement the boundaries above.
Readiness `docs/LOPI_BIDS_PRODUCTION_TEST.md:9` explicitly records that staged
authenticated acceptance was not completed because a separate Clerk login was
required; its line 30 records navigation's learning-endpoint side effect.

## Blocking Handoff Items

- Final candidate commit after the main-agent change, reviewed schema/config delta,
  and fresh authorized production/deployment lineage check.
- Approved isolated Vercel project/environment and immutable candidate URL; no such
  authenticated candidate is established by the inspected docs/worktree.
- Coordinator-owned persistent clone, checksum/restore attestation, exact snapshot
  baseline, data custody and proven separation from production credentials/network.
- Private storage and legacy data-store plan, background-writer containment and
  restored-provider-authority quarantine before any app boot or navigation.
- Approved Clerk instance/origin configuration, secure existing-employee alias
  mapping, and humans able to sign in separately as owner, technician and Meeks.
- Real sandbox accounts/consent for later provider acceptance; media-byte recovery
  and restricted tenant/control-plane readiness remain separate unproven gates.

No restore, migration, deploy, customer/provider action, production configuration
change or promotion is authorized by this report. Completion means an actual
authenticated isolated candidate passes the evidence matrix, not that a harness
starts or a signed-out request returns 401.
