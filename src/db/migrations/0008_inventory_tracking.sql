-- Local "is this item part of my actively-tracked inventory" flag, separate from
-- QB's is_active so a future QB sync doesn't undo the user's trim.
ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "is_tracked" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_items_tracked" ON "inventory_items" USING btree ("is_tracked");
