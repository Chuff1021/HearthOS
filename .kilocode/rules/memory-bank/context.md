# Active Context: HearthOS — Fireplace FSM Platform

## Current State

### September 8, 2026: Access Incident Root Cause and Candidate Fix

Authenticated browser verification on diagnostic deployment `dpl_7dX3utaMfhwg66S2we8qNRtpB4zD` showed MEMBERSHIP_NOT_FOUND: the user's verified business login email differs from the existing Colton employee contact email. Added deployment-controlled `HEARTHOS_EMPLOYEE_LOGIN_ALIASES` in production configuration, explicitly mapping that business login to the existing Colton employee UUID. No employee record, role, organization, or business record was changed. New guard permits only verified-email aliases scoped to the existing default organization, rejects ambiguous/inactive matches, and reads role from the existing employee record. Regression tests cover the actual differing-email scenario. Added `/api/access`, structured non-PII error classifications, and a client business access gate so denial cannot masquerade as empty business data. Candidate not yet promoted; working production remains rolled back until signed-in candidate verification passes.

### September 8, 2026: Incident Rollback Supersedes Release

User reported all business data blank after signing in to the stabilization release. Production logs confirmed 403 responses across customers, jobs, dashboard, dispatch, Meeks, and QuickBooks status. Rolled back code only using Vercel to `dpl_37QrQtVu7YLHBWvab1C43FVYbLSC` (`4bd8ab6`, hearth-q7skz1kl6). Canonical URL verified against the rollback target. Read-only database reconciliation still shows 4915 customers, 180 hearth_jobs_store jobs, 36 Meeks requests, 9 projects, unchanged invoice/payment totals. The normalized `jobs` table is empty by prior architecture; actual jobs remain in hearth_jobs_store. Restored browser dashboard loads financial data and QB Synced. Do not reconnect/reimport QB or restore any database. Git origin/main STILL contains `5ee9990`; do not promote/redeploy it until the authenticated account-mapping/authorization failure is diagnosed and tested. Code rollback reintroduces prior known security limitations; it is continuity mitigation, not a final security fix.

### September 8, 2026: Production Release Follow-up

After the checkpoint below, the user explicitly authorized deploying the full stabilization release to the existing production site. Commit `5ee9990` is pushed to `origin/main` and live at `https://hearth-os.vercel.app/`, deployment `dpl_9FovMDWz663DKxtcaiD16GXE8WAY` (Ready). No migrations or intentional business-record changes were performed. A fresh encrypted archive was restored successfully; post-release key counts and financial totals matched that snapshot. See `docs/PRODUCTION_RELEASE_2026-09-08.md` for evidence, rollback target, configuration changes, and remaining limitations. Authenticated workflow verification still requires fresh sign-in. This release is not certification of multi-tenant isolation or audit readiness. The no-deployment statement in the earlier checkpoint describes its historical state, not the current release.

### September 8, 2026: Production Safety Override

The older setup notes below are historical and are NOT instructions to seed data, create a replacement organization, or push a schema to the live database. Aaron's daily production source is the existing Neon database and `main` release lineage. Do not reconstruct it from demo fixtures.

Current stabilization work is isolated in `/Users/fireplace/HearthOS-stabilization`, branch `codex/aarons-crm-stabilization`, based on verified live `4bd8ab6`. A fresh encrypted backup was restored successfully. No production deployment, migration, or record mutation occurred. Access-control, employee identity, Projects/dashboard, customer search, safe mobile feedback/cache, and dependency fixes are implemented locally with tests.

See `docs/STABILIZATION_CHECKPOINT_2026-09-08.md` for exact verification and release blockers. This is NOT multi-tenant/audit-ready completion. Staff-role compatibility, existing unsigned customer-link transition, isolated preview, financial reconciliation, and complete tenant isolation remain mandatory gates. Do not merge the foundation wholesale over this live-main-based branch; it lacks some production features. Meeks remains Aaron-only. Do not touch Travis or LT Rush demo deployments as part of this checkpoint.

**Project Status**: ✅ Foundation complete — HearthOS dashboard UI live

HearthOS is a purpose-built field service management platform for fireplace installation, service, and retail companies. The foundation has been built: full product documentation suite + working Next.js dashboard UI.

## Recently Completed

