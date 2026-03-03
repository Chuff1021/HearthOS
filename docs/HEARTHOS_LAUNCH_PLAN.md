# HEARTHOS LAUNCH PLAN
## Premium White-Label SaaS Execution Plan

**Version:** 1.0  
**Date:** 2026-03-03  
**Scope:** Finish, operationalize, and launch HearthOS as a premium multi-tenant white-label SaaS platform for fireplace manufacturers, dealer networks, and service partners.

---

## 0) Executive Outcome

HearthOS should launch as a **multi-tenant, enterprise-ready platform** that supports:
- Distinct branded experiences per tenant (manufacturer/dealer/reseller)
- Secure tenant isolation with configurable region and compliance posture
- Premium “liquid glass” UI language with strong accessibility and mobile parity
- Repeatable tenant provisioning + go-live operations
- Partner-readiness for large OEM-style manufacturers (Travis/Kozy Heat analogs)

**Primary launch KPIs (first 90 days post-GA):**
- Time-to-provision new tenant: **< 2 hours** (self-serve + assisted)
- White-label implementation cycle: **< 10 business days** per enterprise brand
- Uptime SLO: **99.9%** platform, **99.95%** enterprise tier
- P1 MTTR: **< 60 minutes**
- Accessibility conformance: **WCAG 2.2 AA** on customer-critical workflows
- Pilot-to-paid conversion: **> 60%**

---

## 1) Multi-Tenant White-Label Architecture

### 1.1 Tenancy model

Use a **hybrid model**:
1. **Shared control plane** (identity, billing, feature flags, deployment pipeline)
2. **Tenant-scoped data plane** with row-level tenancy for SMB/mid-market
3. **Dedicated database + isolated runtime option** for enterprise manufacturers

This provides cost efficiency for most accounts while preserving an enterprise isolation path.

### 1.2 Tenant hierarchy

Model partner organizations in a nested hierarchy:
- **Platform Owner (HearthOS)**
- **Manufacturer Tenant (Parent)**
- **Dealer/Branch Sub-tenants (Child orgs)**
- **End users** (admin, dispatcher, tech, customer portal users)

Support inheritance with override precedence:
1. Platform defaults
2. Manufacturer-level policy/theme
3. Dealer-level overrides
4. User preferences

### 1.3 Domain and brand architecture

- Vanity domain per tenant (e.g., `service.brand.com`)
- Automatic TLS issuance/renewal
- Branded login, portal, invoice templates, communications
- Region-specific content + legal footer injection
- Email/SMS sender identity by tenant (DKIM/SPF verified)

### 1.4 Configuration architecture (white-label engine)

Create a centralized **Tenant Configuration Service** with versioned schemas:
- Brand tokens (color, typography, radii, shadows, blur depth)
- Asset pack (logos, favicons, app icons, splash screens)
- Content dictionary (copy tone, labels, CTA text)
- Feature flags (module enablement by tier)
- Compliance policies (retention, consent text, disclosure)
- Integration settings (Stripe/Twilio/QuickBooks/webhooks)

**Storage strategy:**
- Immutable config versions + rollback
- Promotion path: draft → staging → production
- Audit trail for all brand/config changes

### 1.5 Security and data isolation

- Tenant-aware auth context on every request
- Row-Level Security + enforced `tenant_id` checks
- Encryption at rest/in transit; scoped secrets per tenant
- Audit logging for sensitive actions (auth, billing, exports, admin changes)
- SSO (SAML/OIDC) for enterprise tenants
- SCIM (phase 2) for enterprise identity lifecycle

### 1.6 Service decomposition (target-state)

- **Gateway/Edge**: routing, WAF, rate limits, tenant domain mapping
- **Identity Service**: JWT/session, SSO, RBAC/ABAC, tenant claims
- **Tenant Config Service**: brand/theme/config retrieval + versioning
- **Core Operations API**: customers, jobs, scheduling, checklists, invoicing
- **Media Service**: tenant-scoped storage and CDN policy
- **Notification Service**: tenant templates + deliverability controls
- **Billing Service**: subscription + usage metering + partner rev-share
- **Observability Service**: tenant-level SLO and performance segmentation

