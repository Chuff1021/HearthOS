# Workspace Design Audit - 2026-09-09

## Scope and Reproduction

`scripts/testing/design-workspaces-ui.cjs` replaces the temporary `/tmp/hearth-workspaces-smoke.cjs` audit. Its isolated companion, `scripts/testing/design-workspaces-fixtures.cjs`, contains synthetic fixtures matching the current page-local response contracts. These are the only implementation files owned by this audit. No application, API, database, provider, or global stylesheet is edited by the harness.

```sh
OUTPUT=/tmp/hearth-workspaces-final-release node scripts/testing/design-workspaces-ui.cjs
WORKSPACE_SMOKE_VIEWS=todos,team,inventory OUTPUT=/tmp/hearth-workspaces-targeted node scripts/testing/design-workspaces-ui.cjs
PLAYWRIGHT_MODULE_PATH=/path/to/node_modules/playwright OUTPUT=/tmp/hearth-workspaces-portable node scripts/testing/design-workspaces-ui.cjs
```

The default Playwright path is the installed Codex runtime. `WORKSPACE_SMOKE_OUTPUT` is also accepted as an output-directory alias. Output must be outside the shared repository. Dynamic views use their route-pattern names, for example `WORKSPACE_SMOKE_VIEWS='vendors/[id],tech/job/[jobId]'`. All view selections run desktop 1440x1000 and mobile 390x844 in both light and dark mode. Each screenshot independently applies, checks, and records the actual theme.

The evidence directory contains `report.json`, an incrementally refreshed `report.partial.json`, `route-coverage.json`, `index.md`, and per-route/state PNGs. The JSON includes rendered route classifications, source SHA-256 hashes, all synthetic HTTP requests, expected 503 responses, unconfigured reads, external attempts, runtime/console errors, computed typography, selected-state samples, visible geometry and intentional horizontal scrollers. Nonzero exit means a test or presentation check failed. The loopback server and fresh browser contexts are closed in `finally`; interruption retains partial evidence.

## Route Inventory

The inventory is discovered from every existing `src/app/**/page.tsx` and checked against sidebar hrefs parsed from `navigation-model.ts`. New unclassified routes fail the audit instead of silently disappearing. There are 52 existing routes: 36 owned route entries, 10 delegated core/billing entries, and 6 exclusions. `meeks-embedded` is an additional component scenario, not a fabricated application route.

| Existing routes | Classification and coverage |
| --- | --- |
| `/todos`, `/website-inbox`, `/service-map`, `/dispatch` | Real client pages; populated tasks, inbox requests, mapped/unmapped service customers and technician/unassigned-job records. |
| `/inventory`, `/vendors`, `/vendors/[id]`, `/expenses` | Real client pages; inventory cost/history records, vendor balances/transactions, and desktop expense review with submitted/approved/rejected receipts. |
| `/reports` | Real report index component. |
| `/reports/ar-aging`, `/reports/ap-aging`, `/reports/sales-by-customer`, `/reports/sales-by-item`, `/reports/profit-by-job`, `/reports/cash-flow` | All six real report pages; nonzero aged balances, sales/cost/margin records, loss-making invoices, and positive/negative cash-flow months. |
| `/team`, `/settings`, `/gabe` | Real client pages. Settings' actual tabs are Organization, Notifications, Billing, and Integrations. Business Hours is within Organization, not a separate route or tab. |
| `/integrations/quickbooks` | Real static server-page presentation with real client QuickBooksActions; synthetic connected/reconnect states. |
| `/admin` | Real static server-page presentation. |
| `/admin/time`, `/admin/gabe-audit` | Real client pages; populated time entries, edit/time-off requests, approvals, historical conversations and review/supervisor data. |
| `/admin/settings`, `/admin/content`, `/admin/integrations` | Actual async server components rendered with isolated organization/auth-boundary adapters; no real DB query or server action. |
| `/meeks` | Actual async page with synthetic approved access; real MeeksSchedulePanel. Authorization behavior is not tested. |
| `/tech`, `/tech/expenses`, `/tech/inbox`, `/tech/manuals`, `/tech/profile`, `/tech/time-history`, `/tech/estimate`, `/tech/payments`, `/tech/job/[jobId]` | Actual client components inside the tech layout's presentation wrapper. Synthetic assigned jobs, inbox tasks, receipts, manuals, time history and payment-history statuses. |
| `/tech/gabe` | Actual redirect-only component; verify navigation to `/tech`, then capture the destination. Not a second GABE UI. |
| `/`, `/schedule`, `/jobs` | Delegated to parent/core and Schedule owner. Listed but not passed or duplicated by this audit. |
| `/projects`, `/customers`, `/customers/[id]` | Delegated to `scripts/testing/design-projects-customers-ui.mjs`. |
| `/invoices`, `/payments`, `/estimates`, `/purchase-orders` | Delegated to `scripts/testing/design-billing-ui.mjs`. Desktop `/expenses` is explicitly not delegated. |
| `/banking`, `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`, `/pay`, `/accept-estimate`, `/tech/job/[jobId]/report` | Excluded by request: Banking, public auth/payment/acceptance, and print/report document surface. |

