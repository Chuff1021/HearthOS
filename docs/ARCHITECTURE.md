# 🏗️ HearthOS — Backend Architecture

**Version:** 1.0

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Web App     │  │  Mobile App  │  │  Customer Portal     │  │
│  │  (Next.js)   │  │ (React Native│  │  (Next.js)           │  │
│  │  Office/Admin│  │  iOS/Android)│  │  Read-only + Pay     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼──────────────────────┼─────────────┘
          │                 │                       │
          └─────────────────┼───────────────────────┘
                            │ HTTPS / WSS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY / EDGE                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Cloudflare / Vercel Edge                               │   │
│  │  • Rate limiting                                        │   │
│  │  • DDoS protection                                      │   │
│  │  • SSL termination                                      │   │
│  │  • CDN for static assets                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                             │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Auth Service│  │  Core API    │  │  WebSocket Server    │  │
│  │  (JWT/OAuth) │  │  (REST)      │  │  (Real-time updates) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Job Service │  │  Invoice     │  │  Notification        │  │
│  │              │  │  Service     │  │  Service             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Media       │  │  AI Service  │  │  Reporting           │  │
│  │  Service     │  │  (OpenAI)    │  │  Service             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  PostgreSQL  │  │  Redis       │  │  Cloudflare R2 / S3  │  │
│  │  (Primary DB)│  │  (Cache +    │  │  (Photos, Videos,    │  │
│  │              │  │   Sessions)  │  │   Signatures, Docs)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL INTEGRATIONS                          │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │QuickBooks│ │  Stripe  │ │  Twilio  │ │  Google Maps API │  │
│  │  Online  │ │(Payments)│ │  (SMS)   │ │  (Routing/ETA)   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │SendGrid  │ │  OpenAI  │ │  FCM /   │                        │
│  │  (Email) │ │   (AI)   │ │  APNs    │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Service Breakdown

### Auth Service
- **Responsibility:** Authentication and authorization
- **Tech:** JWT (access + refresh tokens), bcrypt password hashing
- **Features:**
  - Login / logout / refresh token rotation
  - Role-based access control (RBAC)
  - SSO support (Google Workspace, future)
  - Session management via Redis
  - Audit logging of auth events

### Core API (REST)
- **Responsibility:** Primary business logic
- **Tech:** Next.js API Routes (MVP) → Node.js microservices (scale)
- **Endpoints:**
  ```
  /api/v1/
  ├── auth/          (login, logout, refresh)
  ├── users/         (CRUD, permissions)
  ├── customers/     (CRUD, search)
  ├── properties/    (CRUD)
  ├── fireplaces/    (CRUD, history)
  ├── jobs/          (CRUD, status, assign)
  ├── checklists/    (templates, job checklists)
  ├── photos/        (upload, tag, delete)
  ├── invoices/      (CRUD, send, pay)
  ├── payments/      (process, refund)
  ├── schedule/      (calendar, conflicts)
  ├── notifications/ (send, mark read)
  └── reports/       (analytics queries)
  ```

### WebSocket Server
- **Responsibility:** Real-time updates
- **Tech:** Socket.io or native WebSocket
- **Events:**
  ```
  job:status_changed    → Dispatcher sees live tech status
  tech:location_update  → Customer sees tech on map
  checklist:item_done   → Supervisor sees progress live
  notification:new      → Push to all connected clients
  invoice:paid          → Office notified instantly
  ```

### Job Service
- **Responsibility:** Job lifecycle management
- **Key Logic:**
  - Job number generation (JOB-YYYY-NNNNN)
  - Status machine enforcement
  - Conflict detection (tech double-booking)
  - Travel time calculation (Google Maps API)
  - Recurring job generation (service plans)
  - Callback job creation

### Invoice Service
- **Responsibility:** Billing and payments
- **Key Logic:**
  - Auto-invoice on job completion
  - Estimate → Invoice conversion
  - QuickBooks sync (webhook-based)
  - Stripe payment processing
  - Payment reminder scheduling
  - Overdue detection

### Media Service
- **Responsibility:** Photo/video/document management
- **Tech:** Cloudflare R2 (or AWS S3) + presigned URLs
- **Key Logic:**
  - Direct upload from mobile (presigned URL)
  - Image compression and thumbnail generation
  - AI photo classification (OpenAI Vision)
  - Organized by org/job/type
  - 7-year retention policy

### AI Service
- **Responsibility:** AI-powered features
- **Tech:** OpenAI API (GPT-4o + Vision)
- **Features:**
  - Job notes summarization
  - Photo classification and tagging
  - Missing checklist step detection
  - Install time prediction
  - Customer FAQ chatbot

### Notification Service
- **Responsibility:** All outbound communications
- **Channels:** Push (FCM/APNs), SMS (Twilio), Email (SendGrid), In-app
- **Key Logic:**
  - Template-based messages
  - Preference-aware (customer opt-outs)
  - Delivery tracking
  - Retry on failure