### 1.7 Data and analytics strategy

- OLTP: tenant-scoped transactional DB
- Analytics: event stream → warehouse model with tenant partitions
- Dashboards: platform-wide plus tenant-isolated insights
- Data residency and retention policies by region/tier

---

## 2) Visual System Plan — “Liquid Glass” Premium Aesthetic

### 2.1 Design principles

1. **Depth without clutter** (layered translucency and soft elevation)
2. **Motion with intent** (physics-like transitions, never decorative noise)
3. **Context clarity** (state and hierarchy always obvious)
4. **Accessible premium** (contrast, focus, motion reduction respected)

### 2.2 Token architecture

Implement a structured token system (global → semantic → component):

**Global tokens**
- Color primitives (neutral scale + accent families)
- Elevation levels
- Blur levels (`glass-sm`, `glass-md`, `glass-lg`)
- Radius scale
- Spacing scale
- Typography scale
- Motion duration/easing curves

**Semantic tokens**
- `surface/base`, `surface/elevated`, `surface/glass`
- `text/primary`, `text/secondary`, `text/inverse`
- `action/primary`, `action/secondary`, `action/destructive`
- `state/success|warning|error|info`

**Brand override tokens**
- `brand/accent`
- `brand/cta`
- `brand/highlight`
- `brand/logo-safe-bg`

### 2.3 Component system (priority set)

Build a “glass-ready” component library with strict states:
- Top nav / side rail / command bar
- Card system (standard, glass, interactive)
- Data table with sticky headers + density modes
- Scheduler/calendar blocks
- Job timeline and activity feed
- Modal/sheet/drawer with depth transitions
- Toast + alert center
- Inputs, selects, comboboxes, segmented controls
- KPI tiles/charts with adaptive contrast

Each component includes:
- Base + brand overrides
- Keyboard interactions
- Screen-reader labels and ARIA contracts
- Motion variants (`default`, `reduced`, `none`)

### 2.4 Motion language

Define a motion spec:
- Micro-interactions: 120–180ms
- Standard transitions: 200–280ms
- Context/route transitions: 300–420ms
- Easing: spring-like for entry; ease-out for settle

Motion patterns:
- Layer reveal (blur + fade + slight scale)
- Shared-element transitions for task continuity
- Skeleton-to-content morph for perceived speed
- Respect `prefers-reduced-motion` globally

### 2.5 Accessibility requirements (non-negotiable)

- WCAG 2.2 AA contrast in all themes
- Visible focus indicators across glass surfaces
- Keyboard-only complete task flow coverage
- SR-friendly labels/landmarks for schedule/job/invoice flows
- Reduced transparency mode for low-vision users
- Motion reduction + cognitive load minimization

### 2.6 Visual QA gates

- Design token lint checks
- Snapshot regression for top 30 screens
- Accessibility CI checks (axe/Lighthouse + manual SR audits)
- Cross-browser rendering baselines (Safari, Chrome, Edge)

---

## 3) Build Phases, Milestones, and Swarm Staffing

## 3.1 Program structure

**Total timeline:** ~24 weeks to GA + 8-week partner expansion wave.

### Phase 0 — Program Mobilization (Week 1)
**Milestones**
- Finalize launch scope and KPI targets
- Confirm enterprise vs shared tenancy requirements
- Establish architecture decision records (ADRs)

**Swarm staffing**
- Final Orchestrator Reviewer (lead)
- Ecomm Site Analyzer (repurposed as product/current-state analyzer)
- Deployment Ops pod

### Phase 1 — Multi-Tenant Foundation (Weeks 2–7)
**Milestones**
- Tenant model + hierarchy implemented
- Tenant config service (versioned)
- Domain + TLS automation
- RBAC and auth tenancy hardening
- Baseline observability with tenant tags