## Additional States

- To-Do: populated create dialog with customer lookup, long description and tags; mobile dialog scrolling.
- Team: long-name member details and populated add-member dialog at every viewport/theme.
- Inventory: populated detail/history drawer, price-audit rows, trim form, and automatic preview POST denied with 503 and disabled Apply. No successful trim is claimed.
- Reports: AR/AP row expansion without navigating the customer link; profit detail drawer backed by its actual response contract.
- Vendors: Bills, Purchase Orders and Profile tabs using the actual accessible names, including count suffixes.
- Settings: all four tabs, including scrolling to business-hours controls.
- Website Inbox: actual request dialog; injected read failure, visible Retry, and recovery to synthetic records.
- Admin Time: Timesheet plus Weekly Approval, Edit Requests and Time Off views.
- Tech job: Details, Checklist, Photos and Customer views; Tech home read-failure presentation.
- QuickBooks: synthetic connected and reconnect-required states; never connect, sync or authorize a provider.
- Meeks: standalone async route and embedded scheduling panel; real calendar/forms with synthetic requests.

## Presentation Assertions

The audit measures computed font families/sizes, zero letter spacing, input radius/height, semantic input surfaces/text, selected tabs/segmented controls/sidebar patterns, loaded local Geist fonts, and dialog bounds. To-Do's owned `--pw-todos-*` neutral palette is recognized rather than incorrectly compared only with globals. Mobile inputs are expected at 16px, including business-hours fields. Expenses permits only its four existing status text colors and the allocation filter's secondary text token; enabled opaque-RGB input text still requires 4.5:1 contrast. This is not a comprehensive contrast audit of every button, label, alpha-composited surface or text node.

Geometry checks inspect visible controls/headings in the top viewport and real vertically scrolled content, including sibling dialogs outside the main workspace. A wide table is allowed only inside a real horizontal scroller whose own box fits the viewport; the page is not exempted wholesale. Table clipping is recorded separately. The checks do not claim exhaustive pixel-level overlap, keyboard, screen-reader, or contrast certification.

CSS is served as root `globals.css` first, then the actual esbuild-extracted page/component stylesheet imports, then local font faces/variables emulating `next/font`. The harness applies no presentation overrides. It checks the root layout's globals import and actual stylesheet order in the offline document. This validates the modeled import order, not production Next chunk loading/hydration order; that remains preview/runtime acceptance.

## Final Evidence

The source-frozen final sweep passed in `/tmp/hearth-workspaces-final-release`: 394/394 screenshots, 123/123 execution/safety checks, 36 rendered routes, and 3,772 typography samples. There are no failed geometry/style checks, runtime errors, unexpected console errors, external requests, unconfigured API reads, or source changes during the run. All 24 independent mutation probes were denied. The server closed successfully. Its report records source SHA-256 values independently of the Git checkpoint, so local changes are included and concurrent edits fail the run. Screenshot totals differ from the earlier 396-capture diagnostic because scrolling captures are conditional on actual content height.

Completed supporting checks against the final application sources:

