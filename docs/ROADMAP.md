# 🗺️ HearthOS — MVP & Roadmap

**Version:** 1.0

---

## 🚀 MVP — 90-Day Build Plan

### Sprint 0: Foundation (Days 1–7)
- [ ] Project setup (Next.js, TypeScript, Tailwind, Bun)
- [ ] Database setup (PostgreSQL via Neon)
- [ ] Authentication system (JWT, RBAC)
- [ ] Base UI component library
- [ ] CI/CD pipeline (GitHub Actions → Vercel)
- [ ] Environment configuration

### Sprint 1: Customer & Job Core (Days 8–21)
- [ ] Customer CRUD (create, view, edit, search)
- [ ] Property management
- [ ] Fireplace unit records
- [ ] Job creation and editing
- [ ] Job types and status machine
- [ ] Basic job list and detail views

### Sprint 2: Scheduling & Dispatch (Days 22–35)
- [ ] Calendar view (daily/weekly)
- [ ] Drag-and-drop job scheduling
- [ ] Tech assignment
- [ ] Conflict detection
- [ ] Dispatch board (map + timeline)
- [ ] Job confirmation notifications (SMS/email)

### Sprint 3: Mobile Tech App (Days 36–56)
- [ ] React Native project setup
- [ ] Today's jobs screen
- [ ] Job detail view
- [ ] Status transitions (On Way → On Site → Working → Done)
- [ ] Dynamic checklist system
- [ ] Photo capture and upload
- [ ] Customer signature capture
- [ ] Basic offline mode (SQLite)
- [ ] Push notifications

### Sprint 4: Billing & Invoicing (Days 57–70)
- [ ] Estimate creation
- [ ] Invoice generation (auto on job complete)
- [ ] Line item management (labor, parts, trip fee)
- [ ] Stripe payment integration
- [ ] Customer payment portal (web)
- [ ] Invoice email/SMS delivery
- [ ] Basic QuickBooks Online sync

### Sprint 5: Customer Portal & Polish (Days 71–84)
- [ ] Customer portal (appointment view)
- [ ] Estimate approval flow
- [ ] Invoice payment flow
- [ ] Service history view
- [ ] Tech ETA notifications
- [ ] Admin dashboard (key metrics)
- [ ] Bug fixes and performance

### Sprint 6: Launch Prep (Days 85–90)
- [ ] Security audit
- [ ] Load testing
- [ ] Onboarding flow (setup wizard)
- [ ] Documentation
- [ ] Beta customer onboarding
- [ ] Monitoring and alerting setup

---

## MVP Feature Checklist

### ✅ Must Have (MVP)

| Feature | Priority | Effort |
|---------|----------|--------|
| Customer profiles | P0 | M |
| Property + fireplace records | P0 | M |
| Job creation and management | P0 | L |
| Scheduling calendar | P0 | L |
| Tech assignment | P0 | S |
| Mobile: Today's jobs | P0 | M |
| Mobile: Job status updates | P0 | S |
| Mobile: Checklist completion | P0 | L |
| Mobile: Photo capture | P0 | M |
| Mobile: Customer signature | P0 | M |
| Invoice generation | P0 | M |
| Stripe payments | P0 | M |
| SMS/email notifications | P0 | M |
| Role-based access control | P0 | M |
| Admin dashboard | P0 | M |

### 🔶 Should Have (MVP+)

| Feature | Priority | Effort |
|---------|----------|--------|
| Drag-and-drop dispatch board | P1 | L |
| Customer portal | P1 | L |
| QuickBooks sync | P1 | L |
| Offline mode (full) | P1 | L |
| Estimate approval flow | P1 | M |
| Recurring service plans | P1 | M |
| Tech GPS tracking | P1 | M |
| Conflict detection | P1 | M |
| Reporting dashboard | P1 | M |

### 🔷 Nice to Have (Post-MVP)

| Feature | Priority | Effort |
|---------|----------|--------|
| AI job notes summarization | P2 | M |
| AI photo classification | P2 | M |
| Install time prediction | P2 | L |
| Customer chatbot | P2 | L |
| Parts/inventory management | P2 | XL |
| Financing integration | P2 | L |
| Multi-location support | P2 | XL |

---

## Phase 2 — Growth (Months 4–9)

### 2.1 Parts & Inventory Management
- Inventory item catalog
- Attach parts to jobs
- Truck inventory per tech
- Serialized item tracking
- Low stock alerts
- Supplier purchase orders
- Parts linked to fireplace units for future service

