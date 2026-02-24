# Active Context: HearthOS — Fireplace FSM Platform

## Current State

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

## Next Steps (Suggested)

1. Build `/jobs` page — full job list with search, filters, create job modal
2. Build `/customers` page — customer list + customer detail with fireplace history
3. Build `/schedule` page — drag-and-drop calendar
4. Build `/dispatch` page — full map view with tech tracking
5. Build `/invoices` page — invoice list + create/send flow
6. Add database layer (Drizzle + Neon PostgreSQL) via recipe

## Session History

| Date | Changes |
|------|---------|
| 2026-02-24 | Initial template created |
| 2026-02-24 | HearthOS FSM platform — full docs suite + dashboard UI built |
| 2026-02-24 | Professional dark theme redesign — Inter font, dark navy palette, SVG icons, QuickBooks integration page |
