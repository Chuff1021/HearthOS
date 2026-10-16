BEGIN;
CREATE TABLE IF NOT EXISTS hearth_parts (
  org_id uuid NOT NULL REFERENCES organizations(id), key text NOT NULL,
  sku text NOT NULL, source_id text NOT NULL, url text NOT NULL, catalog jsonb NOT NULL,
  offer jsonb, override jsonb, duplicate boolean NOT NULL DEFAULT false,
  pilot boolean NOT NULL DEFAULT false, last_attempt_at timestamptz, last_verified_at timestamptz,
  last_error text, next_scan_at timestamptz NOT NULL DEFAULT now(), active_until timestamptz,
  lease_until timestamptz, lease_token uuid, failures integer NOT NULL DEFAULT 0,
  PRIMARY KEY(org_id,key), UNIQUE(org_id,url)
);
CREATE INDEX IF NOT EXISTS hearth_parts_due ON hearth_parts(org_id,next_scan_at);
CREATE INDEX IF NOT EXISTS hearth_parts_sku ON hearth_parts(org_id,sku);
CREATE TABLE IF NOT EXISTS hearth_parts_history (
  id bigserial PRIMARY KEY, org_id uuid NOT NULL, key text NOT NULL,
  kind text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hearth_parts_scanner (
  org_id uuid PRIMARY KEY REFERENCES organizations(id), next_request_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz, last_discovery_at timestamptz, discovery_page integer NOT NULL DEFAULT 1,
  robots_checked_at timestamptz, robots_allowed boolean NOT NULL DEFAULT false,
  last_error text, discovered integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS hearth_parts_discovery (
  org_id uuid NOT NULL, url text NOT NULL, discovered_at timestamptz NOT NULL DEFAULT now(),
  reviewed boolean NOT NULL DEFAULT false, PRIMARY KEY(org_id,url)
);
CREATE TABLE IF NOT EXISTS hearth_parts_quotes (
  org_id uuid NOT NULL, id uuid NOT NULL, session_hash text NOT NULL, snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,id)
);
CREATE TABLE IF NOT EXISTS hearth_parts_orders (
  org_id uuid NOT NULL, id uuid NOT NULL, session_hash text NOT NULL, quote_id uuid NOT NULL,
  snapshot jsonb NOT NULL, payment_state text NOT NULL DEFAULT 'pending', fulfillment_state text NOT NULL DEFAULT 'awaiting_supplier',
  square_order_id text UNIQUE, square_payment_id text UNIQUE, delayed_until timestamptz, receipt_url text,
  supplier_confirmation text, tracking text, lease_until timestamptz,
  last_error text, checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,id), UNIQUE(org_id,quote_id), CHECK(payment_state IN ('pending','authorized','paid','voided','failed','refunding','refunded'))
);
CREATE INDEX IF NOT EXISTS hearth_parts_orders_check ON hearth_parts_orders(org_id,checked_at);
CREATE TABLE IF NOT EXISTS hearth_parts_reservations (
  org_id uuid NOT NULL, order_id uuid NOT NULL, key text NOT NULL, quantity integer NOT NULL CHECK(quantity>0),
  expires_at timestamptz NOT NULL, PRIMARY KEY(org_id,order_id,key)
);
CREATE TABLE IF NOT EXISTS hearth_parts_outbox (
  org_id uuid NOT NULL, id text NOT NULL, payload jsonb NOT NULL, sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
  PRIMARY KEY(org_id,id)
);
COMMIT;
