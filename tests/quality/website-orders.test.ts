import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseWebsiteOrder, paidSubmission, verifyOrderRequest } from "../../src/lib/website-orders/domain";
import { createWebsiteSquareClient } from "../../src/lib/website-orders/square";

const input = {
  id: "11111111-1111-4111-8111-111111111111",
  customer: { name: "Test Buyer", email: "buyer@example.invalid", phone: "4175550100", address: "Test address" },
  items: [{ sku: "TEST-PART", name: "Test part", quantity: 2, unitPriceCents: 1200 }],
  shipping: { method: "Test Ground", quoteId: "test-rate", amountCents: 750 },
  tax: { amountCents: 192, quoteId: "test-tax" }, totalCents: 3342, notes: "Test only",
};
test("requires a balanced server order with shipping and tax quote references", () => {
  assert.equal(parseWebsiteOrder(input).totalCents, 3342);
  for (const changed of [
    { ...input, totalCents: 1 }, { ...input, items: [] },
    { ...input, items: [{ ...input.items[0], quantity: -1 }] },
    { ...input, items: [{ ...input.items[0], unitPriceCents: 0 }] },
    { ...input, shipping: { ...input.shipping, quoteId: "" } },
    { ...input, tax: { ...input.tax, quoteId: "" } },
  ]) assert.throws(() => parseWebsiteOrder(changed));
});
test("signatures bind method, path, body and time; stale or altered requests fail", () => {
  const now = 1789060000000, secret = "test-secret-that-is-at-least-thirty-two-characters", body = JSON.stringify(input);
  const path = "/api/integrations/website-orders";
  const signature = createHmac("sha256", secret).update(`${now}\nPOST\n${path}\n${body}`).digest("hex");
  const headers = new Headers({ "x-hearthos-timestamp": String(now), "x-hearthos-signature": signature });
  assert.equal(verifyOrderRequest("POST", path, body, headers, secret, now), true);
  assert.equal(verifyOrderRequest("GET", path, body, headers, secret, now), false);
  assert.equal(verifyOrderRequest("POST", `${path}?id=other`, body, headers, secret, now), false);
  assert.equal(verifyOrderRequest("POST", path, body + " ", headers, secret, now), false);
  assert.equal(verifyOrderRequest("POST", path, body, headers, secret, now + 300001), false);
  assert.equal(verifyOrderRequest("POST", path, body, headers, undefined, now), false);
});
test("fulfillment record preserves quantities, line totals, shipping and payment reference", () => {
  const row = paidSubmission(parseWebsiteOrder(input), { id: "payment-1", orderId: "order-1", receiptUrl: "" }, new Date().toISOString());
  assert.equal(row.items[0].quantity, 2);
  assert.equal(row.items[0].price, 24);
  assert.equal(row.total, 33.42);
  assert.equal(row.metadata.shippingQuoteId, "test-rate");
  assert.equal(row.metadata.squarePaymentId, "payment-1");
});
test("Square checkout retries use the same idempotency key and fixed return URL", async () => {
  const requests: Record<string, any>[] = [];
  const fake = (async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({ payment_link: { id: "link1", order_id: "order1", url: "https://square.link/u/test" } });
  }) as typeof fetch;
  const square = createWebsiteSquareClient({ accessToken: "test", locationId: "loc", environment: "sandbox" }, fake);
  await square.createLink("org1", parseWebsiteOrder(input));
  await square.createLink("org1", parseWebsiteOrder(input));
  assert.equal(requests[0].idempotency_key, requests[1].idempotency_key);
  assert.equal(requests[0].quick_pay.price_money.amount, 3342);
  assert.equal(requests[0].checkout_options.allow_tipping, false);
  assert.match(requests[0].checkout_options.redirect_url, /^https:\/\/aaronsfireplaceco\.com\//);
});
test("only a verified, complete, exact-amount Square payment can fulfill an order", async () => {
  const payment = { id: "pay1", order_id: "ord1", location_id: "loc", status: "COMPLETED", amount_money: { amount: 3342, currency: "USD" } };
  let candidate: any = payment;
  const square = createWebsiteSquareClient({ accessToken: "test", locationId: "loc", environment: "sandbox" }, (async url => {
    if (String(url).includes("/orders/")) return Response.json({ order: { id: "ord1", location_id: "loc", total_money: { amount: 3342, currency: "USD" }, tenders: [{ payment_id: "pay1" }] } });
    return Response.json({ payment: candidate });
  }) as typeof fetch);
  assert.equal((await square.completedPayment("ord1", 3342))?.id, "pay1");
  candidate = { ...payment, status: "PENDING" };
  assert.equal(await square.completedPayment("ord1", 3342), null);
  for (const changed of [
    { ...payment, location_id: "foreign" }, { ...payment, order_id: "other" },
    { ...payment, amount_money: { amount: 1, currency: "USD" } },
    { ...payment, refunded_money: { amount: 1, currency: "USD" } },
  ]) { candidate = changed; await assert.rejects(square.completedPayment("ord1", 3342)); }
});