### 2.2 Advanced Scheduling
- Route optimization (multi-stop)
- Skill-based tech matching
- Capacity planning view
- Emergency job insertion
- Recurring job automation
- Seasonal scheduling templates

### 2.3 Enhanced AI Features
- Smart job notes summarization (production)
- Photo auto-classification (before/after/venting/gas)
- Missing checklist step detection
- Install time prediction by unit type + tech
- Anomaly detection (too-short jobs, missing photos)

### 2.4 Customer Experience Upgrades
- Customer mobile app (iOS/Android)
- Real-time tech tracking on map
- In-app messaging with office
- Service plan self-enrollment
- Warranty registration portal
- Review/rating system

### 2.5 Advanced Reporting
- Custom report builder
- Scheduled report emails
- Tech performance scorecards
- Revenue forecasting
- Callback root cause analysis
- Warranty claim trends

### 2.6 Integrations Expansion
- Financing (Wisetack, GreenSky)
- Google Calendar sync
- Outlook Calendar sync
- Zapier / Make webhooks
- Twilio Voice (call logging)
- Review platforms (Google, Yelp)

### 2.7 Compliance & Safety
- NFPA 54/58 checklist templates
- Permit tracking per job
- Inspection scheduling
- Safety incident reporting
- Compliance report generation

---

## Phase 3 — Scale & White-Label (Months 10–18)

### 3.1 Multi-Location Support
- Organization hierarchy (parent + branches)
- Cross-location job assignment
- Consolidated reporting
- Location-specific pricing
- Shared customer records
- Inter-location inventory transfers

### 3.2 White-Label SaaS Platform
- Custom domain per tenant
- Full branding customization (logo, colors, fonts)
- Custom email templates
- Branded customer portal
- Reseller partner portal
- Usage-based billing for resellers
- Tenant provisioning API

### 3.3 Enterprise Features
- SSO (SAML, Google Workspace, Azure AD)
- Advanced RBAC (custom roles)
- API access for integrations
- Dedicated infrastructure option
- SLA guarantees
- Dedicated account manager

### 3.4 Marketplace & Ecosystem
- App marketplace (third-party integrations)
- Public API + developer docs
- Webhook builder (no-code)
- Custom checklist template marketplace
- Industry-specific add-ons

### 3.5 Advanced AI
- Predictive maintenance scheduling
- Customer churn prediction
- Dynamic pricing recommendations
- Voice-to-notes (tech dictation)
- Automated customer follow-up sequences
- AI-powered dispatch optimization

### 3.6 Financial Suite
- Built-in financing origination
- Subscription billing management
- Revenue recognition reporting
- Multi-currency support
- Tax calculation (TaxJar/Avalara)
- Advanced QuickBooks + Xero sync

---

## Technology Evolution

| Phase | Frontend | Backend | Database | Infrastructure |
|-------|----------|---------|----------|----------------|
| MVP | Next.js 16 | Next.js API Routes | Neon PostgreSQL | Vercel |
| Phase 2 | Next.js + React Native | Node.js services | PostgreSQL + Redis | Vercel + Railway |
| Phase 3 | Next.js + React Native | Microservices | PostgreSQL cluster | AWS EKS |

---

## Revenue Model

| Tier | Price | Users | Features |
|------|-------|-------|---------|
| Starter | $149/mo | Up to 3 techs | Core FSM, basic reporting |
| Growth | $299/mo | Up to 10 techs | + Inventory, AI features |
| Pro | $599/mo | Up to 25 techs | + Multi-location, advanced AI |
| Enterprise | Custom | Unlimited | + White-label, dedicated infra |

**Add-ons:**
- Additional tech seats: $29/tech/mo
- Customer portal: $49/mo
- AI features pack: $99/mo
- QuickBooks sync: $29/mo

---

## Competitive Positioning

| Feature | HearthOS | ServiceTitan | Jobber | Housecall Pro |
|---------|----------|-------------|--------|---------------|
| Fireplace-specific checklists | ✅ | ❌ | ❌ | ❌ |
| Gas pressure recording | ✅ | ❌ | ❌ | ❌ |
| Fireplace unit history | ✅ | ❌ | ❌ | ❌ |
| Photo classification AI | ✅ | ❌ | ❌ | ❌ |
| Burn-in documentation | ✅ | ❌ | ❌ | ❌ |
| Warranty tracking per unit | ✅ | ❌ | ❌ | ❌ |
| Price (small company) | $149/mo | $398/mo+ | $49/mo | $65/mo |
| Mobile offline mode | ✅ | ✅ | ✅ | ✅ |
| QuickBooks sync | ✅ | ✅ | ✅ | ✅ |
