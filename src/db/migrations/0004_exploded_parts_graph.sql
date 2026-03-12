create table if not exists fireplace_exploded_parts_graph (
  callout_id text primary key,
  manual_id text not null,
  model text,
  normalized_model text,
  family text,
  size text,
  figure_page_number int,
  figure_caption text,
  diagram_type text,
  callout_label text,
  part_number text,
  part_name text,
  compatibility_scope text,
  source_confidence double precision not null default 0,
  source_mode text not null default 'native_text',
  ocr_confidence double precision,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fepg_manual_model on fireplace_exploded_parts_graph (manual_id, normalized_model);
create index if not exists idx_fepg_part on fireplace_exploded_parts_graph (part_number, part_name);
