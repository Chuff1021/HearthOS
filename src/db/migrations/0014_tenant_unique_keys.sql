-- QuickBooks identifiers are unique inside one connected company, not across
-- every HearthOS dealer. Replace legacy global constraints with tenant keys.

alter table users drop constraint if exists users_email_unique;
create unique index if not exists users_org_email_unique
  on users (org_id, email);

alter table customers drop constraint if exists customers_qb_customer_id_unique;
create unique index if not exists customers_org_qb_customer_id_unique
  on customers (org_id, qb_customer_id);

alter table invoices drop constraint if exists invoices_qb_invoice_id_unique;
create unique index if not exists invoices_org_qb_invoice_id_unique
  on invoices (org_id, qb_invoice_id);

alter table inventory_items drop constraint if exists inventory_items_qb_item_id_unique;
create unique index if not exists inventory_items_org_qb_item_id_unique
  on inventory_items (org_id, qb_item_id);

alter table vendors drop constraint if exists vendors_qb_vendor_id_unique;
create unique index if not exists vendors_org_qb_vendor_id_unique
  on vendors (org_id, qb_vendor_id);

alter table estimates drop constraint if exists estimates_qb_estimate_id_unique;
create unique index if not exists estimates_org_qb_estimate_id_unique
  on estimates (org_id, qb_estimate_id);

alter table purchase_orders drop constraint if exists purchase_orders_qb_purchase_order_id_unique;
create unique index if not exists purchase_orders_org_qb_purchase_order_id_unique
  on purchase_orders (org_id, qb_purchase_order_id);

alter table bills drop constraint if exists bills_qb_bill_id_unique;
create unique index if not exists bills_org_qb_bill_id_unique
  on bills (org_id, qb_bill_id);
