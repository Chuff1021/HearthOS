import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPartsSquare,
  createSupplierShipping,
} from "../../src/lib/parts-commerce/providers";
import type { Quote } from "../../src/lib/parts-commerce/domain";
const q: Quote = {
  id: "11111111-1111-4111-8111-111111111111",
  address: {
    name: "Test",
    email: "test@example.com",
    phone: "",
    street: "1 Main",
    street2: "",
    city: "Republic",
    state: "MO",
    zip: "65738",
    country: "US",
  },
  lines: [
    {
      key: "spu:123",
      sku: "ABC",
      name: "Part",
      quantity: 2,
      unitPriceCents: 1000,
      sourceId: "123",
      offerHash: "hash",
    },
  ],
  shipping: {
    id: "ground",
    label: "Ground",
    amountCents: 500,
    supplierCartId: "cart",
  },
  taxCents: 100,
  totalCents: 2600,
  expiresAt: new Date(Date.now() + 900000).toISOString(),
};
test("Square authorizes exact approved total with stable short idempotency key and no auto-capture", async () => {
  let body: Record<string, any>;
  const client = createPartsSquare(
    { accessToken: "test", locationId: "loc", environment: "sandbox" },
    async (u, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        payment: {
          id: "pay",
          order_id: "order",
          reference_id: q.id,
          location_id: "loc",
          status: "APPROVED",
          amount_money: { amount: 2600, currency: "USD" },
          delayed_until: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    },
  );
  await client.authorize(q.id, q, "order", "cnon:test");
  assert.equal(body.autocomplete, false);
  assert.equal(body.delay_action, "CANCEL");
  assert.equal(body.amount_money.amount, 2600);
  assert.ok(body.idempotency_key.length <= 45);
  assert.equal(body.source_id, "cnon:test");
});
test("Square rejects incorrect location, totals and missing authorization deadline", async () => {
  for (const patch of [
    { location_id: "other" },
    { amount_money: { amount: 1, currency: "USD" } },
    { delayed_until: undefined },
  ]) {
    const client = createPartsSquare(
      { accessToken: "test", locationId: "loc", environment: "sandbox" },
      async () =>
        Response.json({
          payment: {
            id: "pay",
            order_id: "order",
            reference_id: q.id,
            location_id: "loc",
            status: "APPROVED",
            amount_money: { amount: 2600, currency: "USD" },
            delayed_until: new Date(Date.now() + 86400000).toISOString(),
            ...patch,
          },
        }),
    );
    await assert.rejects(() => client.authorize(q.id, q, "order", "cnon:test"));
  }
});
test("shipping verifies cart identity and sums no partial shipment; removes guest cart", async () => {
  const methods: string[] = [];
  const shipping = createSupplierShipping(async (url, init) => {
    methods.push(init?.method || "");
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (String(url).endsWith("/carts"))
      return Response.json({
        id: "cart",
        currency: { code: "USD" },
        lineItems: {
          physicalItems: [
            {
              id: "line",
              productId: 123,
              sku: "ABC",
              quantity: 2,
              salePrice: 10,
            },
          ],
        },
      });
    return Response.json({
      consignments: [
        {
          availableShippingOptions: [
            { id: "ground", description: "Ground", cost: 5 },
          ],
        },
      ],
    });
  });
  assert.equal((await shipping(q.lines, q.address))[0].amountCents, 500);
  assert.equal(methods.at(-1), "DELETE");
});
test("shipping mismatch never falls back to zero or a partial quote", async () => {
  const shipping = createSupplierShipping(async (url, init) => {
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (String(url).endsWith("/carts"))
      return Response.json({
        id: "cart",
        currency: { code: "USD" },
        lineItems: {
          physicalItems: [
            {
              id: "line",
              productId: 123,
              sku: "WRONG",
              quantity: 2,
              salePrice: 10,
            },
          ],
        },
      });
    return Response.json({});
  });
  await assert.rejects(() => shipping(q.lines, q.address));
});
