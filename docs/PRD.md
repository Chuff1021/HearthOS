# 🔥 HearthOS — Product Requirements Document (PRD)
**Version:** 1.0  
**Date:** 2026-02-24  
**Product:** HearthOS — Field Service Management Platform for Fireplace Companies  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

HearthOS is a purpose-built field service management (FSM) platform for fireplace installation, service, and retail companies. It replaces fragmented workflows (paper job folders, text-message scheduling, spreadsheets, separate invoicing) with a single unified platform that is:

- **Simple** for field installers and technicians
- **Powerful** for management and dispatch
- **Professional** for customers

HearthOS is designed as a niche ServiceTitan competitor, fireplace-specific, with a white-label SaaS resale path.

---

## 2. Problem Statement

Fireplace companies face unique operational challenges:

| Problem | Impact |
|---------|--------|
| Paper job folders lost or incomplete | Missed safety steps, liability exposure |
| Text-message scheduling | Double-bookings, no audit trail |
| Spreadsheet tracking | No real-time visibility, error-prone |
| No photo documentation workflow | Warranty disputes, no before/after proof |
| Disconnected invoicing | Delayed payments, QuickBooks reconciliation nightmares |
| No service history per fireplace unit | Repeat diagnostics, wasted tech time |
| No compliance checklist enforcement | Safety violations, failed inspections |

---

## 3. Target Users

### 3.1 Admin / Owner
- Full system access
- User management & role permissions
- Pricing tables (labor rates, trip fees, install types)
- Reporting & analytics dashboards
- Integration management (QuickBooks, Stripe, SMS, email)
- White-label configuration (future)

### 3.2 Office / Dispatcher
- Create, edit, and assign jobs
- Drag-and-drop scheduling calendar
- Manage customer records and fireplace assets
- Send estimates and invoices
- Monitor tech locations and job statuses
- Handle inbound customer communications

### 3.3 Installer / Technician (Mobile-First)
- View today's jobs (map + timeline view)
- One-tap GPS navigation to job site
- Clock in/out of jobs (time tracking)
- Upload photos and videos per checklist step
- Complete dynamic install/service checklists
- Capture customer digital signatures
- Mark job status transitions (On the Way → On Site → Working → Completed)
- Offline mode with background sync

### 3.4 Customer Portal
- View upcoming appointment status and tech ETA
- Receive SMS/email notifications
- Review and approve estimates digitally
- Pay invoices online (card, ACH)
- View full service history and warranty records
- Access uploaded photos from their jobs

---

## 4. Core Features

### 4.1 Scheduling & Dispatch
- Drag-and-drop calendar (daily / weekly / monthly views)
- Job types: Install, Service, Clean & Burn, Warranty, Estimate, Emergency
- Travel-time awareness between jobs
- Conflict detection and alerts
- Emergency priority job flagging
- Recurring service plan scheduling (annual maintenance)
- Tech availability and skill-based assignment
- Map view of all active jobs

### 4.2 Customer & Job Records

**Customer Profile:**
- Contact info (name, phone, email, address)
- Multiple property addresses
- Fireplace inventory (type, brand, model, serial number)
- Install date and warranty expiration
- Photo gallery (before/after, unit photos)
- Full service history timeline
- Notes (pets, gate codes, HOA restrictions, access instructions)
- Communication log (calls, texts, emails)

**Job Record:**
- Job type and priority
- Assigned technician(s)
- Estimated and actual duration
- Parts required and used
- Checklist completion status
- Media uploads (photos, videos)
- Customer digital signature
- Invoice linkage
- Internal notes

### 4.3 Install & Service Checklists
- Dynamic checklists based on job type
- Required photo capture per checklist step
- Auto-flagging of incomplete or skipped steps
- Supervisor review and approval workflow
- Digital sign-off by technician and customer

**Standard Install Checklist Items:**
- [ ] Venting verified and documented
- [ ] Clearances confirmed (per manufacturer specs)
- [ ] Gas pressure tested (inlet and manifold)
- [ ] Electrical connections checked
- [ ] Burn-in completed (minimum time logged)
- [ ] Customer walkthrough completed
- [ ] Before photos captured
- [ ] After photos captured
- [ ] Serial number recorded
- [ ] Warranty card submitted