- [x] Base Next.js 16 setup with App Router, TypeScript, Tailwind CSS 4
- [x] **docs/PRD.md** — Full product requirements document (9 sections)
- [x] **docs/DATABASE_SCHEMA.md** — Complete PostgreSQL schema (18 tables: organizations, users, customers, properties, fireplace_units, jobs, job_assignments, checklist_templates, job_checklists, job_checklist_items, job_photos, job_signatures, job_notes, invoices, invoice_line_items, payments, service_plans, inventory_items, audit_logs)
- [x] **docs/USER_FLOWS.md** — Detailed flows for all 4 roles (Admin, Dispatcher, Technician, Customer)
- [x] **docs/MOBILE_WIREFRAMES.md** — 11 mobile screen wireframe descriptions (Login, Today's Jobs, Map, Job Detail, Status Bar, Checklist, Photo Capture, Signature, Photos Gallery, Notes, Offline Mode)
- [x] **docs/ARCHITECTURE.md** — Full backend architecture (services, data flows, security, multi-tenancy, scalability path)
- [x] **docs/ROADMAP.md** — 90-day MVP sprint plan + Phase 2 (months 4-9) + Phase 3 (months 10-18) + competitive positioning
- [x] **HearthOS Dashboard UI** — Full Next.js dashboard with:
  - Collapsible sidebar with role-based navigation
  - Header with search, live tech status, notifications
  - 6 KPI stat cards (jobs, revenue, invoices, techs, checklist rate, callbacks)
  - Today's Jobs list with status filters, checklist progress bars, priority flags
  - Dispatch Board with 6-tech grid, live status, current job, quick actions
  - Live Activity Feed with 10 activity types
  - Quick Actions dropdown
- [x] **Manual Library** — `/tech/manuals` page with 124 manuals, search, category filters, upload modal, view modal with Open PDF button
- [x] **Manual Library API** — `/api/manuals` endpoint for CRUD operations

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Dashboard home | ✅ Built |
| `src/app/layout.tsx` | Root layout | ✅ Built |
| `src/app/globals.css` | Global styles + HearthOS colors | ✅ Built |
| `src/components/layout/Sidebar.tsx` | Collapsible nav sidebar | ✅ Built |
| `src/components/layout/Header.tsx` | Top header bar | ✅ Built |
| `src/components/dashboard/DashboardStats.tsx` | 6 KPI cards | ✅ Built |
| `src/components/dashboard/TodaysJobs.tsx` | Job list with filters | ✅ Built |
| `src/components/dashboard/DispatchBoard.tsx` | Tech dispatch grid | ✅ Built |
| `src/components/dashboard/RecentActivity.tsx` | Live activity feed | ✅ Built |
| `src/components/dashboard/QuickActions.tsx` | Quick add dropdown | ✅ Built |
| `docs/PRD.md` | Product requirements | ✅ Done |
| `docs/DATABASE_SCHEMA.md` | DB schema | ✅ Done |
| `docs/USER_FLOWS.md` | User flows | ✅ Done |
| `docs/MOBILE_WIREFRAMES.md` | Mobile wireframes | ✅ Done |
| `docs/ARCHITECTURE.md` | Backend architecture | ✅ Done |
| `docs/ROADMAP.md` | MVP + Phase 2/3 roadmap | ✅ Done |

## Product Identity

- **Name:** HearthOS
- **Tagline:** Field Service Management for Fireplace Companies
- **Brand Colors:** Ember orange (#e85d04), Dark navy (#1a1a2e)
- **Target:** Fireplace installation, service, and retail companies
- **Positioning:** Niche ServiceTitan competitor — fireplace-specific

## Tech App Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/tech/page.tsx` | Tech home — today's jobs + shift clock-in/out | ✅ Built |
| `src/app/tech/layout.tsx` | Mobile-optimized layout wrapper | ✅ Built |
| `src/app/tech/job/[jobId]/page.tsx` | Job detail — tabs: details, checklist, photos, customer | ✅ Built |
| `src/app/tech/gabe/page.tsx` | GABE AI fireplace expert chat assistant | ✅ Built |
| `src/app/tech/manuals/page.tsx` | Manuals library with search + PDF upload | ✅ Built |
| `src/app/tech/estimate/page.tsx` | AI estimate builder with line items | ✅ Built |
| `src/app/tech/profile/page.tsx` | Tech profile + GPS tracking toggles | ✅ Built |

## Tech App — Materials & Invoice Tracking

| File | Feature | Status |
|------|---------|--------|
| `src/app/tech/job/[jobId]/page.tsx` | Materials Used section in checklist tab | ✅ Built |
| | 18-item material catalog (pipe, fittings, parts, supplies) | ✅ Built |
| | Qty +/- controls, auto-calculates invoice total | ✅ Built |
| | Invoice preview modal with line items, tax, send/draft | ✅ Built |
| | "Ask GABE about this job" shortcut on details tab | ✅ Built |

## GABE AI — Job Context Awareness

| Feature | Status |
|---------|--------|
| Reads job context from URL params (fireplace, jobType, jobId) | ✅ Built |
| Context-aware greeting and quick questions | ✅ Built |
| Job context banner shows current unit | ✅ Built |
| Pipe sizing, thermopile, Regency-specific knowledge | ✅ Built |
| `buildGabeSystemPrompt()` exported for real API wiring | ✅ Built |
| Wrapped in Suspense for useSearchParams | ✅ Built |

## Sales Pipeline Dashboard Tab

| Feature | Status |
|---------|--------|
| `src/components/dashboard/SalesFunnel.tsx` | ✅ Built |
| 6-stage funnel: Lead → Quoted → Approved → Ordered → Scheduled → Installed | ✅ Built |
| Per-project product/order tracking (ordered, in transit, arrived, delayed) | ✅ Built |
| ETA dates, days-until countdown, parts readiness indicator | ✅ Built |
| Expandable project cards with order timeline | ✅ Built |
| Kanban board view + list view toggle | ✅ Built |
| Pipeline value, MTD installed, ready-to-install summary stats | ✅ Built |
| Tab switcher on main dashboard (Overview / Sales Pipeline) | ✅ Built |

## Core Pages Built

| Page | File | Status |
|------|------|--------|
| `/jobs` | `src/app/jobs/page.tsx` | ✅ Built — job list, search, filters, create modal |
| `/customers` | `src/app/customers/page.tsx` | ✅ Built — QB customer list, detail panel, fireplace history |
| `/invoices` | `src/app/invoices/page.tsx` | ✅ Built — invoice list, detail panel, create modal, QB sync |
| `/schedule` | `src/app/schedule/page.tsx` | ✅ Built — weekly calendar, tech color-coding, tech filter |
| `/dispatch` | `src/app/dispatch/page.tsx` | ✅ Built — live map, tech status, unassigned jobs |

## QuickBooks Integration

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/quickbooks/types.ts` | QB API types | ✅ Done |
| `src/lib/quickbooks/client.ts` | QB OAuth + API client | ✅ Done |
| `src/lib/quickbooks/sync.ts` | Sync service + cache | ✅ Done |
| `src/lib/quickbooks/index.ts` | Barrel export | ✅ Done |
| `src/app/api/quickbooks/connect/route.ts` | OAuth initiation | ✅ Done |
| `src/app/api/quickbooks/callback/route.ts` | OAuth callback | ✅ Done |
| `src/app/api/quickbooks/sync/route.ts` | Trigger full sync | ✅ Done |
| `src/app/api/quickbooks/customers/route.ts` | Customer API | ✅ Done |
| `src/app/api/quickbooks/items/route.ts` | Products/services API | ✅ Done |
| `src/app/api/quickbooks/invoices/route.ts` | Invoice API (GET + POST) | ✅ Done |
| `src/components/integrations/QuickBooksActions.tsx` | Client sync action UI | ✅ Added |
| `src/app/integrations/quickbooks/page.tsx` | Connect + status UI wired | ✅ Updated |
| `src/app/admin/integrations/page.tsx` | Admin integrations hub | ✅ Added |
| `src/app/admin/settings/page.tsx` | Admin org settings | ✅ Added |
| `src/app/admin/page.tsx` | Admin home | ✅ Added |
| `src/app/admin/layout.tsx` | Admin auth gate | ✅ Added |
| `src/proxy.ts` | Clerk middleware (proxy) | ✅ Added |
| `src/lib/org.ts` | Default org helper | ✅ Added |

## Database Layer

| File | Purpose | Status |
|------|---------|--------|
| `src/db/schema.ts` | Full PostgreSQL schema (18 tables) | ✅ Done |
| `src/db/index.ts` | Drizzle + postgres-js client | ✅ Done |
| `drizzle.config.ts` | Drizzle Kit config | ✅ Done |

## GABE AI

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/gabe/prompts.ts` | System prompt builder | ✅ Done |
| `src/app/api/gabe/route.ts` | Groq API endpoint | ✅ Done |
| `src/app/tech/gabe/page.tsx` | Chat UI (calls real API) | ✅ Done |

## Environment Variables Required

See `.env.local.example` for all required env vars:
- `DATABASE_URL` — PostgreSQL connection string
- `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` — QB OAuth app
- `QUICKBOOKS_REDIRECT_URI` — OAuth callback URL
- `QUICKBOOKS_ENVIRONMENT` — `sandbox` or `production`
- `GROQ_API_KEY` — For GABE AI (llama-3.1-8b-instant)
- `GROQ_MODEL` — Override model (optional)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk auth
- `CLERK_SECRET_KEY` — Clerk auth
- `ADMIN_EMAIL` — Admin-only access email

## Local Data Store

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/data-store.ts` | In-memory data store with 8 seed customers + 8 seed invoices | ✅ Built |
| `src/app/api/customers/route.ts` | CRUD API for customers (GET/POST/PUT/DELETE) | ✅ Built |
| `src/app/api/invoices/route.ts` | CRUD API for invoices (GET/POST/PUT/DELETE) | ✅ Built |
| `src/app/api/dashboard/route.ts` | Dashboard stats API (computed from data store) | ✅ Built |

## Next Steps (Remaining)

1. **Set up real database** — Create Neon/Supabase PostgreSQL, add `DATABASE_URL` to env
2. **Register QuickBooks app** — Get client ID/secret from developer.intuit.com
3. **Get Groq API key** — console.groq.com (free tier available)
4. **Run DB migrations** — `bun db:generate && bun db:push`
5. **Deploy to Vercel** — `vercel deploy`, add env vars in Vercel dashboard
6. **Connect Google Maps** — Add `NEXT_PUBLIC_GOOGLE_MAPS_KEY` for real dispatch map

## Manual Library

| File | Purpose | Status |
|------|---------|--------|
| `src/app/api/manuals/route.ts` | Comprehensive fireplace manual API | ✅ Built |
| `src/app/tech/manuals/page.tsx` | Tech app manuals UI with search + upload | ✅ Built |
| `src/lib/gabe/prompts.ts` | GABE AI reads manuals for context | ✅ Built |

### Manual Library Contents (102 total)
- **Majestic (52 models)**: DVLL, DVCT, DVG, DVSL, BFDV, BV, QBDM, QCB, QCF, QLD, 36BDV, Ruby, Meridian, Avalon, Bronze, 8000/8500/9000 Series, DCV, SL-600/700/900, SLE Electric, SHAWNEE, Bristol, Welch, Monroe, IDV/MDV Inserts, Outdoor, Trilogy
- **Regency (6)**: F1100, F5100, HZ40E, HZ50E, U29, C3
- **Napoleon (5)**: AS35, T450, T500, X450, X500
- **Heat & Glo (5)**: SLR, SLR-II, 6000CLX, 8000CLX, Gemini
- **Vermont Castings (4)**: Defiant, Resolute, Intrepid, Majestic
- **Dimplex (4)**: Opti-Myst, Opti-V, Revillusion, Linear
- **Travis Industries (3)**: LW1100, Lopi, Apex
- **Quadra-Fire (3)**: Santa Fe, Explorer, Denali
- **Harman (3)**: P68, Trophy, Advance
- **Buck Stove (4)**: Model 20, 24, 27, 91
- **Pacific Energy (3)**: Alderlea, Summit, Fireview
- **SBI (3)**: Enerzone, Drolet, Flexiheat
- **Mont (3)**: Deluxe, Enchantment, Excalibur
- **Empire (4)**: Vail, Alta, DVC, Palisade
- **SimpliFire (4)**: Allusion, Scorpius, Vortex, Motion
- **Modern Flames (3)**: Aurora, Landscape Pro, Wildland
- **American Fireglass (3)**: Burner Systems, Fireballs, Fireplace Logs
- **Rinnai (3)**: Enclaves, EnergySaver, Contour
- **Lennox (3)**: Merritt, Brockway, Whitby
- **Superior (3)**: DRT, DRL, XTR
- **Kozy Heat (3)**: Taylor, Spartan, Bayport

## Session History

| Date | Changes |
|------|---------|
| 2026-02-24 | Initial template created |
| 2026-02-24 | HearthOS FSM platform — full docs suite + dashboard UI built |
| 2026-02-24 | Professional dark theme redesign — Inter font, dark navy palette, SVG icons, QuickBooks integration page |
| 2026-02-24 | Service Tech mobile app built — 7 pages: jobs, job detail, GABE AI, manuals, estimate builder, profile with GPS |
| 2026-02-24 | Materials tracking on checklist (auto-invoice), GABE job context awareness, Sales Pipeline dashboard tab |
| 2026-02-25 | QuickBooks API integration (OAuth, sync, customers/items/invoices), PostgreSQL schema (18 tables), /jobs, /customers, /invoices, /schedule, /dispatch pages, GABE AI wired to Groq API |
| 2026-02-25 | QuickBooks integration UI wired to connect + sync actions; status driven by cookies/query params |
| 2026-02-26 | Team page delete functionality, GABE AI manual citations, restored 124 manuals to Manual Library |
| 2026-02-26 | Add .env.local.example documenting GROQ_API_KEY, improve GABE fallback to show loaded manuals count |
| 2026-02-25 | Added Clerk auth, admin backend pages, org settings, and persisted QuickBooks tokens to DB |
| 2026-02-25 | Updated Clerk integration to use proxy.ts + layout header auth UI |
| 2026-02-26 | Created Jobs, Schedule, Dispatch, Techs API routes with CRUD operations |
| 2026-02-26 | Fixed Jobs page "New Job" button - added form state and API handler |
| 2026-02-26 | Fixed QuickActions dropdown - now navigates to Jobs, Customers, Invoices, Estimate pages |
| 2026-02-26 | Added dashboard search functionality - searches customers, jobs, invoices with dropdown results |
| 2026-02-26 | Added comprehensive fireplace manual library - 52 Majestic + 50 other brand manuals (102 total) |
