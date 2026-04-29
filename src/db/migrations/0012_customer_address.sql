-- Customers were missing the mailing address QuickBooks already sends on
-- Customer.BillAddr / Customer.ShipAddr. Add columns matching the vendor
-- schema so addresses can land + render on the customer profile.

alter table customers
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city varchar(100),
  add column if not exists state varchar(50),
  add column if not exists zip varchar(20);
