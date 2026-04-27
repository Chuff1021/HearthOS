-- Performance + correctness:
-- payments(qb_payment_id, invoice_id) unique → enables bulk upsert
-- inventory_items(qb_item_id) unique → enables bulk upsert (org column already enforces tenancy)

-- Drop existing dupes that would block the new constraint, if any
-- (keeps the row with the lowest id within each (qb_payment_id, invoice_id) group)
DELETE FROM "payments" p
USING "payments" q
WHERE p.id > q.id
  AND p.qb_payment_id IS NOT NULL
  AND p.qb_payment_id = q.qb_payment_id
  AND p.invoice_id = q.invoice_id;
--> statement-breakpoint

DELETE FROM "inventory_items" p
USING "inventory_items" q
WHERE p.id > q.id
  AND p.qb_item_id IS NOT NULL
  AND p.org_id = q.org_id
  AND p.qb_item_id = q.qb_item_id;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "payments"
		ADD CONSTRAINT "payments_qb_payment_invoice_unique" UNIQUE ("qb_payment_id", "invoice_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "inventory_items"
		ADD CONSTRAINT "inventory_items_qb_item_id_unique" UNIQUE ("qb_item_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
