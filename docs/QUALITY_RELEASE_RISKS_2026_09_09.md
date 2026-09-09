# Quality Release Risks: September 9, 2026

## Decision and Scope

**Do not approve an unrestricted financial/provider release from this evidence.** The existing security suite passes, but purchase-order replay is reproducible and payment allocation/recovery has concrete gaps. The production dependency audit also fails the checked-in CI gate. These are baseline risks found in the candidate, not evidence that the visual quality changes introduced them.

Reviewed worktree: `/Users/fireplace/HearthOS-product-quality`; HEAD `4f4b8669114d750594b749cdd493efb0d1188bb7`. References below are repository-relative `file:line` anchors at review time. P1 means resolve before releasing/enabling the affected financial workflow; P2 means bounded follow-up or explicit, scoped risk acceptance. The audit gate is distinguished from remotely exploitable application vulnerabilities.

Only this document was written. No package installation, upgrade, lockfile change, customer-creation implementation, environment-file/content inspection, real database access, live provider request, email transmission, migration, or deployment was performed. Customer creation remains coordinator-owned. Provider configuration/readiness mentioned in older documents was not rechecked. This report is not security certification or multi-tenant launch approval.

Concurrent coordinator changes appeared during final verification, including customer creation and its client request-ID support. They were left untouched and are not covered by this sign-off. The observed shared-client diff was confined to `createCustomer`; the cited financial retry/token lines remained unchanged. Package manifest and lockfile still had no diff.

## Verification Performed

| Check | Observed result |
| --- | --- |
| `npm audit --json --ignore-scripts --no-fund --logs-max=0 --update-notifier=false` | Exit 1: 12 package findings; 5 high, 6 moderate, 1 low, 0 critical. Registry audit only. |
| Same audit with `--omit=dev` | Exit 1: one moderate finding, `baseline-browser-mapping@2.10.0`. No high/critical production findings in this audit. |
| `env -i PATH=/usr/local/bin:/usr/bin:/bin TSX_DISABLE_CACHE=1 /usr/local/bin/node --import tsx --test tests/security/*.test.ts` | 37 passed, 0 failed/skipped. Reviewed fixtures use in-memory bundles, mocked storage/provider fetch, schema-only SQL rendering, or stream-only mail. No inherited credentials or dotenv loading. |
| Additional in-memory PO route fixture | Real POST handler, all imported business dependencies mocked, esbuild `write:false`. First create throws a synthetic lost-response error; second returns a fixture PO. Result: **201, two create calls, one refresh, one token write**. No persisted test file and no provider request. |
| Static route inventory within the suite | 167 handlers inventoried. This is not 167 runtime authorization or acceptance tests. |

No full build, lint, browser/provider acceptance, real database concurrency test, or remote CI run was performed in this sidecar. Earlier quality/clone/browser results in `docs/PRODUCT_QUALITY_EXECUTION_2026_09_09.md:64` are historical evidence, not reruns here.

## Prioritized Findings

### P1-1: Purchase-order failures can replay a committed create or send

**Evidence:** `src/app/api/quickbooks/purchase-orders/route.ts:31` catches every operation failure, refreshes credentials, writes them using only organization ID at line 42, and invokes the operation again at line 44. Write callers include send at line 290, create-from-estimate at line 331, direct create at line 380, and subsequent sends at lines 339/388. The shared client already refreshes once on explicit HTTP 401 at `src/lib/quickbooks/client.ts:137`.

**Consequence:** A dropped response after provider acceptance is treated as permission to submit another PO or send again. Validation errors, rate limits, and provider 5xx responses also enter the outer refresh path. The extra wrapper can layer retries over the client's own retry. The offline reproduction above confirms two calls and a success response after the first call throws; it does not claim an actual duplicate was created at QuickBooks.

**Minimal safe fix:** Follow `src/app/api/quickbooks/estimates/route.ts:298`: execute the operation once, let the client handle only explicit 401, and persist changed tokens in `finally` with organization/realm/previous-refresh-token predicates. Preserve an uncertain outcome instead of retrying a write. A later request from the browser also needs a durable operation ID/reconciliation path; removing the catch-all alone does not provide cross-request idempotency.

