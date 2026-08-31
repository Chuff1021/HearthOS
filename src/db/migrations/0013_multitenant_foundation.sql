-- Additive multi-tenant foundation. This migration intentionally does not
-- remove or rename any existing column, constraint, token, or storage path.

alter table organizations
  add column if not exists clerk_organization_id varchar(100),
  add column if not exists onboarding_status varchar(30) not null default 'legacy_active',
  add column if not exists data_version integer not null default 1;

create unique index if not exists organizations_clerk_organization_id_unique
  on organizations (clerk_organization_id)
  where clerk_organization_id is not null;

create table if not exists auth_identities (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id varchar(100) not null unique,
  primary_email varchar(255) not null,
  first_name varchar(100),
  last_name varchar(100),
  avatar_url text,
  platform_role varchar(30) not null default 'none',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_auth_identities_email on auth_identities (primary_email);
create index if not exists idx_auth_identities_platform_role on auth_identities (platform_role);

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  identity_id uuid not null references auth_identities(id) on delete cascade,
  employee_user_id uuid references users(id) on delete set null,
  role varchar(30) not null,
  status varchar(30) not null default 'active',
  permissions jsonb not null default '[]'::jsonb,
  invited_by_identity_id uuid references auth_identities(id) on delete set null,
  accepted_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_org_identity_unique unique (org_id, identity_id)
);

create index if not exists idx_organization_memberships_org on organization_memberships (org_id);
create index if not exists idx_organization_memberships_identity on organization_memberships (identity_id);
create index if not exists idx_organization_memberships_status on organization_memberships (status);

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider varchar(40) not null,
  external_account_id varchar(255) not null,
  external_account_name varchar(255),
  status varchar(30) not null default 'connected',
  scopes jsonb not null default '[]'::jsonb,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  connected_by_identity_id uuid references auth_identities(id) on delete set null,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_org_provider_account_unique
    unique (org_id, provider, external_account_id)
);

create index if not exists idx_integration_connections_org_provider
  on integration_connections (org_id, provider);
create index if not exists idx_integration_connections_status
  on integration_connections (status);

create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash varchar(64) not null unique,
  provider varchar(40) not null,
  org_id uuid not null references organizations(id) on delete cascade,
  identity_id uuid not null references auth_identities(id) on delete cascade,
  redirect_path text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_states_org_provider on oauth_states (org_id, provider);
create index if not exists idx_oauth_states_expires on oauth_states (expires_at);

create table if not exists onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  status varchar(30) not null default 'not_started',
  current_step varchar(50) not null default 'company',
  completed_steps jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_identity_id uuid not null references auth_identities(id) on delete cascade,
  subject_identity_id uuid references auth_identities(id) on delete set null,
  approved_by_identity_id uuid references auth_identities(id) on delete set null,
  reason text not null,
  access_mode varchar(30) not null default 'read_only',
  status varchar(30) not null default 'pending',
  starts_at timestamptz,
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_access_sessions_org on support_access_sessions (org_id);
create index if not exists idx_support_access_sessions_actor on support_access_sessions (actor_identity_id);
create index if not exists idx_support_access_sessions_status_expiry
  on support_access_sessions (status, expires_at);

alter table audit_logs
  add column if not exists actor_identity_id uuid references auth_identities(id) on delete set null,
  add column if not exists support_session_id uuid references support_access_sessions(id) on delete set null,
  add column if not exists request_id varchar(100),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Mark legacy runtime stores with the organization that currently owns every
-- row. Columns remain nullable until all writers have been converted.
do $$
declare
  target_table text;
  default_org_id uuid;
  tenant_tables text[] := array[
    'hearth_core_data_store',
    'hearth_jobs_store',
    'hearth_meeks_jobs_store',
    'hearth_payroll_reports',
    'hearth_time_edit_requests',
    'hearth_time_entries',
    'hearth_time_reminders',
    'hearth_timesheet_approvals',
    'tech_locations_live',
    'time_off_requests',
    'todos_live',
    'gabe_chat_sessions',
    'gabe_support_conversations'
  ];
begin
  select id into default_org_id
  from organizations
  where slug = 'default'
  order by created_at asc
  limit 1;

  if default_org_id is null then
    raise exception 'Default HearthOS organization is missing; refusing tenant backfill';
  end if;

  foreach target_table in array tenant_tables loop
    if to_regclass('public.' || target_table) is not null then
      execute format('alter table %I add column if not exists org_id uuid', target_table);
      execute format('update %I set org_id = $1 where org_id is null', target_table)
        using default_org_id;
      execute format('create index if not exists %I on %I (org_id)', 'idx_' || target_table || '_org_id', target_table);
    end if;
  end loop;
end $$;

insert into onboarding_progress (org_id, status, current_step, completed_steps, checklist, started_at)
select id, 'legacy_active', 'migration', '["existing_business"]'::jsonb,
  jsonb_build_object('productionBaselineCaptured', true), now()
from organizations
where slug = 'default'
on conflict (org_id) do nothing;
