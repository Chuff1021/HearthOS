# 🗄️ HearthOS — Database Schema

**Version:** 1.0  
**Database:** PostgreSQL (primary) + Redis (cache/sessions) + S3/R2 (media)

---

## Entity Relationship Overview

```
Organizations
    └── Users (roles: admin, dispatcher, technician, customer)
    └── Customers
            └── Properties
                    └── FireplaceUnits
                            └── ServiceHistory
    └── Jobs
            ├── JobAssignments (techs)
            ├── JobChecklists
            │       └── ChecklistItems
            │               └── ChecklistPhotos
            ├── JobParts
            ├── JobPhotos
            ├── JobNotes
            ├── JobSignatures
            └── Invoices
                    └── InvoiceLineItems
                    └── Payments
    └── Schedules
    └── ServicePlans
    └── Inventory
    └── AuditLogs
```

---

## Tables

### `organizations`
```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    phone           VARCHAR(20),
    email           VARCHAR(255),
    address         TEXT,
    logo_url        TEXT,
    timezone        VARCHAR(50) DEFAULT 'America/New_York',
    settings        JSONB DEFAULT '{}',
    subscription_tier VARCHAR(50) DEFAULT 'starter',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `users`
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) UNIQUE NOT NULL,
    phone           VARCHAR(20),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    role            VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'dispatcher', 'technician', 'customer')),
    avatar_url      TEXT,
    password_hash   TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    push_token      TEXT,
    preferences     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_role ON users(role);
```

### `customers`
```sql
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),  -- linked portal account (optional)
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(20),
    phone_alt       VARCHAR(20),
    source          VARCHAR(50),  -- referral, google, website, etc.
    tags            TEXT[],
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_org_id ON customers(org_id);
CREATE INDEX idx_customers_email ON customers(email);
```

### `properties`
```sql
CREATE TABLE properties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
    org_id          UUID REFERENCES organizations(id),
    label           VARCHAR(100) DEFAULT 'Primary',  -- Primary, Vacation Home, etc.
    address_line1   VARCHAR(255) NOT NULL,
    address_line2   VARCHAR(100),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(50) NOT NULL,
    zip             VARCHAR(20) NOT NULL,
    country         VARCHAR(50) DEFAULT 'US',
    lat             DECIMAL(10, 8),
    lng             DECIMAL(11, 8),
    access_notes    TEXT,  -- gate codes, HOA, pets, etc.
    is_primary      BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_customer_id ON properties(customer_id);
```

### `fireplace_units`
```sql
CREATE TABLE fireplace_units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID REFERENCES properties(id) ON DELETE CASCADE,
    org_id          UUID REFERENCES organizations(id),
    unit_type       VARCHAR(50) NOT NULL CHECK (unit_type IN (
                        'gas_insert', 'gas_fireplace', 'wood_burning', 
                        'electric', 'pellet', 'outdoor', 'firepit'
                    )),
    fuel_type       VARCHAR(30) CHECK (fuel_type IN ('natural_gas', 'propane', 'wood', 'electric', 'pellet')),
    brand           VARCHAR(100),
    model           VARCHAR(100),
    serial_number   VARCHAR(100),
    install_date    DATE,
    warranty_expiry DATE,
    location_in_home VARCHAR(100),  -- Living Room, Master Bedroom, etc.
    venting_type    VARCHAR(50),    -- direct_vent, b_vent, vent_free, etc.
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fireplace_units_property_id ON fireplace_units(property_id);
CREATE INDEX idx_fireplace_units_serial ON fireplace_units(serial_number);
```

### `jobs`
```sql
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    job_number      VARCHAR(20) UNIQUE NOT NULL,  -- e.g., JOB-2026-00142
    customer_id     UUID REFERENCES customers(id),
    property_id     UUID REFERENCES properties(id),
    fireplace_unit_id UUID REFERENCES fireplace_units(id),
    job_type        VARCHAR(50) NOT NULL CHECK (job_type IN (
                        'install', 'service', 'clean_burn', 'warranty', 
                        'estimate', 'emergency', 'inspection'
                    )),
    status          VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                        'draft', 'scheduled', 'confirmed', 'en_route', 
                        'on_site', 'in_progress', 'completed', 'invoiced', 
                        'paid', 'cancelled', 'callback'
                    )),
    priority        VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'emergency')),
    title           VARCHAR(255),
    description     TEXT,
    scheduled_start TIMESTAMPTZ,
    scheduled_end   TIMESTAMPTZ,
    actual_start    TIMESTAMPTZ,
    actual_end      TIMESTAMPTZ,
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    travel_time_minutes INTEGER,
    is_recurring    BOOLEAN DEFAULT FALSE,
    service_plan_id UUID,
    internal_notes  TEXT,
    completion_notes TEXT,
    requires_callback BOOLEAN DEFAULT FALSE,
    callback_reason TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_org_id ON jobs(org_id);
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled_start ON jobs(scheduled_start);
CREATE INDEX idx_jobs_job_type ON jobs(job_type);
```