**Swarm agents**
- Implementation & Animation Engineer (platform/core)
- White-Label Packager & Deployer
- QA & Performance Tester

**Exit criteria**
- New tenant can be created end-to-end in staging
- Hard isolation tests pass
- Tenant-specific branding loads at runtime

### Phase 2 — Premium Visual System (Weeks 5–10, overlaps)
**Milestones**
- Token system complete (global/semantic/brand)
- Component library v1 shipped
- Motion framework + reduced-motion mode
- Accessibility baseline pass on core workflows

**Swarm agents**
- Premium Brand Customizer & Designer (lead)
- Implementation & Animation Engineer
- QA & Performance Tester (a11y/perf)

**Exit criteria**
- 20+ critical components production-ready
- WCAG AA pass on top 10 workflows
- Brand override pack deployable without code edits

### Phase 3 — SaaS Commercial Readiness (Weeks 8–14)
**Milestones**
- Subscription packaging + usage metering
- Tenant onboarding wizard
- Integration setup flows (payments/comms/accounting)
- Support/admin console (impersonation w/ audit)

**Swarm agents**
- E-commerce Generator (repurposed as portal/scaffold automation)
- Content + SEO + Conversion Optimizer (onboarding copy + lifecycle messaging)
- White-Label Packager & Deployer

**Exit criteria**
- Assisted and self-serve onboarding paths validated
- Billing and entitlement logic complete
- Admin runbook v1 approved

### Phase 4 — Reliability, Security, and Compliance (Weeks 12–18)
**Milestones**
- Incident response and runbooks
- Backup/restore and DR exercises
- Pen-test remediation sprint
- SLOs and alerting tuned

**Swarm agents**
- QA & Performance Tester (load/chaos)
- Deployment Ops
- Final Orchestrator Reviewer

**Exit criteria**
- SLO burn alerts operational
- DR test achieves target RTO/RPO
- Critical security findings resolved

### Phase 5 — Partner Pilots and GA (Weeks 18–24)
**Milestones**
- 2–3 flagship partner pilots onboarded
- Partner-specific themes/integrations live
- Go-live checklist complete
- Sales enablement + support handoff done

**Swarm agents**
- Premium Brand Customizer & Designer (partner kits)
- White-Label Packager & Deployer (launch ops)
- Content + SEO + Conversion Optimizer (docs/training)
- Final Orchestrator Reviewer (sign-off)

**Exit criteria**
- Pilot success metrics achieved
- No unresolved launch-blocker severity defects
- GA approval by product/engineering/ops

## 3.2 Suggested staffing model (human + swarm-aligned)

- **Program Lead / Product Owner:** 1
- **Tech Lead / Architect:** 1
- **Backend Engineers:** 3
- **Frontend Engineers:** 3
- **Mobile Engineer:** 1
- **Design Systems + Product Designer:** 2
- **DevOps/SRE:** 2
- **QA + Accessibility Specialist:** 2
- **Security Engineer (fractional or contract):** 1
- **Partner Solutions Engineer:** 2
- **Customer Success + Enablement:** 2

---

## 4) Deployment and Go-Live Checklist

## 4.1 Environment and release readiness
- [ ] Dev/staging/prod parity validated
- [ ] IaC reviewed and drift-free
- [ ] Secrets rotated and vaulted
- [ ] Feature flags mapped by launch wave
- [ ] Rollback plan and canary strategy approved

## 4.2 Data and tenant operations
- [ ] Tenant provisioning automation tested
- [ ] Seed data/templates validated per tier
- [ ] Migration scripts tested with production-like data
- [ ] Backup cadence and restore drills passed
- [ ] Data retention/deletion workflows validated

## 4.3 Security/compliance
- [ ] SSO/SAML tested for enterprise tenants
- [ ] RBAC matrix verified per role/persona
- [ ] Pen-test high/critical items closed
- [ ] Audit log export available
- [ ] Privacy/ToS/DPA artifacts finalized

