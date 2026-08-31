do $$
begin
  if to_regclass('public.gabe_chat_sessions') is null then
    create table gabe_chat_sessions (
      id text primary key,
      org_id uuid not null references organizations(id) on delete cascade,
      session_id text not null,
      ts timestamptz not null default now(),
      last_activity_at timestamptz not null default now(),
      status text not null default 'open',
      tech_id text,
      tech_name text,
      tech_email text,
      job_id text,
      job_number text,
      customer_name text,
      fireplace text,
      messages jsonb not null default '[]'::jsonb,
      duration integer,
      rating integer,
      flagged boolean default false,
      flag_reason text
    );
  else
    alter table gabe_chat_sessions add column if not exists org_id uuid references organizations(id) on delete cascade;
    update gabe_chat_sessions
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from gabe_chat_sessions where org_id is null) then
      raise exception 'Cannot assign existing GABE conversations to the legacy organization';
    end if;
    alter table gabe_chat_sessions alter column org_id set not null;
  end if;
end $$;

create index if not exists idx_gabe_sessions_org_activity
  on gabe_chat_sessions (org_id, last_activity_at desc);
create index if not exists idx_gabe_sessions_org_tech
  on gabe_chat_sessions (org_id, tech_id, last_activity_at desc);
create index if not exists idx_gabe_sessions_org_email
  on gabe_chat_sessions (org_id, tech_email, last_activity_at desc);
create index if not exists idx_gabe_sessions_org_status
  on gabe_chat_sessions (org_id, status, last_activity_at desc);

do $$
begin
  if to_regclass('public.gabe_run_metadata') is not null then
    alter table gabe_run_metadata add column if not exists org_id uuid references organizations(id) on delete cascade;
    update gabe_run_metadata
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from gabe_run_metadata where org_id is null) then
      raise exception 'Cannot assign existing GABE run metadata to the legacy organization';
    end if;
    alter table gabe_run_metadata alter column org_id set not null;
    create index if not exists idx_gabe_run_metadata_org_ts on gabe_run_metadata (org_id, ts desc);
  end if;

  if to_regclass('public.gabe_support_conversations') is not null then
    alter table gabe_support_conversations add column if not exists org_id uuid references organizations(id) on delete cascade;
    update gabe_support_conversations
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from gabe_support_conversations where org_id is null) then
      raise exception 'Cannot assign existing GABE support conversations to the legacy organization';
    end if;
    alter table gabe_support_conversations alter column org_id set not null;
    create index if not exists idx_gabe_support_org_created on gabe_support_conversations (org_id, ts desc);
  end if;
end $$;
