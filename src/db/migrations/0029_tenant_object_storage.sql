alter table tenant_private_files
  alter column file_data drop not null,
  add column if not exists storage_provider varchar(40) not null default 'database',
  add column if not exists checksum_sha256 varchar(64),
  add column if not exists etag text;

create index if not exists tenant_private_files_org_object_idx
  on tenant_private_files (org_id, object_key);
