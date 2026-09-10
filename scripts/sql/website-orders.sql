-- Additive migration. Existing website requests and invoice payments are untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS hearth_website_orders (
  org_id uuid NOT NULL REFERENCES organizations(id),
  id uuid NOT NULL,
  request_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'paid')),
  square_order_id text,
  square_payment_link_id text,
  checkout_url text,
  square_payment_id text,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  paid_at timestamptz,
  PRIMARY KEY (org_id, id),
  UNIQUE (square_order_id),
  UNIQUE (square_payment_id)
);
CREATE INDEX IF NOT EXISTS hearth_website_orders_pending_idx
  ON hearth_website_orders (org_id, checked_at NULLS FIRST) WHERE state='pending';
COMMIT;