**Missing tests / exit condition:** Add checked-in offline PO create/from-estimate/send tests for lost responses, 400/429/500, 401-success, repeated 401, refresh failure, storage failure, and connection replacement. Assert operation count, refresh count, credential predicates, and that successful writes are not reported as failed solely because token persistence failed. Existing estimate tests are a pattern, not coverage of PO handlers.

### P1-2: Payment deduplication and QuickBooks recovery are not atomic or durable

**Evidence:** `src/lib/invoices/record-payment.ts:110` checks for an existing transaction, calls QuickBooks at line 122, then inserts a payment at line 136 and separately updates invoice balance at line 158. `src/db/schema.ts:368` defines no uniqueness constraint for the Square transaction ID; the index at line 383 only covers `(qbPaymentId, invoiceId)`. Both capture (`src/app/api/square/payments/route.ts:115`) and webhook (`src/app/api/square/webhook/route.ts:81`) invoke this function.

**Consequence:** Concurrent capture/webhook delivery can both see no prior payment, both export a QuickBooks payment, and both insert local rows. Different or absent QB IDs do not make the existing index a Square-event deduplication boundary. Separate read/sum/update operations can also write a stale balance. If QB fails, the local row is inserted with a failure note at lines 131/144; subsequent delivery finds the row and skips the QB export. Conversely, QB success followed by local insert failure leaves no local deduplication record for a later retry.

**Minimal safe fix:** This cannot be repaired safely with only another preflight SELECT or an index added after the provider call. Establish an organization/provider/payment identity and atomic claim before external export; transactionally allocate local payment and balance changes; store QB export/reconciliation state durably. Retry an uncertain provider write only through a provider-supported stable request identity or reconciliation. Review historical duplicate/null transaction data before proposing a migration. Until that work is accepted, do not treat automated capture/webhook accounting as release-ready.

**Missing tests / exit condition:** Concurrent duplicate capture/webhook, out-of-order delivery, repeated event after process restart, two distinct payments racing on one invoice, lost QB response, QB success/local-write failure, local success/QB failure, and retry of a pending export. Require one allocation and one reconciled QB payment per identity. No checked-in security test executes this recorder, and no concurrency test was run here.

### P1-3: Public capture checks a per-request link cap, not remaining payable balance

**Evidence:** `src/app/api/square/payments/route.ts:41` verifies the signed document link and at line 45 only compares this request to `maxCents`. The key at line 58 depends on location plus card/source token, not a durable invoice payment intent. There is no invoice/balance lookup before the capture at line 71; invoice lookup happens later in `src/lib/invoices/record-payment.ts:97`. The success path defaults absent status to `COMPLETED` at line 95, invents a missing payment ID for the local store at line 98, and records the request amount rather than validated returned cents at line 117.

**Consequence:** A still-valid link can submit another payment with a newly tokenized source even when an earlier payment used up the authorized balance. A missing invoice is discovered only after attempting capture. A malformed successful provider response could be treated as a completed local payment without a real transaction identity. The response-default issue is a static failure-case finding, not an observed provider response.

**Minimal safe fix:** Resolve the canonical invoice and remaining authorized amount server-side before capture, reserve a bounded payment intent atomically, and retain its identity across retries/re-tokenization. Validate explicit provider ID, expected amount/currency/account, and final status before allocating funds. Distinguish captured-but-unreconciled from safe-to-retry failure; never fabricate provider success. A simple balance read alone is insufficient under concurrency.

**Missing tests / exit condition:** Paid/missing invoice, reduced balance after link issuance, two concurrent intents, same-source retry, fresh-source resubmission, amount/currency mismatch, missing ID/status, pending/failed status, and capture-success/local-record-failure. `tests/security/public-links.test.ts:5` proves signing/expiry/tamper resistance, not any of these route-level behaviors.

### P1-4: Successful automatic QB refresh is not consistently persisted

