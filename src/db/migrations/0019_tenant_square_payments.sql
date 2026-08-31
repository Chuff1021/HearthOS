create table if not exists tenant_square_payments (
  org_id uuid not null references organizations(id) on delete cascade,
  square_payment_id text not null,
  status text not null,
  amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  customer_name text,
  invoice_number text,
  source_type text,
  order_id text,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw jsonb,
  primary key (org_id, square_payment_id)
);

create index if not exists idx_tenant_square_payments_org_created
  on tenant_square_payments (org_id, created_at desc);
create index if not exists idx_tenant_square_payments_org_order
  on tenant_square_payments (org_id, order_id);