**Standard Service Checklist Items:**
- [ ] Unit inspection completed
- [ ] Pilot assembly cleaned
- [ ] Burner and logs inspected
- [ ] Glass cleaned and inspected
- [ ] Venting inspected
- [ ] Gas pressure verified
- [ ] Safety shutoff tested
- [ ] Customer demonstration completed

### 4.4 Billing & Payments
- Estimate creation with line items (labor, parts, trip fee)
- Customer digital estimate approval
- Automatic invoice generation on job completion
- Partial payments and deposit collection
- Payment methods: Credit card, ACH, financing
- QuickBooks Online sync (two-way)
- Payment reminders and overdue alerts
- Revenue reporting by job type, tech, and period

### 4.5 Parts & Inventory (Phase 2)
- Attach parts to job records
- Track serialized items (linked to specific fireplace units)
- Truck inventory management per technician
- Low inventory alerts
- Parts linked to installs for future service reference
- Supplier purchase order generation

### 4.6 Reporting & Analytics
- Jobs completed per technician (daily/weekly/monthly)
- Average install time by job type
- Revenue per job type and technician
- Callback and warranty claim rates
- Checklist compliance rates
- Photo documentation completion rates
- Customer satisfaction scores
- Recurring revenue from service plans

---

## 5. AI Features

| Feature | Description |
|---------|-------------|
| Smart Job Notes | Auto-summarize technician notes into professional customer-facing summaries |
| Missing Step Detection | Flag checklist items likely missed based on job type and duration |
| Photo Classification | Auto-tag uploaded photos (before/after, venting, gas connection, unit) |
| Install Time Prediction | Predict job duration based on unit type, address history, and tech performance |
| Customer Chatbot | FAQ bot for appointment status, service questions, and estimate follow-up |
| Anomaly Detection | Flag jobs with unusual patterns (too short, missing photos, no signature) |

---

## 6. Technical Requirements

### 6.1 Platform
- Web app (office/admin): Next.js, responsive
- Mobile app (technicians): React Native (iOS + Android)
- Customer portal: Web (mobile-responsive)

### 6.2 Infrastructure
- Cloud-hosted (AWS or Vercel + PlanetScale/Neon)
- Microservice-ready architecture
- API-first (REST + WebSocket for real-time)
- CDN for media storage (Cloudflare R2 or AWS S3)

### 6.3 Security
- Role-based access control (RBAC)
- JWT authentication with refresh tokens
- Data encryption at rest and in transit
- Audit logging for all sensitive actions
- SOC 2 Type II roadmap

### 6.4 Integrations
- QuickBooks Online (accounting sync)
- Stripe (payments)
- Twilio (SMS notifications)
- SendGrid (email)
- Google Maps API (routing, travel time)
- OpenAI API (AI features)

### 6.5 Offline & Mobile
- Service worker / local SQLite for offline job access
- Background sync when connectivity restored
- Photo upload queue with retry logic
- Push notifications (FCM/APNs)

---

## 7. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Page load time | < 2 seconds (P95) |
| Mobile app startup | < 3 seconds |
| API response time | < 200ms (P95) |
| Uptime | 99.9% SLA |
| Photo upload | Support up to 50MB per file |
| Concurrent users | 500+ without degradation |
| Data retention | 7 years (compliance) |

---

## 8. Success Metrics

| Metric | Target (Year 1) |
|--------|----------------|
| Checklist completion rate | > 95% |
| Invoice-to-payment time | < 3 days average |
| Tech time-to-first-job | < 2 minutes in app |
| Customer portal adoption | > 60% of customers |
| Callback rate reduction | 30% reduction vs. baseline |
| Photo documentation rate | 100% of installs |

---

## 9. Constraints & Assumptions

- Fireplace-specific: not a generic contractor app
- Must reflect install complexity, safety compliance, photo documentation, long-term service history
- Initial target: single-location companies (1–20 techs)
- Phase 3: multi-location, white-label SaaS
- Bun as package manager, Next.js 16 + React 19 + Tailwind CSS 4
