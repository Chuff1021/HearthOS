create table if not exists payment_intents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  token_hash text not null unique,
  invoice_id uuid references invoices(id) on delete set null,
  invoice_number text not null,
  customer_name text,
  buyer_email text,
  amount numeric(14, 2) not null,
  currency text not null default 'USD',
  status text not null default 'open',
  expires_at timestamptz not null,
  paid_at timestamptz,
  square_payment_id text,
  created_by_identity_id uuid references auth_identities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_intents_org_created
  on payment_intents (org_id, created_at desc);
create index if not exists idx_payment_intents_org_invoice
  on payment_intents (org_id, invoice_id);
create index if not exists idx_payment_intents_expiry
  on payment_intents (status, expires_at);
