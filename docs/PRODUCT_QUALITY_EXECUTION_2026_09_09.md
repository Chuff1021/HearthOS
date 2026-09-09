# HearthOS Product Quality Execution

## Release Status

September 9, 2026. Local candidate on `codex/product-quality`, based on the
verified production commit `19fb50f84ac1fafe2884c2a7764f6eb0f00d91ae`.
Not deployed. This is a bounded quality pass, not certification of the entire
CRM or completion of multi-tenant launch readiness.

Six agents worked on dashboard/maps, header/search, jobs/schedule, customers,
navigation/styles, and database parity/independent review. Changes were integrated
and exercised together. Do not deploy the separate dealer-readiness foundation
wholesale over production to release these fixes.

## Data Safety

- No production database reads or writes, migrations, sync, provider mutations,
  credential changes, or deployments during implementation.
- No production environment files copied into this worktree. Package lock and
  installed dependency versions unchanged.
- Production source worktree left unchanged. Existing customer, invoice, job,
  schedule, photo, Meeks, and organization persistence paths retained.
- Browser fixtures are test-only; they are not imported by application code.
- Database tests use a fresh local socket-only PostgreSQL cluster, synthetic
  records, a SELECT-only application role, and before/after row fingerprints.
- Build uses a sanitized environment and unreachable loopback database URL.

## Implemented

| Area | Changes |
| --- | --- |
| Dashboard | Quick Add opens existing job form; invented trends/confidence removed; explicit loading/error/retry states; authenticated greeting; working Open Balances filter link; compact responsive cockpit. |
| Operations map | No substitute employee coordinates or decorative route; validated coordinates, accuracy, timestamps, escaped marker content; honest missing/stale location states; fixed asynchronous initialization; real zoom/recenter and attribution retained. |
| Header | Authenticated display identity instead of hardcoded owner; removed inert Help and fake notification badge; connected is not labeled synced; cancellable/latest-only validated search; keyboard navigation, dismissal, timeout/retry, unclipped results. |
| Customer search | Local UUID detail links; concurrent customer/job/invoice lookup; bounded result sets and query length; literal search escaping; organization predicate on both sides of invoice/customer join; private/no-store and generic errors. |
| Customers | Address including line 2; phone cards; progressive 50-record rendering; request cancellation, retry, last-good data retention; validated URL filters; unsupported New customer placeholder removed. |
| Customer center | Six sequential queries replaced by four independent queries; single conditional financial aggregate; payment/invoice organization predicates both enforced; financial definitions preserved. |
| Jobs | Scheduled date/time in cards; exact deep links including historical jobs; address prefills; Follow-up/Custom types; failed-save retention; drafts protected from late refreshes; returned saved record applied outside capped lists; save completion cannot overwrite another selection's draft. |
| Schedule | Phone agenda; local-date defaults; consistent job types, address, and error handling; desktop hour scrolling restricted to desktop grid; uncertain QB customer creation no longer falls back to another store automatically. |
| Shell | Preserved route inventory; compact rail and phone navigation; keyboard-accessible More dialog and focus return; safe areas; clearer active state, typography, semantic dark surfaces, and reduced blanket blur. |
| Meeks intake | Internal summary and controls fit phones; calendar scrolling stays inside the calendar. No request, upload, auth, or persistence logic changed. |

## Verification

Run from this worktree:

```sh
npm run typecheck
npm run lint
node scripts/quality-build.mjs
npm run test:security
npx tsx --test tests/quality/*.test.ts
node scripts/testing/quality-customer-center.mjs
node --test tests/quality/header-browser.test.mjs
node scripts/quality-ui.mjs
```

Browser scripts require Playwright or `PLAYWRIGHT_MODULE_PATH` pointing to the
available runtime package. The main UI harness bundles the actual React pages
and CSS with synthetic HTTP, navigation, and identity adapters. It blocks external
network calls. It is not a substitute for authenticated Next.js/provider testing.

Coverage includes dashboard, jobs, customers, schedule, mobile navigation,
keyboard search, exact job links, address prefills, failed-save retention,
mobile calendar visibility, and light/dark screenshots. Viewports: 320x740,
390x844, 430x932, 844x390, 1440x1000, and 1600x1100.

Final focused suite: 75 quality tests and 37 security regression tests passed.
The real-component browser suite passed at all six sizes with zero console
errors; header-specific synthetic browser verification also passed. Typecheck
passed. An independent reviewer reproduced two job-editing defects, then
independently reran all 24 job/schedule tests after fixes and found no blockers
within that reviewed scope.

Final isolated production build passed (93 static pages). Full ESLint passed
with zero errors and 24 pre-existing warnings. The build retains seven existing
dynamic-filesystem tracing warnings from `persist-json.ts`; this persistence
module was deliberately not changed in the visual pass. Browser verification
used bundled Playwright because `agent-browser` was not installed on PATH.

The security route inventory scanner now recognizes a leading try block and
an explicit denial block ending in `return accessDenied`, not only a one-line
denial. Runtime authorization is unchanged and remains first in the search route.

Database verification: 9 passing tests, 149 successful old/current route requests,
four SELECTs per current request versus six before. Financial/filter/sort/search
parity, foreign-organization exclusion, and unchanged fixture fingerprints passed.
This proves query parity on the fixture, not a production performance percentile.

## Remaining Work / Promotion Gates

1. Customer creation: the disabled placeholder is gone, but a safe unified creation
   path is not delivered. The legacy local route writes a separate store; QB
   creation still has backend retry/replay risk. Implement idempotent creation and
   reconciliation before exposing it as a new customer-list action.
2. Verify actual signed-in candidate access with Aaron's identity and existing
   organization, using an isolated restored database and private storage. Compare
   record counts and financial totals. No reconnect/reimport to repair blank data.
3. Exercise real Next.js navigation, API persistence, Clerk role behavior, actual
   map tiles/markers, full Meeks calendar behavior, and technician workflows.
4. Test invoice/payment/estimate/PO/expense/project flows and failure recovery
   against isolated provider accounts. UI fixtures do not validate these providers.
5. Measure cold/warm request timings, query plans and phone interactions against a
   production-sized clone. Jobs/calendar still load a capped 1,000-job list;
   global job search still reads the legacy store; header requests still remount.
   Date-scoped API pagination and tenant-safe cache/deduplication remain separate work.
6. Baseline dependency audit reports 12 findings (1 low, 6 moderate, 5 high).
   No dependency upgrade was bundled into this UI pass. Review reachability and
   patch on a separate tested branch before claiming launch/security readiness.
7. Complete tenant isolation, onboarding, support access, private file access,
   provider account mapping, and rollout rehearsals on the foundation workstream.
   Meeks and GABE remain Aaron-only; demo data stays separate.
8. Before promotion: fresh verified recovery point, authenticated preview
   acceptance, read-only reconciliation, rollback target, and explicit release.

## Local Visual Preview

`node scripts/quality-preview.mjs` starts a loopback-only synthetic read-only UI
preview and prints its URL/PID. The four main pages use test records; unsupported
routes are placeholders, and mutations deliberately fail without saving. This
does not connect to Aaron's records. Stop the printed PID when no longer needed.
