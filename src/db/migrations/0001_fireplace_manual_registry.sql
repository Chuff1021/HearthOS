create table if not exists fireplace_manual_registry (
  manual_id text primary key,
  manufacturer text,
  brand text,
  model text,
  normalized_model text,
  family text,
  size text,
  fuel_type text,
  appliance_type text,
  manual_type text,
  language text,
  revision text,
  publication_date date,
  source_url text,
  local_file_path text,
  checksum text,
  aliases jsonb not null default '[]'::jsonb,
  chunk_collection text,
  chunk_namespace text,
  supersedes_manual_id text,
  superseded_by_manual_id text,
  status text not null default 'active',
  metadata_confidence double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fmr_mfg_model_type on fireplace_manual_registry (manufacturer, normalized_model, manual_type);
create index if not exists idx_fmr_family_size on fireplace_manual_registry (family, size);
create index if not exists idx_fmr_status_updated on fireplace_manual_registry (status, updated_at desc);