### Reporting Service
- **Responsibility:** Analytics and dashboards
- **Tech:** PostgreSQL aggregation queries + Redis caching
- **Reports:**
  - Revenue dashboards
  - Tech performance metrics
  - Checklist compliance rates
  - Job completion trends

---

## Data Flow: Job Completion

```
Tech taps "Complete Job" (mobile)
    │
    ▼
Mobile validates all required checklist items complete
    │
    ▼
POST /api/v1/jobs/{id}/complete
    │
    ├── Job Service: Update status → 'completed'
    │       └── Record actual_end timestamp
    │
    ├── Invoice Service: Auto-create invoice
    │       └── Pre-fill from estimate (if exists)
    │
    ├── Media Service: Finalize photo uploads
    │       └── Generate thumbnails
    │       └── Run AI classification
    │
    ├── Notification Service: Send alerts
    │       ├── Customer: "Job complete, invoice attached"
    │       └── Dispatcher: "Job #XXX completed"
    │
    ├── AI Service: Generate job summary
    │       └── Summarize tech notes → customer-friendly text
    │
    └── Audit Log: Record completion event
```

---

## Data Flow: Tech Location Tracking

```
Mobile app (background) → POST /api/v1/location
    │
    ▼
Location Service: Store in Redis (TTL: 5 min)
    │
    ▼
WebSocket broadcast → Dispatcher dashboard (live map)
    │
    ▼
If job status = 'en_route' AND customer tracking enabled:
    └── WebSocket → Customer portal (tech on map)
```

---

## Offline Sync Architecture

```
Mobile Device (SQLite)
    │
    ├── Job data pre-loaded on app open
    ├── Checklist items stored locally
    ├── Photos queued for upload
    └── Status changes queued

Connection restored:
    │
    ▼
Sync Queue Processor
    ├── Upload queued photos (presigned URLs)
    ├── POST checklist completions
    ├── POST status changes (with timestamps)
    └── Resolve conflicts (server timestamp wins)
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────┐
│  SECURITY LAYERS                                     │
│                                                      │
│  1. Edge: Cloudflare WAF + DDoS protection          │
│  2. Transport: TLS 1.3 everywhere                   │
│  3. Auth: JWT (15min access) + Refresh (30 days)    │
│  4. RBAC: Role checked on every API endpoint        │
│  5. Org isolation: org_id filter on all queries     │
│  6. Media: Presigned URLs (15min expiry)            │
│  7. Audit: All mutations logged                     │
│  8. Secrets: Environment variables (never in code)  │
└─────────────────────────────────────────────────────┘
```

---

## Multi-Tenancy Model

```
Organization (Tenant)
    │
    ├── All data scoped by org_id
    ├── Separate subdomain: {slug}.hearthOS.app
    ├── Custom branding (logo, colors)
    ├── Isolated user pools
    └── Shared infrastructure (Phase 1)
        └── Dedicated infrastructure (Phase 3, enterprise)
```

---

## Infrastructure (MVP)

| Component | Service | Notes |
|-----------|---------|-------|
| Web App | Vercel | Next.js deployment |
| Database | Neon (PostgreSQL) | Serverless Postgres |
| Cache | Upstash Redis | Serverless Redis |
| Media Storage | Cloudflare R2 | S3-compatible |
| CDN | Cloudflare | Global edge |
| Email | SendGrid | Transactional |
| SMS | Twilio | Notifications |
| Payments | Stripe | PCI compliant |
| Push Notifications | Firebase (FCM) | iOS + Android |
| AI | OpenAI API | GPT-4o + Vision |
| Monitoring | Sentry + Vercel Analytics | Error tracking |

---

## API Design Principles

1. **RESTful** with consistent naming (`/api/v1/resources/{id}/actions`)
2. **Pagination** on all list endpoints (`?page=1&limit=20`)
3. **Filtering** via query params (`?status=completed&tech_id=xxx`)
4. **Versioning** via URL prefix (`/api/v1/`, `/api/v2/`)
5. **Error format** consistent:
   ```json
   {
     "error": "VALIDATION_ERROR",
     "message": "Scheduled start must be in the future",
     "field": "scheduled_start"
   }
   ```
6. **Webhooks** for async events (QuickBooks, Stripe)
7. **Rate limiting**: 1000 req/min per org, 100 req/min per user

---

## Scalability Path

```
Phase 1 (MVP): Monolith on Vercel
    └── Next.js API routes
    └── Single PostgreSQL instance
    └── Works for 1-50 companies

Phase 2 (Growth): Service extraction
    └── Separate notification service
    └── Separate media service
    └── Read replicas for reporting
    └── Works for 50-500 companies

Phase 3 (Scale): Full microservices
    └── Kubernetes on AWS EKS
    └── Event-driven (Kafka/SQS)
    └── Dedicated DB per large tenant
    └── Works for 500+ companies
```