**Evidence:** The client replaces only its in-memory tokens at `src/lib/quickbooks/client.ts:105`, and performs its internal refresh at line 137. Invoice POST creates short-lived clients at `src/app/api/quickbooks/invoices/route.ts:305`, line 320, and line 455, without reading back/persisting rotated credentials. `src/lib/quickbooks/sync.ts:1056` creates the invoice and updates an in-memory cache, not organization credentials. The payment helper persists tokens only in its extra error-message-based retry branch (`src/lib/invoices/record-payment.ts:64`), not after the client's successful internal refresh. PO has the same successful-internal-refresh gap because persistence is only inside its outer catch.

**Consequence:** A 401-refresh-success request can return successfully while durable credentials remain stale. Later operations can fail when the old refresh token is no longer usable. Payment's string matching on `AuthenticationFailed`, `Token expired`, or `401` also allows an extra refresh/replay after the shared client has exhausted its retry. PO/payment credential writes use organization-only predicates, unlike the estimate route's connection guards.

**Minimal safe fix:** Use the estimate route's bounded `finally` persistence pattern at these ownership boundaries; preserve a successful provider outcome if persistence fails and expose a reconciliation/connection warning. Use structured HTTP status for retry decisions, not substrings. Avoid overlapping refreshes against a replaced account/token. Do not change customer creation in this sidecar.

**Missing tests / exit condition:** For invoice and payment routes, assert 401-success persists rotated tokens, repeated 401 stops after one refresh, subsequent requests use durable credentials, and a concurrent reconnect/disconnect cannot be overwritten. Estimate fixture cases at `tests/security/estimate-retry.test.ts:90` and line 119 cover only estimates.

### P1-5: Current production audit fails the checked-in release check

**Evidence:** `package-lock.json:4281` pins `baseline-browser-mapping@2.10.0`; Next lists it as a production dependency at `package-lock.json:7859`. Today's `--omit=dev` audit reports [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv), moderate process termination on invalid input, affecting `>=2.0.0 <2.11.0`. `.github/workflows/crm-stabilization.yml:25` runs `npm audit --omit=dev` without a relaxed threshold, so the observed exit 1 is incompatible with that step passing if reached.

**Minimal safe fix:** Separately review a targeted compatible lockfile update outside the reported affected range (2.11.0 or later), rerun both audits, and run the build/typecheck/security/UI checks. No update was attempted here. Alternatively, a release owner would need an explicit time-bounded exception with documented reachability and a reviewed CI policy change; silently ignoring audit exit status is not acceptance.

**Qualification:** Production inclusion does not prove that attacker-controlled HTTP input reaches this function. No application route importing this dependency was identified; the installed Next compiled Browserslist bundle references it. Runtime input reachability was not established. The older zero-production-findings statement at `docs/STABILIZATION_CHECKPOINT_2026-09-08.md:20` and line 42 is historical, not current evidence.

### P2-1: Estimate agreement submission is replayable and partially committed

**Evidence:** `src/app/api/estimates/accept/route.ts:132` coerces `agreed` with `Boolean`, so the string `"false"` satisfies it. At line 158 the route marks an estimate accepted and appends notes, then separately updates the customer at line 166. There is no already-accepted/version check or atomic agreement transaction. A repeated valid link can append another acceptance, and a customer-write failure can return 500 after the estimate has already changed.

**Minimal safe fix:** Require literal boolean consent, bind acceptance to the reviewed estimate revision, and atomically create a single acceptance record/state transition with consistent customer-note behavior. A repeated submission for that acceptance should return the prior result. Treat this as a blocker before claiming customer agreement workflow acceptance, though it is separate from PO/payment release safety.

**Missing tests:** Route-level denial before data access, wrong/expired token, false/string consent, stale estimate revision, duplicate/concurrent submit, and second-write failure. The signed-link helper test does not execute acceptance GET/POST.

## Dependency Baseline and Disposition

The 12 audit findings are affected package entries, not 12 independent remotely exploitable vulnerabilities. In particular, four moderate entries describe one inherited esbuild advisory chain. All entries below except `baseline-browser-mapping` are marked `dev: true` in the root lockfile. Service-specific lockfiles and a deployed/bundled artifact were not independently audited.

