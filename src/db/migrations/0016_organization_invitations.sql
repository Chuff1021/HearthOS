create table if not exists organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email varchar(255) not null,
  name varchar(200),
  role varchar(30) not null,
  status varchar(30) not null default 'pending',
  clerk_invitation_id varchar(100) unique,
  invited_by_identity_id uuid references auth_identities(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_invitations_org
  on organization_invitations (org_id);
create index if not exists idx_organization_invitations_org_email
  on organization_invitations (org_id, email);
create index if not exists idx_organization_invitations_status
  on organization_invitations (status);
