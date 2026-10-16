import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CardRejectedError,
  createPartsSquare,
} from "../src/lib/parts-commerce/providers";
import type { Quote } from "../src/lib/parts-commerce/domain";
async function main() {
  const {
    SQUARE_ACCESS_TOKEN: accessToken,
    SQUARE_LOCATION_ID: locationId,
    SQUARE_ENVIRONMENT: environment,
  } = process.env;
  if (environment !== "sandbox" || !accessToken || !locationId)
    throw new Error(
      "This script requires Square Sandbox credentials. Production is prohibited.",
    );
  const client = createPartsSquare({
    accessToken,
    locationId,
    environment: "sandbox",
  });
  function quote(): Quote {
    return {
      id: randomUUID(),
      address: {
        name: "Sandbox Verification",
        email: "sandbox@example.com",
        phone: "",
        street: "611 E Harrison St",
        street2: "",
        city: "Republic",
        state: "MO",
        zip: "65738",
        country: "US",
      },
      lines: [
        {
          key: "sandbox:test",
          sku: "TEST-ONLY",
          name: "Sandbox parts order verification",
          quantity: 1,
          unitPriceCents: 100,
          sourceId: "0",
          offerHash: "sandbox",
        },
      ],
      shipping: {
        id: "sandbox",
        label: "Sandbox",
        amountCents: 0,
        supplierCartId: "test",
      },
      taxCents: 0,
      totalCents: 100,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
  }
  const first = quote(),
    firstOrder = await client.createOrder(first.id, first);
  const approved = await client.authorize(
    first.id,
    first,
    firstOrder,
    "cnon:card-nonce-ok",
  );
  assert.equal(approved.status, "APPROVED");
  assert.ok(Date.parse(approved.delayed_until!) > Date.now());
  assert.equal(
    (await client.authorize(first.id, first, firstOrder, "cnon:card-nonce-ok"))
      .id,
    approved.id,
  );
  assert.equal(
    (await client.cancel(approved, first.id, first)).status,
    "CANCELED",
  );
  const second = quote(),
    secondOrder = await client.createOrder(second.id, second),
    hold = await client.authorize(
      second.id,
      second,
      secondOrder,
      "cnon:card-nonce-ok",
    );
  const captured = await client.complete(hold, second.id, second);
  assert.equal(captured.status, "COMPLETED");
  assert.equal(
    (await client.read(captured.id, second.id, second, secondOrder))
      .amount_money.amount,
    100,
  );
  const refund = await client.refund(captured, second.id, second);
  assert.ok(["PENDING", "COMPLETED"].includes(refund));
  const third = quote(),
    thirdOrder = await client.createOrder(third.id, third);
  await assert.rejects(
    () =>
      client.authorize(third.id, third, thirdOrder, "cnon:card-nonce-declined"),
    CardRejectedError,
  );
  console.log({
    sandbox: true,
    authorization: true,
    idempotentRetry: true,
    void: true,
    capture: true,
    refund,
    decline: true,
    productionPayments: false,
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Sandbox verification failed");
  process.exitCode = 1;
});
