create table if not exists gabe_source_registry (
  source_id text primary key,
  source_type text not null,
  manufacturer text,
  publisher text,
  title text not null,
  model text,
  family text,
  size text,
  document_kind text,
  revision text,
  publication_date date,
  effective_date date,
  jurisdiction_scope text,
  source_url text not null,
  checksum text,
  ingest_status text not null default 'discovered',
  confidence double precision not null default 0,
  supersedes_source_id text,
  superseded_by_source_id text,
  last_checked_at timestamptz,
  next_recheck_at timestamptz,
  activation_status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gsr_type_status on gabe_source_registry (source_type, ingest_status, activation_status);
create index if not exists idx_gsr_model_family on gabe_source_registry (manufacturer, model, family);
create index if not exists idx_gsr_recheck on gabe_source_registry (next_recheck_at);

create table if not exists gabe_source_review_queue (
  queue_id text primary key,
  source_id text not null,
  reason text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  assigned_to text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gsrq_status on gabe_source_review_queue (status, severity);

create table if not exists gabe_jurisdiction_registry (
  jurisdiction_id text primary key,
  country text,
  state text,
  county text,
  city text,
  service_area text,
  adopted_code_family text,
  adopted_code_edition text,
  effective_date date,
  reference_source_id text,
  confidence double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gjr_lookup on gabe_jurisdiction_registry (country, state, county, city);
