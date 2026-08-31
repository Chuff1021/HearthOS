alter table time_off_requests
  add column if not exists org_id uuid references organizations(id) on delete cascade;
update time_off_requests
  set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
  where org_id is null;
do $$
begin
  if exists (select 1 from time_off_requests where org_id is null) then
    raise exception 'Cannot assign existing time-off requests to the legacy organization';
  end if;
end $$;
alter table time_off_requests alter column org_id set not null;
create index if not exists idx_time_off_requests_org on time_off_requests (org_id, created_at desc);

do $$
begin
  if to_regclass('public.hearth_time_edit_requests') is null then
    create table hearth_time_edit_requests (
      id text primary key,
      org_id uuid not null references organizations(id) on delete cascade,
      tech_id text not null,
      tech_name text,
      entry_id text not null,
      requested_clock_in text,
      requested_clock_out text,
      reason text not null,
      status text not null default 'pending',
      reviewed_at timestamptz,
      reviewed_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  else
    alter table hearth_time_edit_requests add column if not exists org_id uuid references organizations(id) on delete cascade;
    update hearth_time_edit_requests
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from hearth_time_edit_requests where org_id is null) then
      raise exception 'Cannot assign existing time edit requests to the legacy organization';
    end if;
    alter table hearth_time_edit_requests alter column org_id set not null;
  end if;
end $$;

create index if not exists idx_time_edit_requests_org_created
  on hearth_time_edit_requests (org_id, created_at desc);