| Finding / locked version | Evidence and dependency path | Safe follow-up, not performed |
| --- | --- | --- |
| High: `brace-expansion` 1.1.12 and 5.0.4 | `package-lock.json:4310`, line 3602; minimatch and TypeScript-ESLint tooling. Audit reports resource exhaustion/expansion DoS. | Resolve each major branch outside its affected range; current audit thresholds include 1.1.18 and 5.0.9. Do not force a cross-major override without compatibility tests. |
| High: `browserslist` 4.28.1 | `package-lock.json:4352`; Babel compilation targets via ESLint React hooks. Unbounded query-cache growth and untrusted custom-stats handling. | Compatible version outside `<=4.28.6`; review lint/build inputs. This is the standalone lockfile package, not proof that Next's vendored copy is patched or affected. |
| High: `flatted` 3.3.4 | `package-lock.json:6293`; ESLint flat-cache. Recursive parse DoS/prototype pollution. | Compatible version outside `<=3.4.1`; test cache parsing and lint. |
| High: `js-yaml` 4.1.1 | `package-lock.json:7243`; `@eslint/eslintrc`. Several CPU exhaustion advisories. | Current reported affected range ends at 4.3.1; test compatible 4.3.2+ resolution and lint/config loading. |
| High: nested `picomatch` 4.0.3 | `package-lock.json:9542`; tinyglobby. ReDoS/method injection. | Target affected nested copy with compatible 4.0.4+; the separate 2.3.2 copy is not this finding. |
| Moderate: `baseline-browser-mapping` 2.10.0 | `package-lock.json:4281`; Next production graph and dev Browserslist graph. | P1-5 above: currently fails production audit gate. |
| Moderate: `@humanfs/node` 0.16.7 | `package-lock.json:1777`; ESLint. Recursive copy can follow symlinks outside source. | Compatible 0.16.8+ per audit range; validate actual tooling use of recursive copy. |
| Moderate, four package entries: `drizzle-kit` 0.31.9 -> `@esbuild-kit/esm-loader` 2.6.5 -> `@esbuild-kit/core-utils` 3.3.2 -> nested `esbuild` 0.18.20 | `package-lock.json:4799`, line 1169, line 745, line 1131. [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), development-server cross-origin request/read exposure. | Do not run exposed vulnerable tooling servers. Audit suggests **drizzle-kit 0.18.1, a semver-major downgrade**, not a validated safe upgrade. Review replacement/transitive compatibility in a separate tooling change. Root esbuild 0.28.2 and drizzle-kit nested esbuild 0.25.12 do not remove the affected 0.18.20 copy. No `audit fix --force`. |
| Low: `@babel/core` 7.29.0 | `package-lock.json:394`; ESLint React hooks. Source-map-comment arbitrary file read. | Compatible version outside `<=7.29.0`; assess untrusted source/build input and run tooling tests. |

**Disposition:** The five high findings are tooling exposure requiring a separate patch/reachability review, not proof of five internet-reachable production endpoints. They block a clean full-audit/security-readiness claim; they are not automatically five independent blockers to a narrowly approved UI-only release. `fixAvailable: true` is registry guidance, not compatibility evidence. No executable exploit was run. CI currently omits dev advisories, so a green production audit would not resolve this table.

## Existing Tests Versus Missing Acceptance

