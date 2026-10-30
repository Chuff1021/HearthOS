BEGIN;
CREATE TABLE IF NOT EXISTS hearth_cart_sessions (
  org_id uuid NOT NULL REFERENCES organizations(id), id uuid NOT NULL,
  session_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(), checkout_at timestamptz,
  contact_at timestamptz, called_at timestamptz, emptied_at timestamptz,
  items jsonb NOT NULL DEFAULT '[]', contact jsonb,
  PRIMARY KEY(org_id,id)
);
CREATE INDEX IF NOT EXISTS hearth_cart_sessions_recent ON hearth_cart_sessions(org_id,created_at);
CREATE INDEX IF NOT EXISTS hearth_cart_sessions_browser ON hearth_cart_sessions(org_id,session_hash);
COMMIT;
