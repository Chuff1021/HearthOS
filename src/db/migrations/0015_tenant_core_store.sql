-- Parallel tenant-owned storage for the legacy combined customer/invoice
-- document. The original table remains intact for rollback compatibility.

create table if not exists hearth_core_data_store_tenant (
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

insert into hearth_core_data_store_tenant (org_id, key, payload, created_at, updated_at)
select o.id, legacy.key, legacy.payload, legacy.created_at, legacy.updated_at
from hearth_core_data_store legacy
cross join lateral (
  select id from organizations where slug = 'default' order by created_at asc limit 1
) o
on conflict (org_id, key) do nothing;
