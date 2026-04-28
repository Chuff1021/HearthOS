-- Track manual cost overrides so QuickBooks sync doesn't clobber them.
--
-- Without this, persistItemsToDb's upsert sets cost = excluded.cost
-- unconditionally, which overwrites prices saved by the price-audit
-- auto-correct flow (and the single-item PATCH route) with whatever
-- Item.PurchaseCost is in QuickBooks.
--
-- Set: when a user saves cost via /api/inventory/price-audit/apply or
--      /api/inventory/[id] PATCH.
-- Read: persistItemsToDb skips cost in onConflict when this is non-null.

alter table inventory_items
  add column if not exists cost_overridden_at timestamptz;
