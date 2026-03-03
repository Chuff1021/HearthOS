# HearthOS Page + Route Audit (Product + Engineering)

_Date: 2026-03-03 (UTC)_  
_Scope: `/root/HearthOS` Next.js app routes/pages for shipping HearthOS SaaS to fireplace stores (owner web + tech mobile)._  
_Note: No code changes made; this is an audit only._

## Status legend
- **Complete** = production-usable UI + route wiring + non-trivial data flow for core user action.
- **Partial** = good UI and some wiring, but missing persistence, key flows, role/org controls, or critical actions.
- **Stub** = mostly static/mock/demo UI; core workflow is not wired.

---

## 1) Current page/route inventory

## A. Owner/Admin web app routes

| Route | Status | Why |
|---|---|---|
| `/` (Dashboard) | **Partial** | Uses live components (`/api/dashboard`, `/api/jobs`) but also hardcoded date/metrics and pipeline mock data. |
| `/todos` | **Partial** | Full CRUD UI wired to `/api/todos`, but backend is in-memory (`src/lib/todos.ts`), no DB/org persistence. |
| `/schedule` | **Stub** | Calendar UI is strong, but uses `mockTechs`/`mockJobs`; does not call `/api/schedule`. |
| `/jobs` | **Partial** | Create-job posts to `/api/jobs`, but list/filter runs on local `mockJobs`; mixed/wrong source-of-truth. |
| `/customers` | **Partial** | Good CRUD + QB fallback wiring (`/api/customers`, `/api/quickbooks/customers`), but local/in-memory fallback not persistent DB. |
| `/dispatch` | **Stub** | Uses hardcoded `mockTechs`; no live dispatch feed from `/api/dispatch`. |
| `/invoices` | **Partial** | Strong CRUD + QuickBooks sync paths, but local fallback store is in-memory and not durable. |
| `/payments` | **Stub** | Sample data UI only; no `/api/payments` route or persistence wiring. |
| `/estimates` | **Stub** | Rich UI but sample-only data and no API/model wiring. |
| `/inventory` | **Stub** | Sample stock list only; no `/api/inventory` or live stock updates. |
| `/service-plans` | **Stub** | Sample plans only; no API or DB linkage to customers/jobs. |
| `/reports` | **Partial** | Reads `/api/jobs` + `/api/techs` and computes metrics, but source data is demo-memory; some report sections still “coming soon”. |
| `/team` | **Partial** | Reads/deletes via `/api/techs`; availability/current job is mocked in page; no durable workforce model. |
| `/settings` | **Stub** | UI tabs only, local state; not wired to backend settings APIs/actions. |
| `/integrations/quickbooks` | **Partial** | Connect/sync controls present via QuickBooks actions and callbacks; sync KPIs on page remain placeholder-level. |
| `/admin` | **Partial** | Navigation shell; depends on sub-pages for actual ops. |
| `/admin/settings` | **Complete (MVP)** | Server-action form writes org settings to DB via Drizzle. |
| `/admin/content` | **Complete (MVP)** | Server-action content editor persists org content settings. |
| `/admin/integrations` | **Partial** | Settings persist; env/connect state shown; operational monitoring remains lightweight. |
| `/admin/gabe-audit` | **Partial** | Working moderation/audit UI backed by `/api/gabe/messages` (still local-memory style backend). |
| `/sign-in/[[...sign-in]]` | **Complete** | Clerk auth route wired. |
| `/sign-up/[[...sign-up]]` | **Complete** | Clerk auth route wired. |

## B. Tech mobile app routes

| Route | Status | Why |
|---|---|---|
| `/tech` | **Partial** | Good mobile shell and clock-in/out UX, but state is local only; no timesheet API/persistence. |
| `/tech/job/[jobId]` | **Stub** | Comprehensive UI (checklists/photos/notes/signature concepts) but driven by `mockJobData`; no API wiring. |
| `/tech/estimate` | **Stub** | AI estimate simulation + local line items only; no backend save/send flow. |
| `/tech/manuals` | **Partial** | Wired to `/api/manuals` for list/add/edit/delete; backend still in-memory and not tenant-durable. |
| `/tech/gabe` | **Partial** | Live chat to `/api/gabe`; useful MVP, but depends on non-persistent context/data sources. |
| `/tech/profile` | **Stub** | Mostly local toggles/stats; sign-out path appears non-standard (`/sign-out` redirect). |

---

## 2) Engineering readiness summary

### What is solid enough to build on
- App IA and route structure are broad and aligned to field-service workflows.
- Clerk auth is in place.
- QuickBooks integration scaffolding is meaningful (OAuth + sync endpoints).
- Admin org/config pages already use DB writes (best current production pattern in repo).

### Blockers to shipping as SaaS (multi-tenant, reliable)
1. **Data durability gap:** Most operational APIs/pages use in-memory seed stores, not DB-backed persistence.
2. **Dual source-of-truth UIs:** Several pages have API calls but still render mock arrays (`/jobs`, `/schedule`, `/dispatch`).
3. **Missing core owner flows:** payments, inventory, service plans, estimates are largely non-operational.
4. **Missing core tech flows:** schedule queue, dispatch/route, tech todos, inventory/truck stock, and job execution completion are not truly wired.
5. **No explicit tenant isolation in most routes:** Org-aware DB patterns exist but are not consistently applied beyond admin settings/content.

---

## 3) Prioritized gap list (what to build next)

