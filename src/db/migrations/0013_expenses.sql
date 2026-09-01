create table if not exists hearth_expenses (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  submitted_by_clerk_user_id text not null,
  submitted_by_tech_id text,
  submitted_by_name text not null,
  submitted_by_email text,
  expense_date date not null,
  merchant text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category varchar(60) not null,
  allocation_type varchar(20) not null check (allocation_type in ('customer', 'stock_shop')),
  customer_id text,
  customer_name text,
  notes text,
  status varchar(20) not null default 'submitted' check (status in ('submitted', 'approved', 'reimbursed', 'rejected')),
  receipt_object_key text not null unique,
  receipt_file_name text not null,
  receipt_content_type varchar(120) not null,
  receipt_byte_size integer not null,
  receipt_checksum varchar(64) not null,
  receipt_etag text,
  reviewed_by_clerk_user_id text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hearth_expenses_customer_allocation check (
    (allocation_type = 'stock_shop' and customer_id is null and customer_name is null)
    or (allocation_type = 'customer' and customer_id is not null and customer_name is not null)
  )
);

create index if not exists hearth_expenses_org_created_idx on hearth_expenses (org_id, created_at desc);
create index if not exists hearth_expenses_org_status_idx on hearth_expenses (org_id, status, expense_date desc);
create index if not exists hearth_expenses_submitter_idx on hearth_expenses (org_id, submitted_by_clerk_user_id, created_at desc);
create index if not exists hearth_expenses_customer_idx on hearth_expenses (org_id, customer_id, expense_date desc);
