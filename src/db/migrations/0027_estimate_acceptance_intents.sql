create table if not exists estimate_acceptance_intents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  token_hash text not null unique,
  estimate_reference text not null,
  status text not null default 'open',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by_identity_id uuid references auth_identities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_acceptance_intents_org_id_idx
  on estimate_acceptance_intents (org_id);
create index if not exists estimate_acceptance_intents_expires_at_idx
  on estimate_acceptance_intents (expires_at);

drop policy if exists hearthos_tenant_isolation on estimate_acceptance_intents;
create policy hearthos_tenant_isolation on estimate_acceptance_intents
  using (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