## P0 (must-have for launch)
1. **Replace in-memory APIs with DB-backed tenant-aware services** for jobs, techs, schedule, dispatch, todos, manuals, customers/invoices fallback.
2. **Unify each page to one source of truth** (remove mock arrays from render paths).
3. **Ship tech field execution loop**: clock in/out + assigned jobs + checklist completion + photos + notes + signature + closeout.
4. **Ship owner dispatch/scheduling loop**: assign/reassign techs, day-of status, unassigned queue, completion visibility.

## P1 (high-value soon after)
5. **Inventory operations MVP** (stock on hand, adjustments, low-stock, job material usage).
6. **Payments capture + reconciliation page** (record payment and link invoice/customer).
7. **Estimates lifecycle MVP** (draft → send → approve/decline → convert to job/invoice).
8. **Service plans lifecycle** (plan enrollment, renewals, next service auto-create).

## P2 (optimization)
9. Report drill-downs + export.
10. SLA/alerts/notification center.
11. Route optimization/ETA and richer dispatcher map controls.

---

## 4) Missing pages required for owner + tech workflows (with acceptance criteria)

## Owner dashboard/workflow pages

### 1) `/dispatch/live` (new)
**Purpose:** Real-time dispatch board and assignment control.  
**Acceptance criteria:**
- Shows all active techs with status/location freshness + unassigned jobs.
- Dispatcher can assign/reassign job to tech; changes persist and reflect in schedule and tech app.
- Status transitions (`scheduled → en_route → on_site → completed`) are visible in <5s after update.

### 2) `/schedule/day` and `/schedule/week` (new or refactor existing)
**Purpose:** Production scheduler with drag/drop and conflict handling.  
**Acceptance criteria:**
- Loads jobs + tech availability from DB by org/date range.
- Prevents overlapping assignments (or prompts override with reason).
- Supports drag/drop reschedule and reassignment with audit log.

### 3) `/inventory` (refactor existing)
**Purpose:** Operational stock management.  
**Acceptance criteria:**
- Reads/writes inventory from DB (not sample array).
- Supports stock adjust in/out with reason and user/time stamp.
- Low-stock threshold alerts and filter work from live values.

### 4) `/payments` (refactor existing)
**Purpose:** Collections and reconciliation.  
**Acceptance criteria:**
- Can create payment against invoice; invoice balance updates immediately.
- Payment method, reference, and timestamp stored in DB.
- Payment list filter/search by customer, invoice, date, status.

### 5) `/estimates` (refactor existing)
**Purpose:** Sales-to-work-order conversion.  
**Acceptance criteria:**
- CRUD estimate with line items and tax totals.
- Status workflow: draft/sent/approved/rejected/expired.
- “Convert to Job” and “Convert to Invoice” actions create linked records.

### 6) `/service-plans` (refactor existing)
**Purpose:** Recurring revenue and preventive maintenance.  
**Acceptance criteria:**
- Plan create/edit/cancel with frequency and next service date.
- Renewal and expiration states computed from dates.
- Optional auto-create scheduled job for due plans.

### 7) `/jobs/[jobId]` (new owner detail page)
**Purpose:** Single source for dispatch + office + billing context.  
**Acceptance criteria:**
- Displays timeline, assignments, checklist summary, notes, photos, invoice/estimate links.
- Supports status/priority edits and assignment updates.
- All edits persist and are audit-logged.

## Tech app workflow pages

### 8) `/tech/schedule` (new)
**Purpose:** Tech’s assigned jobs timeline/day view.  
**Acceptance criteria:**
- Shows only jobs assigned to logged-in tech.
- Start navigation / start job / mark arrived actions update dispatch state.
- Handles offline cache + sync retry for status updates.

### 9) `/tech/todos` (new)
**Purpose:** Tech task queue beyond jobs (follow-ups, parts, callbacks).  
**Acceptance criteria:**
- Tech can view/create/update/complete own todos.
- Todo can link to job/customer.
- Completion updates owner dashboard counters.

### 10) `/tech/inventory` (new)
**Purpose:** Truck stock usage and replenishment requests.  
**Acceptance criteria:**
- Tech can consume parts on job; job record stores material usage.
- Truck stock decrements and low-stock flags appear.
- Replenishment request submits to owner/warehouse queue.

### 11) `/tech/job/[jobId]` (refactor existing)
**Purpose:** Field execution record of truth.  
**Acceptance criteria:**
- Loads real job data by `jobId` from DB/API.
- Checklist items persist per job; required items block completion until done/overridden with reason.
- Photo uploads, notes, customer signature persist and appear in owner job detail.

### 12) `/tech/time` (new)
**Purpose:** Clock in/out + labor tracking.  
**Acceptance criteria:**
- Clock-in/out writes timesheet entries server-side.
- Job start/stop contributes to labor duration per job.
- Owner can report daily/weekly hours by tech.

---

## 5) Recommended release sequence

1. **Platform hardening:** DB-backed APIs + org scoping + remove mocks from active routes.  
2. **Core operations:** schedule + dispatch + job detail + tech job execution.  
3. **Monetization path:** estimates + invoices + payments + service plans.  
4. **Operational depth:** inventory + reporting + QA/alerts.

---

## 6) Bottom line

HearthOS has strong UI breadth and a credible workflow map, but today it is **MVP-demo maturity**, not SaaS-ready operations. The fastest path to ship is to prioritize **data durability + source-of-truth cleanup + dispatch/tech execution loop** before adding more surface area.
