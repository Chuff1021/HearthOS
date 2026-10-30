# Website checkout activation

Status on September 10, 2026: Square/inbox backend prepared locally. Paid checkout
is not enabled and no payment, production database migration, or paid shipping
subscription has been created by this work.

## Verified production setup

- Website: https://aaronsfireplaceco.com, production source `2f149fa8`.
- HearthOS: https://hearth-os.vercel.app, source baseline `61d66ac`.
- Square production credentials successfully read the active Aaron's Fireplace
  Company location at 611 E Harrison St, Republic, MO 65738.
- Square catalog list returned no configured TAX objects. This does not establish
  the business's tax obligations; a verified tax calculation is still required.
- The existing website inbox uses a private export and a five-minute HearthOS
  import. Its organization and shared export secret are configured in production.
- The website has no connected shipping API. It currently uses a $49.99 estimate,
  waived at $499, and an 8% tax estimate in the browser. None are suitable as
  authoritative rates for paid checkout.
- Scanning imported data found 33,431 product records with no dedicated shipping
  weight, dimensions, origin or freight fields. Product dimensions in descriptive
  text, if present, are not verified packed dimensions.

## Prepared code

The website's `src/lib/hearthos-orders.ts` signs server-to-server requests to the
fixed HearthOS origin. Square credentials remain in HearthOS. The frontend does
not call this helper yet: its caller must resolve current prices from the server
catalog and validate shipping and tax quotes before creating an order.

HearthOS exposes a signed `/api/integrations/website-orders` endpoint. Its order
snapshot includes SKU, name, quantity, integer unit price, destination, shipping
method/rate reference, tax reference, total and customer contact information.
A stable idempotency key reuses the Square checkout link on retries. A changed
order cannot reuse an existing order number.

Square hosts card entry. The Square link collects the final confirmed total;
fulfillment line details and shipping/tax breakdown remain in HearthOS. This uses
Square quick-pay, so separate Square catalog/tax accounting is not implemented.

The server verifies Square order, location, currency, payment identity, completed
status, exact amount and refund state before atomically marking the order paid
and inserting its inbox item. Return-URL navigation alone cannot mark an order
paid. Scheduled reconciliation continues even when the shopper leaves the site.
The inbox's Paid badge comes from the payment table, never user-supplied metadata.
Existing order requests retain their request status. Corrected an existing inbox
line-total display bug for quantities greater than one.

## Required before activation

1. Confirm fulfillment origins: Republic showroom, supplier dropship locations,
   or both, and which products may be purchased online at current catalog prices.
2. Connect a real shipping service and configure the supported carriers. ShipperHQ
   supports parcel and LTL freight but its custom-site SDK requires Enterprise
   access and a pricing discussion. EasyPost is an alternative for parcel rating;
   large appliances still need a freight provider or a quote-before-payment flow.
3. Obtain verified packed weights, package/pallet dimensions, ship-separately and
   multi-box rules, supplier origins, freight classes and delivery requirements.
   Unknown packaging must request a quote; it must never default to zero shipping.
4. Configure tax calculation for the business's applicable destinations. Do not
   promote the website's existing browser-side 8% estimate to a real tax policy.
5. Implement the storefront checkout and confirmation pages using server-priced
   catalog items and expiring, address/cart-bound shipping and tax quotes. Never
   accept client-provided item prices or charge amounts. Require a signed customer
   receipt token before allowing the public confirmation page to fetch status.
6. Back up and rehearse `scripts/sql/website-orders.sql`, then apply this additive
   migration to the existing HearthOS database. No existing rows are modified.
7. Configure one new dedicated random `HEARTHOS_WEBSITE_ORDER_SECRET` on both
   servers. Do not reuse the export secret or copy the Square access token into
   the storefront. Set `HEARTHOS_WEBSITE_ORDERS_ENABLED=true` only after all setup
   and end-to-end tests succeed; it is currently unset and disabled.
8. Test the real Square sandbox checkout, declined/canceled payment, interrupted
   browser, retries, valid carrier quotes, refunds and order fulfillment. Configure
   Square webhooks for immediate updates and a persistent review queue for
   reconciliation errors/refunds. The five-minute poll is a recovery path, not
   a replacement for a scalable webhook feed.
9. Rebase on the latest live HearthOS source before deployment. The production
   app has active unrelated work; never replace it with an older checkout.

## Validation

- Unit/contract tests: order math, signed request tampering/expiry, deterministic
  checkout retry key, complete vs pending/mismatched/refunded Square payments.
- Isolated PostgreSQL tests: repeated migration, concurrent reservations,
  transaction rollback, duplicate paid events, tenant isolation and inbox delivery.
- Production build, targeted lint, and synthetic paid-order desktop/mobile checks.
- No real customer payment was attempted. Mock provider tests are not a real
  Square sandbox or carrier integration test.

## Provider references

- Square Checkout API: https://developer.squareup.com/docs/checkout-api
- ShipperHQ custom API access: https://docs.shipperhq.com/shipperhq-sdk
- ShipperHQ carrier/freight features: https://shipperhq.com/features
- EasyPost shipping API: https://www.easypost.com/shipping-api/