| Surface | Existing, rerun evidence | Missing release evidence |
| --- | --- | --- |
| Auth/roles | 13 policy tests in `tests/security/access-policy.test.ts:7`; 7 mocked runtime tests in `tests/security/runtime-guards.test.ts:59`; 2 login-alias tests in `tests/security/employee-login-aliases.test.ts:8`. Real guard/jobs behavior is exercised with fixture identity/storage. | Authenticated Next.js sessions across actual staff roles; full financial route denial-before-I/O; account switching/revocation; cross-organization provider mapping. Not a full tenant-isolation suite. |
| Handler boundaries | One AST inventory at `tests/security/guard-inventory.test.ts:21`, 167 handlers. Dedicated-boundary routes only get source-string checks at line 35. | Runtime Square signatures, signed-link route checks and Chatwoot boundary behavior. A function name's presence does not establish correct ordering or rejection. |
| QB estimates | 10 tests at `tests/security/estimate-retry.test.ts:72`; actual route/client with mocked fetch, auth, storage, SMTP/PDF. No retry on lost/400/429/500; lost send; one 401 refresh; failed/repeated 401 retry; guarded token storage failures. | Update/delete paths, fresh request after uncertain write, concurrent operations, refresh endpoint failure/malformed success, local estimate import failure reporting, real sandbox mapping and persistence/reconciliation. SMTP branch is deliberately disabled by the fixture at line 38. |
| QB invoice/PO/payment | Shared client is indirectly exercised through estimate tests; extra offline PO reproduction in this audit proves a failure, not acceptance. | Checked-in route tests for P1-1/P1-2/P1-4, actual request bodies/IDs/amounts, invoice cache vs durable persistence after restart, and authorized sandbox acceptance. |
| Signed payment/estimate links | One crypto-helper test at `tests/security/public-links.test.ts:5`: purpose/document binding, expiry, tampering, malformed input, fail-closed missing secret. | Actual GET/POST boundaries, amounts/balance, stale revisions, replay, concurrency, cache/privacy headers, and agreement persistence. |
| Square capture/checkout/webhook | No runtime suite found for these handlers or `recordInvoicePayment`. Static checks only. | Invalid/missing signature and config must cause zero writes; signature bound to raw body/exact URL; duplicate/out-of-order events; captured-but-unrecorded recovery; refunds; durable allocation; checkout order-to-invoice mapping and retry identity. |
| QB OAuth | Source has state comparison at `src/app/api/quickbooks/callback/route.ts:16`, token exchange at line 38, organization write at line 45. | No checked-in callback runtime test found: wrong/missing state, failure before mutation, correct account binding, credential-write failure, replay, disconnect/refresh races. No OAuth flow exercised. |
| Mail | One stream-only render test at `tests/security/mail-compatibility.test.ts:5` with a synthetic `%PDF-test` attachment. | Actual PDF rendering, recipient selection, SMTP/provider errors, duplicate-send prevention, and delivery outcomes. It neither sends mail nor proves a valid invoice PDF. |
| Other security regression | One schema-only customer-search SQL test at `tests/security/customer-search.test.ts:10`; one synthetic service-worker cache test at `tests/security/mobile-cache.test.ts:6`. | Provider mutation/acceptance coverage cannot be inferred from search/cache/UI test results. |

Additional checkout/webhook concerns to include in acceptance: checkout generates a new idempotency key on each request (`src/app/api/square/checkout/route.ts:40`) and keeps order/invoice association in the JSON payment store at line 88. The webhook obtains `invoiceNumber` only from incoming `payment.reference_id` (`src/app/api/square/webhook/route.ts:52`), not the existing order record after its upsert. Test an order-linked event with no reference ID; current control flow skips invoice recording even if the stored order knew the invoice. The store performs bounded read-modify-write of 1,000 rows without event ordering checks (`src/lib/square-payment-store.ts:24`, line 35); it is not a durable event inbox. A payload containing only a refund object is ignored at webhook line 44. These are code-derived cases to prove/fix, not verified claims about current provider configuration or delivery payloads.

## Release Exit Criteria

