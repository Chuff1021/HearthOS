-- Indexes used by the inventory workbench: per-item cost history, usage history,
-- on-order quantities. Without these the master list is ~4400 sequential scans.
CREATE INDEX IF NOT EXISTS "idx_bill_line_items_qb_item_id" ON "bill_line_items" USING btree ("qb_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoice_line_items_qb_item_id" ON "invoice_line_items" USING btree ("qb_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_po_line_items_qb_item_id" ON "purchase_order_line_items" USING btree ("qb_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_estimate_line_items_qb_item_id" ON "estimate_line_items" USING btree ("qb_item_id");