## 4.4 Performance/reliability
- [ ] Load test at 2x expected launch traffic
- [ ] Queue backpressure and retry policies verified
- [ ] Alert routing and on-call schedule active
- [ ] Dashboard coverage for golden signals complete
- [ ] Synthetic uptime checks in place per key path

## 4.5 UX and support
- [ ] A11y pass on all launch workflows
- [ ] Mobile critical flows validated in field conditions
- [ ] Knowledge base + SOPs + escalation playbooks complete
- [ ] In-app guided onboarding enabled
- [ ] Support team launch simulation complete

## 4.6 Launch day runbook
- [ ] T-7 day go/no-go review
- [ ] T-24h release freeze + final smoke tests
- [ ] T-0 staged rollout (internal → pilot → broad)
- [ ] War room staffed (engineering/product/support)
- [ ] T+24h and T+7d post-launch reviews

---

## 5) Partner-Readiness Plan (Large Manufacturer/OEM Channels)

## 5.1 Partner program tiers

Define structured partner tiers:
- **Pilot Partner** (co-development + fast feedback)
- **Strategic Manufacturer** (volume pricing, roadmap influence)
- **Channel Network Partner** (dealer rollouts with enablement packs)

### 5.2 Enterprise partner requirements map

For Travis/Kozy Heat-style partner profiles, commit to:
- Parent-child tenant hierarchy for corporate/dealer networks
- Brand governance (locked core + dealer-level bounded overrides)
- Multi-location reporting and SLA-backed support
- Compliance and document retention controls
- Integration pathways (ERP/accounting/CRM/webhooks)

### 5.3 Partner onboarding playbook

**Step 1: Discovery**
- Operating model, dealer network size, current stack, compliance constraints

**Step 2: Solution blueprint**
- Tenant topology, integration plan, rollout waves, risk register

**Step 3: Brand + experience package**
- Logo/color/typography ingestion
- Portal template + communication template setup

**Step 4: Technical enablement**
- SSO, domain cutover, data import, webhook/API setup

**Step 5: Pilot + adoption**
- Train-the-trainer, success metrics, support SLAs

### 5.4 Commercial and contractual readiness

- MSA + DPA templates with enterprise clauses
- SLA matrices (response and resolution targets)
- Security questionnaire response pack (standardized)
- Pricing model: base platform + seat + usage + optional dedicated infra
- Co-marketing/case-study framework for flagship partners

### 5.5 Success and expansion framework

- 30/60/90-day adoption scorecards
- Executive business reviews (QBR cadence)
- Dealer rollout kit (playbooks, training decks, migration SOPs)
- Feature request intake + roadmap governance channel

---

## 6) Risks and Mitigations

1. **Risk:** White-label complexity causes release delays  
   **Mitigation:** Strict config boundaries; no per-tenant forks.

2. **Risk:** Enterprise security requirements emerge late  
   **Mitigation:** Early security architecture workshop + contract gating.

3. **Risk:** Design polish conflicts with performance/accessibility  
   **Mitigation:** Performance budgets + accessibility gates in CI.

4. **Risk:** Partner-specific asks fragment roadmap  
   **Mitigation:** Tiered product policy and weighted prioritization.

5. **Risk:** Onboarding burden slows partner activation  
   **Mitigation:** Repeatable provisioning templates + guided setup wizard.

---

## 7) Final Launch Decision Gates

GA approval requires all gates green:
- **Architecture Gate:** Multi-tenant isolation + config/versioning validated
- **Design Gate:** Liquid-glass system stable, accessible, and performant
- **Ops Gate:** SLOs, DR, on-call, and runbooks operational
- **Commercial Gate:** Billing, contracts, and partner onboarding assets complete
- **Pilot Gate:** At least 2 successful production pilots with measurable outcomes

When all gates pass, HearthOS transitions from MVP FSM tool to **premium white-label SaaS platform** ready for manufacturer-scale partnerships.