1. For any release enabling or relying on these financial paths: resolve P1-1 through P1-4, check in the missing failure/concurrency tests, and prove no duplicate external write or local allocation after uncertain outcomes. Do not make success/consistency claims based only on a 2xx provider response.
2. Resolve the production audit gate (P1-5), or obtain an explicit, reviewed exception. Track all tooling findings separately with owner, exposure assessment, and expiry. Rerun the audit close to promotion because advisory data changes without a lockfile change.
3. Require bounded authenticated Next.js and isolated-provider acceptance for the exact candidate: verified role/account mapping, create/update/send and payment reconciliation, rejection paths, persistence after restart, and recoverability. Keep mail/storage/test accounts isolated. This is future work requiring separate authorization, not work performed or authorized by this audit.
4. Attach current evidence to the candidate commit. `.github/workflows/crm-stabilization.yml:22` runs security tests but does not run the quality/browser/provider suites; push triggers at line 6 exclude `codex/product-quality` (pull requests are covered). Inspect actual CI/branch-protection status separately before relying on it; neither was accessed here.
5. A narrow UI-only promotion requires an explicit release-owner decision limiting scope and accepting unchanged baseline risks, plus the authenticated preview/recovery/rollback gates already listed at `docs/PRODUCT_QUALITY_EXECUTION_2026_09_09.md:94`. It must not be described as provider acceptance, full security clearance, or dealer onboarding readiness. Customer creation remains outside this sidecar's implementation and sign-off.

## Bounded Wrapper Fix Completion

Implementation and verification completed September 9, 2026, by **11:03 a.m. CDT (16:03 UTC)**; this completion appendix was prepared immediately afterward. This section supersedes the earlier baseline findings only to the extent explicitly stated below. No remaining implementation is planned in this sidecar.

### Owned Changes

Only these four paths were edited for this follow-up:

- `src/app/api/quickbooks/purchase-orders/route.ts`: replace catch-all refresh/replay with one operation call and guarded token persistence in `finally`; generic error logging.
- `src/app/api/quickbooks/invoices/route.ts`: one request-scoped client for POST, with guarded rotated-token persistence in the handler's `finally`; generic POST error logging.
- `tests/security/provider-write-retry.test.ts`: new real-route/client offline regression suite, 185 cases.
- `docs/QUALITY_RELEASE_RISKS_2026_09_09.md`: this appendix only.

The application diff is bounded to the two route files: 63 insertions, 29 deletions. No client/customer code, dependency, DB schema, payment recorder, capture, provider configuration, or deployment was changed by this sidecar. Existing coordinator changes were left untouched. No environment contents or live providers were accessed; all test credentials and origin values are synthetic.

### Behavior and Path Coverage

The PO wrapper at `src/app/api/quickbooks/purchase-orders/route.ts:31` no longer catches errors to refresh/replay. Only the unchanged client's explicit HTTP 401 retry remains. Both route persistence blocks compare organization ID, realm ID, and the previous refresh token before storing rotated tokens, inspect `returning`, and emit generic messages for failed storage or changed connections. Storage failure does not replace either successful output or the original provider failure. Unchanged credentials cause no token write. This is one retry per failed client HTTP request, not a global limit across different requests in a multi-step workflow.

| Path | Implementation and verification |
| --- | --- |
| PO GET by ID / list | Existing helper calls at lines 278/282 now use bounded retry and guarded persistence; both exercised. |
| PO direct send | Line 301; lost response, HTTP errors, refresh success/failure, and token persistence outcomes exercised. |
| PO from-estimate lookup and create | Lines 311/342; both the prerequisite read and create are fault-injected independently. |
| PO from-estimate subsequent QB send | Line 350; a send failure retains the created PO and existing `sent:false` / `emailError` behavior, without recreating or resending. |
| PO direct create / subsequent QB send | Lines 391/399; create and subsequent send are independently exercised. |
| PO create/from-estimate with SMTP | Existing SMTP paths unchanged; fixture asserts one send and one PDF render even when token storage fails after successful provider creation. |
| Invoice POST sync | One client at `src/app/api/quickbooks/invoices/route.ts:311`; sync at line 315 covered by the new `finally` at line 478. |
| Invoice POST send via QB | Line 378; provider errors and rotated-token persistence covered. |
| Invoice POST send via SMTP | Invoice lookup at line 329 and optional customer lookup at line 342 independently fault-injected; synthetic PDF/mail only. SMTP failure after rotation does not resend and still persists tokens. Existing optional-customer-lookup failure behavior is preserved. |
| Invoice POST update | Read-before-write, update write at line 395, and follow-up sync at line 396 independently fault-injected; same request-scoped client retained through all steps. |
| Invoice POST create, UI and QB payload formats | Provider create at line 459; both body formats, response identity/total preservation, and token persistence covered. |
| Invoice GET | Lines 181 onward remain unchanged. Live/sync GET and uncached ID lookup still have their separate credential-handling paths; this was not one of the cited POST branches authorized for repair. |

