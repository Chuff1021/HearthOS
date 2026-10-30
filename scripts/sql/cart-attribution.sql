BEGIN;
ALTER TABLE hearth_cart_sessions ADD COLUMN IF NOT EXISTS attribution jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMIT;
