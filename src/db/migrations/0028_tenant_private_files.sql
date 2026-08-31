create table if not exists tenant_private_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  object_key text not null unique,
  file_name text not null,
  content_type text not null,
  byte_size integer not null,
  file_data bytea not null,
  source_type text not null,
  source_record_id text,
  created_by_identity_id uuid references auth_identities(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tenant_private_files_org_source_idx
  on tenant_private_files (org_id, source_type, source_record_id, created_at desc);

drop policy if exists hearthos_tenant_isolation on tenant_private_files;
create policy hearthos_tenant_isolation on tenant_private_files
  using (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
