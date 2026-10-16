# Parts inventory and checkout

## Release status

Stove Parts Unlimited public retail pages are the only automated supplier source. Energy Parts Plus is excluded. Customer prices use current public prices; supplier discounts are private. 32,015 imported records resolve to 32,012 canonical source products. Duplicate records with the same supplier product ID collapse; conflicting SKU identities are blocked from checkout.

- Database: additive `scripts/sql/parts-commerce.sql`; existing invoice/payment tables are unchanged.
- Worker: `/api/cron/parts-scan`, every five minutes, checkpointed product leases, three workers sharing one global request per second, daily full catalog cadence and 15-minute refresh for viewed/quoted parts.
- Discovery: four current supplier product sitemaps daily; additions wait for owner review rather than automatically publishing non-parts merchandise.
- Owner UI: Website Inbox → Parts stock & orders. Overrides, pilot selection, scan errors, supplier confirmation/capture, voids, refunds and tracking.
- MA-212400: persistent out-of-stock override, “4 weeks until ready to ship”; no date-based automatic restocking.
- Local sales tax reference: **9.11%**, supplied by Aaron on October 16, 2026. This is not a blanket interstate tax rate. TaxJar receives the destination, actual origin/nexus configuration, items and shipping.

## Configuration and activation

HearthOS requires its existing `DATABASE_URL`, website-inbox organization/secret, Square credentials, Clerk access, SMTP and `CRON_SECRET`. A separate server-to-server `HEARTHOS_WEBSITE_ORDER_SECRET` signs the exact method/path/body with a five-minute validity window. Storefront requires the same signing secret and `HEARTHOS_COMMERCE_ORIGIN=https://hearth-os.vercel.app`. Never copy merchant tokens into the storefront or browser.

Inventory runs when `PARTS_COMMERCE_ENABLED=true`. Automatic payments remain disabled until all of these are verified:

1. TaxJar account: `TAXJAR_API_TOKEN`, `PARTS_TAX_ORIGIN` (JSON `{country,state,zip,city,street}`) and `PARTS_TAX_NEXUS` (JSON array using TaxJar nexus-address fields). Set `PARTS_TAX_SETTINGS_VERIFIED=true` only after Aaron confirms actual registrations and origin arrangements for supplier direct shipments.
2. Square: existing application/location/merchant credentials must match the inbox organization. Configure a dedicated webhook subscription to `https://hearth-os.vercel.app/api/integrations/parts-square-webhook` for payment.created, payment.updated and refund.updated, using `PARTS_SQUARE_WEBHOOK_SIGNATURE_KEY` and exact `PARTS_SQUARE_WEBHOOK_URL`. Verify sandbox authorization/capture/void/refund/expiration before production.
3. Shipping: the real SPU BigCommerce storefront cart/checkout API adapter creates an isolated guest session, verifies products/prices/quantities, reads actual available options, then deletes the cart. It never submits a supplier order. SF-CSRF cookies and tokens stay server-side. Verify dealer/direct-ship charge parity, including threshold effects, multi-item carts and several destination ZIPs; only then set `PARTS_SHIPPING_VERIFIED=true`.
4. Select up to 25 verified eligible products in the owner pilot UI, then set `PARTS_PAYMENTS_ENABLED=true`. Non-pilot, stale, special-order, option-dependent, freight and unverified items remain online quote requests. Expand only after pilot receipts and fulfillment agree.

Owner-confirmed shipping quotes can be emailed through the quote builder after Square/tax setup is verified. The signed-in owner supplies the actual shipping charge and source quote reference. Links use a 256-bit capability in a URL fragment, exchanged for an HttpOnly session cookie; snapshots expire after 15 minutes. Current supplier price and stock are rechecked at authorization. The owner email flow does not waive availability checks.

## Ordering behavior

Server prices and 15-minute quotes are authoritative. Cards use Square Web Payments SDK tokens only, with `autocomplete:false` and `delay_action:CANCEL`. Orders appear immediately as **Authorized — supplier order needed**. Enter the supplier confirmation and capture once. Unknown payment responses retain reservations and enter reconciliation; never create a second supplier order after a capture error. Separate payment and fulfillment states are preserved. Only full refunds are currently supported.

Local reservations prevent two Aaron's shoppers from buying the same reported last unit. They do not reserve the supplier warehouse. Supplier page failures retain the last successful snapshot but block checkout. Exact quantities display only when published. Display metadata is bundled for established products, live price/stock overlays come from the database, and reviewed new product metadata comes from the database. No stock JSON rewrite or deployment is needed for price/stock changes.

Reconciliation runs every five minutes. Square state is fetched rather than trusting event ordering; repeated webhooks cannot duplicate inbox rows or email events. Unconfirmed holds are canceled shortly before Square's actual deadline. Reminder and customer emails use a durable outbox and existing SMTP; SMTP acceptance cannot guarantee inbox delivery, and a crash after acceptance may resend the same message ID. Owner controls are restricted to authenticated administrators in the configured organization.

## Verification commands

- `npm run typecheck`
- `NODE_OPTIONS='--conditions=react-server' npx tsx --test tests/parts-commerce/parser.test.ts tests/parts-commerce/providers.test.ts`
- Local database integration test: `initdb -D /tmp/aarons-parts-postgres -A trust -U parts_test`; `pg_ctl -D /tmp/aarons-parts-postgres -l /tmp/aarons-parts-postgres.log -o '-p 55439 -k /tmp' start`; then `NODE_OPTIONS='--conditions=react-server' npx tsx --test tests/parts-commerce/postgres.test.ts`. The test uses only this local cluster and a disposable schema.
- Read-only supplier sample: `npx tsx scripts/parts-observe.ts /absolute/storefront/root`.
- Real shipping observation, temporary guest cart only: `npx tsx scripts/parts-shipping-observe.ts /absolute/storefront/root`.
- Seed after migration: `node --import tsx --env-file=.env.parts.local scripts/parts-seed.ts /absolute/storefront/root`. Reruns preserve offers and overrides.
- Manual bounded worker: `NODE_OPTIONS='--conditions=react-server' node --import tsx --env-file=.env.parts.local scripts/parts-runner.ts 45000`.

An observation sample of 25 legacy product URLs produced 20 valid pages and five actual 404 responses. Ordinary 1–2 business-day processing, special orders, unknown quantities and zero stock were distinguished. Supplier checkout returned real UPS services and charges for a Republic, MO cart, and the guest cart was deleted. These are not dealer shipping parity or live Square payment verification.

## Rollback

Set `PARTS_PAYMENTS_ENABLED=false` to stop new authorizations; keep reconciliation/webhooks active for existing orders. Set `PARTS_COMMERCE_ENABLED=false` only if the inventory service must be stopped; the storefront then falls back to availability-to-confirm and email quote requests. Additive tables and history remain for recovery. The old JSON refresh script is retired deliberately.
