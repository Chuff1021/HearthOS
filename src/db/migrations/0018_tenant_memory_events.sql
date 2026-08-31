create table if not exists tenant_memory_events (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  ts timestamptz not null default now(),
  entity text not null,
  action text not null check (action in ('create', 'update', 'delete')),
  entity_id text not null,
  summary text not null,
  payload jsonb
);

create index if not exists idx_tenant_memory_events_org_ts
  on tenant_memory_events (org_id, ts desc);
create index if not exists idx_tenant_memory_events_org_entity
  on tenant_memory_events (org_id, entity, entity_id, ts desc);