### `job_assignments`
```sql
CREATE TABLE job_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    role            VARCHAR(50) DEFAULT 'lead' CHECK (role IN ('lead', 'helper', 'supervisor')),
    clocked_in_at   TIMESTAMPTZ,
    clocked_out_at  TIMESTAMPTZ,
    travel_started_at TIMESTAMPTZ,
    arrived_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_assignments_job_id ON job_assignments(job_id);
CREATE INDEX idx_job_assignments_user_id ON job_assignments(user_id);
```

### `checklist_templates`
```sql
CREATE TABLE checklist_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    job_type        VARCHAR(50) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    version         INTEGER DEFAULT 1,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `checklist_template_items`
```sql
CREATE TABLE checklist_template_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID REFERENCES checklist_templates(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL,
    category        VARCHAR(100),  -- Safety, Gas, Electrical, Documentation
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    is_required     BOOLEAN DEFAULT TRUE,
    requires_photo  BOOLEAN DEFAULT FALSE,
    requires_value  BOOLEAN DEFAULT FALSE,  -- e.g., gas pressure reading
    value_unit      VARCHAR(50),            -- e.g., "inWC", "PSI"
    value_min       DECIMAL,
    value_max       DECIMAL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `job_checklists`
```sql
CREATE TABLE job_checklists (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
    template_id     UUID REFERENCES checklist_templates(id),
    completed_by    UUID REFERENCES users(id),
    completed_at    TIMESTAMPTZ,
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    status          VARCHAR(30) DEFAULT 'in_progress' CHECK (status IN (
                        'in_progress', 'completed', 'flagged', 'approved'
                    )),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `job_checklist_items`
```sql
CREATE TABLE job_checklist_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_checklist_id UUID REFERENCES job_checklists(id) ON DELETE CASCADE,
    template_item_id UUID REFERENCES checklist_template_items(id),
    is_completed    BOOLEAN DEFAULT FALSE,
    is_na           BOOLEAN DEFAULT FALSE,
    value           VARCHAR(100),  -- recorded measurement
    notes           TEXT,
    completed_by    UUID REFERENCES users(id),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `job_photos`
```sql
CREATE TABLE job_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
    checklist_item_id UUID REFERENCES job_checklist_items(id),
    uploaded_by     UUID REFERENCES users(id),
    url             TEXT NOT NULL,
    thumbnail_url   TEXT,
    file_size_bytes INTEGER,
    mime_type       VARCHAR(50),
    photo_type      VARCHAR(50) CHECK (photo_type IN (
                        'before', 'after', 'venting', 'gas_connection', 
                        'electrical', 'unit', 'damage', 'other'
                    )),
    ai_tags         TEXT[],
    caption         TEXT,
    taken_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_photos_job_id ON job_photos(job_id);
```

### `job_signatures`
```sql
CREATE TABLE job_signatures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
    signer_name     VARCHAR(255) NOT NULL,
    signer_type     VARCHAR(30) CHECK (signer_type IN ('customer', 'technician', 'supervisor')),
    signature_url   TEXT NOT NULL,
    signed_at       TIMESTAMPTZ DEFAULT NOW(),
    ip_address      INET,
    device_info     TEXT
);
```

### `job_notes`
```sql
CREATE TABLE job_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
    author_id       UUID REFERENCES users(id),
    note_type       VARCHAR(30) DEFAULT 'internal' CHECK (note_type IN (
                        'internal', 'customer_visible', 'ai_summary', 'system'
                    )),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `invoices`
```sql
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    job_id          UUID REFERENCES jobs(id),
    customer_id     UUID REFERENCES customers(id),
    invoice_number  VARCHAR(20) UNIQUE NOT NULL,
    status          VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
                        'draft', 'sent', 'viewed', 'partial', 'paid', 
                        'overdue', 'void', 'refunded'
                    )),
    invoice_type    VARCHAR(20) DEFAULT 'invoice' CHECK (invoice_type IN ('estimate', 'invoice')),
    subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_rate        DECIMAL(5,4) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total           DECIMAL(10,2) NOT NULL DEFAULT 0,
    amount_paid     DECIMAL(10,2) DEFAULT 0,
    amount_due      DECIMAL(10,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
    due_date        DATE,
    sent_at         TIMESTAMPTZ,
    viewed_at       TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    approved_by_customer BOOLEAN DEFAULT FALSE,
    qbo_invoice_id  VARCHAR(100),  -- QuickBooks Online ID
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_job_id ON invoices(job_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
```

### `invoice_line_items`
```sql
CREATE TABLE invoice_line_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID REFERENCES invoices(id) ON DELETE CASCADE,
    sort_order      INTEGER DEFAULT 0,
    item_type       VARCHAR(30) CHECK (item_type IN ('labor', 'part', 'trip_fee', 'discount', 'other')),
    description     VARCHAR(500) NOT NULL,
    quantity        DECIMAL(10,3) DEFAULT 1,
    unit_price      DECIMAL(10,2) NOT NULL,
    total           DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    part_id         UUID,  -- references inventory.parts (Phase 2)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `payments`
```sql
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID REFERENCES invoices(id),
    org_id          UUID REFERENCES organizations(id),
    amount          DECIMAL(10,2) NOT NULL,
    payment_method  VARCHAR(30) CHECK (payment_method IN (
                        'credit_card', 'ach', 'cash', 'check', 'financing', 'other'
                    )),
    status          VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
                        'pending', 'processing', 'completed', 'failed', 'refunded'
                    )),
    stripe_payment_id VARCHAR(100),
    stripe_charge_id  VARCHAR(100),
    reference_number  VARCHAR(100),
    notes           TEXT,
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `service_plans`
```sql
CREATE TABLE service_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    customer_id     UUID REFERENCES customers(id),
    fireplace_unit_id UUID REFERENCES fireplace_units(id),
    plan_type       VARCHAR(50),  -- annual_maintenance, bi_annual, etc.
    price           DECIMAL(10,2),
    billing_cycle   VARCHAR(20) CHECK (billing_cycle IN ('monthly', 'annual')),
    start_date      DATE,
    next_service_date DATE,
    status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `inventory_items` (Phase 2)
```sql
CREATE TABLE inventory_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    sku             VARCHAR(100) UNIQUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    category        VARCHAR(100),
    unit_cost       DECIMAL(10,2),
    unit_price      DECIMAL(10,2),
    quantity_on_hand INTEGER DEFAULT 0,
    quantity_min    INTEGER DEFAULT 0,
    is_serialized   BOOLEAN DEFAULT FALSE,
    supplier        VARCHAR(255),
    supplier_sku    VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `job_parts`
```sql
CREATE TABLE job_parts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
    inventory_item_id UUID,  -- references inventory_items
    description     VARCHAR(255),
    quantity        DECIMAL(10,3) DEFAULT 1,
    unit_cost       DECIMAL(10,2),
    unit_price      DECIMAL(10,2),
    serial_number   VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `notifications`
```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    recipient_id    UUID REFERENCES users(id),
    type            VARCHAR(50),  -- job_assigned, tech_en_route, invoice_sent, etc.
    channel         VARCHAR(20) CHECK (channel IN ('push', 'sms', 'email', 'in_app')),
    title           VARCHAR(255),
    body            TEXT,
    data            JSONB,
    is_read         BOOLEAN DEFAULT FALSE,
    sent_at         TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `audit_logs`
```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
```

---

## Key Relationships Summary

| From | To | Relationship |
|------|----|-------------|
| Organization | Users | 1:Many |
| Organization | Customers | 1:Many |
| Customer | Properties | 1:Many |
| Property | FireplaceUnits | 1:Many |
| Customer | Jobs | 1:Many |
| Job | JobAssignments | 1:Many |
| Job | JobChecklists | 1:1 |
| JobChecklist | JobChecklistItems | 1:Many |
| JobChecklistItem | JobPhotos | 1:Many |
| Job | Invoices | 1:1 |
| Invoice | Payments | 1:Many |
| Customer | ServicePlans | 1:Many |
| FireplaceUnit | ServicePlans | 1:Many |

---

## Indexes Strategy

- All foreign keys indexed
- `jobs.scheduled_start` for calendar queries
- `jobs.status` for dashboard filters
- `customers.email` for search
- `fireplace_units.serial_number` for lookup
- `audit_logs(entity_type, entity_id)` for history queries
