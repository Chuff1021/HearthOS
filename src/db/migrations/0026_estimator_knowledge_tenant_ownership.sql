create table if not exists estimator_knowledge (
  id text not null,
  type text not null,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table estimator_knowledge
  add column if not exists org_id uuid;

update estimator_knowledge
set org_id = (select id from organizations where slug = 'default' order by created_at limit 1)
where org_id is null;

alter table estimator_knowledge
  alter column org_id set not null;

alter table estimator_knowledge
  drop constraint if exists estimator_knowledge_pkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'estimator_knowledge_org_id_id_key'
      and conrelid = 'estimator_knowledge'::regclass
  ) then
    alter table estimator_knowledge
      add constraint estimator_knowledge_org_id_id_key unique (org_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'estimator_knowledge_org_id_fkey'
      and conrelid = 'estimator_knowledge'::regclass
  ) then
    alter table estimator_knowledge
      add constraint estimator_knowledge_org_id_fkey
      foreign key (org_id) references organizations(id) on delete cascade;
  end if;
end $$;

create index if not exists estimator_knowledge_org_id_idx
  on estimator_knowledge (org_id);

drop policy if exists hearthos_tenant_isolation on estimator_knowledge;
create policy hearthos_tenant_isolation on estimator_knowledge
  using (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
