import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { hash, type Offer } from "../../src/lib/parts-commerce/domain";

// Dedicated local test cluster only. Never run this against a production database.
const local = "postgres://parts_test@127.0.0.1:55439/postgres";
test("database checkout: server quote → authorization → inbox → capture → tracking; concurrent last-unit and overrides", async () => {
  const schema = `parts_test_${Date.now()}`,
    admin = postgres(local, { max: 1 });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const url = new URL(local);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  const sql = postgres(url.href, { max: 4 });
  try {
    const [path] = await sql`select current_schema() as name`;
    assert.equal(path.name, schema);
    await sql`CREATE TABLE organizations(id uuid PRIMARY KEY,slug text)`;
    await sql`CREATE TABLE hearth_website_inbox(org_id uuid,source text,external_id uuid,kind text,received_at timestamptz,payload jsonb,PRIMARY KEY(org_id,source,external_id))`;
    await sql.unsafe(
      (await fs.readFile("scripts/sql/parts-commerce.sql", "utf8"))
        .replace(/^BEGIN;/, " ")
        .replace(/COMMIT;\s*$/, " "),
    );
    const org = randomUUID(),
      session = "a".repeat(64);
    await sql`INSERT INTO organizations VALUES(${org},'default')`;
    Object.assign(process.env, {
      DATABASE_URL: url.href,
      HEARTHOS_WEBSITE_INBOX_ORG_ID: org,
      HEARTHOS_WEBSITE_INBOX_SECRET: "s".repeat(32),
      PARTS_COMMERCE_ENABLED: "true",
      PARTS_PAYMENTS_ENABLED: "true",
      PARTS_SHIPPING_VERIFIED: "true",
      PARTS_TAX_SETTINGS_VERIFIED: "true",
      TAXJAR_API_TOKEN: "test",
      PARTS_TAX_ORIGIN: JSON.stringify({
        country: "US",
        state: "MT",
        zip: "59901",
      }),
      PARTS_TAX_NEXUS: JSON.stringify([
        { country: "US", state: "MO", zip: "65738" },
      ]),
      SQUARE_ACCESS_TOKEN: "test",
      SQUARE_LOCATION_ID: "loc",
      SQUARE_ENVIRONMENT: "sandbox",
      NEXT_PUBLIC_SQUARE_APPLICATION_ID: "test",
    });
    const address = {
      name: "Test Customer",
      email: "test@example.com",
      phone: "",
      street: "1 Main",
      street2: "",
      city: "Republic",
      state: "MO",
      zip: "65738",
      country: "US",
    };
    const offer: Offer = {
      key: "spu:123",
      sku: "ABC",
      sourceId: "123",
      url: "https://www.stove-parts-unlimited.com/part.htm",
      name: "Part",
      priceCents: 1000,
      listCents: null,
      quantity: 1,
      status: "available",
      availability: "In stock",
      checkedAt: new Date().toISOString(),
      hash: hash("offer"),
      requiresOptions: false,
      catalog: { name: "Part" },
    };
    await sql`INSERT INTO hearth_parts(org_id,key,sku,source_id,url,catalog,offer,last_verified_at,pilot) VALUES(${org},${offer.key},${offer.sku},${offer.sourceId},${offer.url},${sql.json(offer.catalog)},${sql.json(offer)},now(),true)`;
    await sql`INSERT INTO hearth_parts_scanner(org_id,robots_checked_at,robots_allowed) VALUES(${org},now(),true)`;
    const realFetch = global.fetch;
    let payments = 0;
    const paymentMap = new Map<string, Record<string, unknown>>(),
      orderMap = new Map<string, { total: number; reference: string }>();
    global.fetch = async (input, init) => {
      const u = String(input),
        body = init?.body ? JSON.parse(String(init.body)) : null;
      if (u.endsWith("/api/storefront/carts") && init?.method === "POST")
        return Response.json({
          id: "cart",
          currency: { code: "USD" },
          lineItems: {
            physicalItems: [
              {
                id: "line",
                productId: 123,
                sku: "ABC",
                quantity: 1,
                salePrice: 10,
              },
            ],
          },
        });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (
        u.endsWith("/api/storefront/checkouts/cart") &&
        init?.method === "GET"
      )
        return Response.json({ id: "cart" });
      if (u.includes("/consignments?"))
        return Response.json({
          consignments: [
            {
              availableShippingOptions: [
                { id: "ground", description: "Ground", cost: 5 },
              ],
            },
          ],
        });
      if (u === "https://api.taxjar.com/v2/taxes")
        return Response.json({ tax: { amount_to_collect: 1 } });
      if (u.endsWith("/v2/orders") && body) {
        const id = "order-" + body.order.reference_id;
        orderMap.set(id, { total: 1600, reference: body.order.reference_id });
        return Response.json({
          order: {
            id,
            location_id: "loc",
            total_money: { amount: 1600, currency: "USD" },
          },
        });
      }
      if (u.endsWith("/v2/payments") && body) {
        payments++;
        const p = {
          id: "pay-" + body.reference_id,
          order_id: body.order_id,
          reference_id: body.reference_id,
          location_id: "loc",
          status: "APPROVED",
          amount_money: body.amount_money,
          delayed_until: new Date(Date.now() + 86400000).toISOString(),
          version_token: "version",
        };
        paymentMap.set(p.id, p);
        return Response.json({ payment: p });
      }
      if (u.includes("/v2/payments/")) {
        const [id, action] = u.split("/v2/payments/")[1].split("/");
        const p = paymentMap.get(id);
        if (!p) throw new Error("Missing payment");
        if (action === "complete") p.status = "COMPLETED";
        if (action === "cancel") p.status = "CANCELED";
        return Response.json({ payment: p });
      }
      if (u.includes("/v2/orders/")) {
        const id = u.split("/v2/orders/")[1],
          o = orderMap.get(id)!;
        return Response.json({
          order: {
            id,
            location_id: "loc",
            total_money: { amount: o.total, currency: "USD" },
            tenders: [...paymentMap.values()]
              .filter((p) => p.order_id === id)
              .map((p) => ({ payment_id: p.id })),
          },
        });
      }
      throw new Error(`Unexpected test boundary ${u}`);
    };
    try {
      const {
        quoteCart,
        authorizeQuote,
        adminOrderAction,
        orderStatus,
        emailManualQuote,
        redeemQuote,
      } = await import("../../src/lib/parts-commerce/server");
      const { effectiveOffer } =
        await import("../../src/lib/parts-commerce/store");
      const q1 = await quoteCart(
        { items: [{ key: offer.key, quantity: 1 }], address },
        session,
      );
      const q2 = await quoteCart(
        { items: [{ key: offer.key, quantity: 1 }], address },
        session,
      );
      assert.equal(q1.quote.totalCents, 1600);
      process.env.PARTS_SHIPPING_VERIFIED = "false";
      const manual = await emailManualQuote(
        {
          items: [{ sku: "ABC", quantity: 1 }],
          address,
          shippingCents: 500,
          shippingMethod: "Ground",
          reference: "SUP-QUOTE-1",
        },
        org,
        "owner",
      );
      const [mail] =
        await sql`SELECT payload FROM hearth_parts_outbox WHERE id=${`${manual.quoteId}:checkout`}`;
      const token = mail.payload.body.match(/token=([a-f0-9]{64})/)[1];
      assert.equal(
        (await redeemQuote(manual.quoteId, token)).quote.totalCents,
        1600,
      );
      await assert.rejects(() => redeemQuote(manual.quoteId, "b".repeat(64)));
      await assert.rejects(() =>
        quoteCart(
          { items: [{ key: offer.key, quantity: 1 }], address },
          session,
        ),
      );
      await sql`DELETE FROM hearth_parts_outbox WHERE id=${`${manual.quoteId}:checkout`}`;
      process.env.PARTS_SHIPPING_VERIFIED = "true";

      await assert.rejects(() =>
        authorizeQuote(
          { quoteId: q1.quote.id, sourceId: "cnon:test" },
          "b".repeat(64),
        ),
      );
      const attempts = await Promise.allSettled([
        authorizeQuote(
          { quoteId: q1.quote.id, sourceId: "cnon:test" },
          session,
        ),
        authorizeQuote(
          { quoteId: q2.quote.id, sourceId: "cnon:test" },
          session,
        ),
      ]);
      assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
      assert.equal(payments, 1);
      const [row] =
        await sql`SELECT * FROM hearth_parts_orders WHERE payment_state='authorized'`;
      assert.ok(row);
      const [inbox] =
        await sql`SELECT payload FROM hearth_website_inbox WHERE external_id=${row.id}`;
      assert.equal(
        inbox.payload.metadata.paymentStatus,
        "Authorized — supplier order needed",
      );
      await authorizeQuote({ quoteId: row.id, sourceId: "cnon:test" }, session);
      assert.equal(payments, 1, "retry must reuse payment");
      await adminOrderAction(
        { id: row.id, action: "capture", confirmation: "SUP-1" },
        org,
        "owner",
      );
      await adminOrderAction(
        { id: row.id, action: "capture", confirmation: "SUP-1" },
        org,
        "owner",
      );
      assert.equal((await orderStatus(row.id, session)).status, "paid");
      await adminOrderAction(
        { id: row.id, action: "tracking", tracking: "UPS 123" },
        org,
        "owner",
      );
      const [paid] =
        await sql`SELECT payload FROM hearth_website_inbox WHERE external_id=${row.id}`;
      assert.equal(paid.payload.metadata.tracking, "UPS 123");
      assert.equal(paid.payload.metadata.paymentStatus, "Paid");
      const [messages] =
        await sql`SELECT count(*)::int AS count FROM hearth_parts_outbox`;
      assert.equal(
        messages.count,
        3,
        "authorization, payment and tracking emails are durable and deduplicated",
      );
      await assert.rejects(() =>
        adminOrderAction({ id: row.id, action: "void" }, org, "owner"),
      );
      const [part] = await sql`SELECT * FROM hearth_parts`;
      assert.equal(
        effectiveOffer({
          ...part,
          override: { status: "out_of_stock", message: "4 weeks" },
        } as never)?.status,
        "out_of_stock",
      );
      console.log(
        "Verified durable inbox, unique payment, local reservation, capture, tracking and email outbox.",
      );
    } finally {
      global.fetch = realFetch;
    }
  } finally {
    await sql.end({ timeout: 1 });
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end({ timeout: 1 });
  }
});
