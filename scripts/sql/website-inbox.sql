-- Apply this file alone after backup/rehearsal. No existing records are modified.
BEGIN;
CREATE TABLE IF NOT EXISTS hearth_website_inbox (
  org_id uuid NOT NULL REFERENCES organizations(id),
  source text NOT NULL,
  external_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('contact', 'order', 'service')),
  received_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','follow_up','closed')),
  follow_up_at date,
  revision integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, source, external_id)
);
CREATE INDEX IF NOT EXISTS hearth_website_inbox_received_idx
  ON hearth_website_inbox (org_id, source, received_at DESC, external_id);
CREATE TABLE IF NOT EXISTS hearth_website_inbox_activity (
  org_id uuid NOT NULL,
  source text NOT NULL,
  external_id uuid NOT NULL,
  action_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  follow_up_at date,
  note text NOT NULL,
  PRIMARY KEY (org_id, source, action_id),
  FOREIGN KEY (org_id, source, external_id)
    REFERENCES hearth_website_inbox (org_id, source, external_id)
);
CREATE TABLE IF NOT EXISTS hearth_website_inbox_sync (
  org_id uuid NOT NULL REFERENCES organizations(id),
  source text NOT NULL,
  cursor text,
  last_checked_at timestamptz,
  last_complete_at timestamptz,
  PRIMARY KEY (org_id, source)
);
COMMIT;