- `design-preservation.mjs` passes against production `e425fae`: all 17 changed existing components retain exact event handlers, fetch calls, state/effect hooks; protected backend files are unchanged and no routes are added.
- TypeScript passes. All 199 quality tests pass. ESLint has zero errors and the same 24 pre-existing warnings.
- The isolated production build passes with the existing filesystem-tracing warnings. No environment files or live database/provider access are used by the build.
- `/tmp/hearthos-design-billing-final/report.json`: 169 passing checks and 49 screenshots, including customer search, estimate generation, existing estimate controls, purchase-order details, mobile navigation and light/dark presentation.
- `/tmp/hearthos-projects-customers-final/report.json`: 32 screenshots, passing project procurement/source/scheduling links, customer tabs, phone layouts and light/dark contrast checks; source hashes unchanged and no external requests or mutations.
- Dedicated Schedule evidence: `/tmp/hearthos-schedule-presentation` and `/tmp/hearthos-schedule-followup-quality`. Existing calendar columns, overlapping appointments, short visits, technician filters, month/week views, detail/create dialogs and validation remain intact.

Earlier diagnostic reports are retained as failures, not relabeled as passes. The parent-owned `/tmp/hearth-workspaces-release/report.json` completed 396 captures and 123 execution/safety checks; 14 screenshots exposed mobile vendor-tab overflow. `/tmp/hearth-workspaces-last-fixes/report.json` then passed 48 screenshots and 31 checks on vendor detail and tech job screens. `/tmp/hearth-workspaces-contrast-fixes/report.json` passed geometry on all 80 captures but caught one selected-tab color while its transition was finishing. The final harness waits for finite animations to settle without changing the exact token assertions. Interrupted agent-owned runs are superseded.

Manual review covered every owned route's mobile-dark and desktop-light initial appearance plus embedded Meeks, with full-size mobile images and desktop contact sheets. Critical revised screens are reviewed individually again. This does not claim every dialog/state PNG has had individual visual inspection.

### Visual Corrections

| Finding | Presentation-only correction |
| --- | --- |
| Vendor profile tabs shifted and clipped phone content. | Tabs wrap within the profile and use explicit selected state; the page is not exempted from geometry checks. |
| Dark Manuals header remained translucent white. | The tech header now uses its semantic dark surface and border, without backdrop blur. |
| Manuals action text and model filters had low contrast. | Ingestion uses semantic info/warning text; model selection uses the shared primary action style. |
| White text on old amber Inventory/Vendor/Profit controls lacked contrast. | Active controls use the accessible HearthOS burnt-orange fill. |
| Long vendor contact details overflowed on phones. | Shrinkable wrapping text spans and fixed-size Lucide contact icons. |
| Large vendor metric values wrapped their final digit. | Container-aware numeric sizing and no-wrap amounts preserve complete values in the existing grid. |
| Tech photo capture still had a blue gradient. | Existing capture button uses the shared primary style, without changing photo handlers or storage. |

Production release remains pending protected CI, merge, and authenticated runtime checks. Rollback reference: `dpl_GkhJxY72QPXB4Yzufs1prKdFZiav`, production commit `e425fae`. No preview-environment artifact will be promoted over Aaron's production configuration. The fresh read-only baseline `production-baseline-2026-09-09T21-23-27-644Z.json` in the secure backup directory exactly matches the earlier baseline digest `6b7ef43373f86b5f79ef9873fa3dd3736c95300964fdabeda0387a2fc103c7f1`: one organization, all 67 table counts, selected business-table checksums and financial totals are unchanged.

## Safety and Limits

- Every API read is explicitly fulfilled with synthetic data; unknown reads fail closed with 503. The fallback loopback server never proxies an API.
- All HTTP mutation methods return 503, including ostensibly read-like POSTs such as inventory trim preview. Independent direct-server mutation probes verify the fallback barrier.
- External HTTP and WebSocket attempts are blocked; service workers, geolocation, real browser profiles and provider SDK/auth credentials are not used.
- Async admin DB/auth modules are replaced only at the bundler boundary. Their real page JSX is retained. Tech auth/GPS/PWA runtime providers are not mounted.
- Settings controls without persistence handlers remain presentation-only. Existence/clickability is not proof of saving settings, inviting staff, generating estimates, collecting payments, syncing QuickBooks or submitting payroll.
- Fixture dates and browser time are fixed to 2026-09-09. No production or customer data is read. Blank synthetic map tiles do not validate map-provider imagery/routing accuracy.
- Source hashes detect concurrent source changes. Route coverage distinguishes actual rendering, redirects, server-component adaptation, delegation and exclusions. No preview, CI or production acceptance is inferred from these offline results.
