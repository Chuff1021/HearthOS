do $$
begin
  if to_regclass('public.hearth_time_entries') is null then
    create table hearth_time_entries (
      id text primary key,
      org_id uuid not null references organizations(id) on delete cascade,
      tech_id text not null,
      tech_name text,
      clock_in_at timestamptz not null,
      clock_out_at timestamptz,
      total_minutes integer,
      status text not null,
      edited boolean not null default false,
      edit_note text,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  else
    alter table hearth_time_entries add column if not exists org_id uuid references organizations(id) on delete cascade;
    update hearth_time_entries
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from hearth_time_entries where org_id is null) then
      raise exception 'Cannot assign existing time entries to the legacy organization';
    end if;
    alter table hearth_time_entries alter column org_id set not null;
  end if;
end $$;

create index if not exists idx_hearth_time_entries_org_clock
  on hearth_time_entries (org_id, clock_in_at desc);
create index if not exists idx_hearth_time_entries_org_tech
  on hearth_time_entries (org_id, tech_id, clock_in_at desc);
create index if not exists idx_hearth_time_entries_org_status
  on hearth_time_entries (org_id, status, clock_in_at desc);