The 17-path test matrix covers lost response, 400, 429, 500, 401-success, token-store failure, realm replacement, lost response after refresh, repeated 401, and refresh endpoint failure. Additional cases cover cookie-auth persistence, organization/refresh-token replacement, unchanged credentials, authorization before I/O, original-error preservation during storage failure, and SMTP behavior. Assertions check attempt counts, old/new bearer usage, identical retry bodies, exact credential predicates, returned document identity/amount, and generic logs. Mock persistence actually evaluates the predicates and refuses replacement rows; it does not blindly report a successful update.

### Verification Results

- Full existing security suite plus new tests: **222 passed, 0 failed, 0 skipped**, across 10 files. Run through the local Node/tsx test runner with `env -i` and `TSX_DISABLE_CACHE=1`; no installs or generated test bundles on disk.
- Focused new suite plus estimate retry and guard inventory: **196 passed**.
- Scoped ESLint on only the two owned routes and new test file: **pass**, no reported diagnostics.
- Scoped TypeScript syntactic/semantic diagnostics on only those three files: **0**, with no emit or incremental writes.
- Owned-route diff whitespace check: **pass**.
- No full build, global lint, authenticated browser acceptance, actual SMTP delivery, provider sandbox request, or database concurrency run was performed.

### Current Disposition and Coordinator Update

**P1-1's catch-all PO replay is fixed and regression-tested locally. P1-4's cited invoice POST and PO wrapper token-persistence gaps are fixed locally; P1-4 is not globally closed.** `src/lib/invoices/record-payment.ts` remains deliberately unchanged, as do invoice GET and any other provider wrappers outside these files. PO retains its existing per-operation client/auth lifecycle; cross-operation refresh coordination and cross-request idempotency were not redesigned. The unchanged invoice update path can still return 500 if its follow-up sync fails after a successful update; tests verify that this does not replay the write, not that this older partial-success reporting problem is fixed. Durable allocation/reconciliation, payment capture, customer agreement, and authenticated acceptance remain separate release risks. Generic logs do not certify sanitization of every existing API error response.

At the coordinator's latest update, **production audit is now 0**, following its update of the single `baseline-browser-mapping` lock entry to **2.11.21**. Thus P1-5's previously observed production audit failure is superseded by coordinator-reported evidence; this sidecar did not rerun that audit or modify dependencies. The earlier full-audit totals are historical and were not remeasured here. This does not assert that all development advisories are resolved.

The coordinator also reports that actual authenticated acceptance remains **blocked by unavailable credentials/download and a browser UI timeout**, and that production remains unchanged. Those blockers were not retried or bypassed by this sidecar. Passing offline wrapper tests does not substitute for authenticated acceptance, provider reconciliation, release authorization, or security certification.

## Superseding Coordinator Checkpoint

The paragraphs above describe intermediate findings, not the final working tree.
PO operations now share one request client and persist final rotated tokens once;
193 provider-wrapper regressions cover the multi-operation case. Customer creation,
atomic payment allocation, durable Square capture, new marked QB import recovery,
reload-safe manual payments and removal of client-side auto-paid mutation are now
implemented and independently reviewed. Main validated 533 automated tests, the
optimized build, typecheck, lint and core six-viewport browser checks. Invoice
reference collisions were checked on an unchanged restored archive, and the real
QB-ID/local-UUID invoice response shape is covered in manual-payment tests.

Browser access recovered; Clerk sign-in is open but actual candidate authentication
and live sandbox acceptance are still unverified. Fee-income accounting, legacy
unmarked historical reconciliation, hosted checkout and broader multi-tenant
certification are not declared complete. Production remains unchanged. See
`QUALITY_PRERELEASE_2026_09_09.md` for the final local evidence and release gates.
