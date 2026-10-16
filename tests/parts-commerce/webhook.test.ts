import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { POST } from "../../src/app/api/integrations/parts-square-webhook/route";
const key = "test-signing-key",
  url = "https://hearth-os.vercel.app/api/integrations/parts-square-webhook";
test("Square webhook rejects missing or changed signatures before touching orders", async () => {
  process.env.PARTS_SQUARE_WEBHOOK_SIGNATURE_KEY = key;
  process.env.PARTS_SQUARE_WEBHOOK_URL = url;
  const body = JSON.stringify({ type: "payment.updated" });
  assert.equal(
    (await POST(new Request(url, { method: "POST", body }))).status,
    401,
  );
  const signature = createHmac("sha256", key)
    .update(url + body)
    .digest("base64");
  assert.equal(
    (
      await POST(
        new Request(url, {
          method: "POST",
          body: body + " ",
          headers: { "x-square-hmacsha256-signature": signature },
        }),
      )
    ).status,
    401,
  );
});
test("valid provider event unrelated to a parts order is acknowledged without charging", async () => {
  Object.assign(process.env, {
    PARTS_SQUARE_WEBHOOK_SIGNATURE_KEY: key,
    PARTS_SQUARE_WEBHOOK_URL: url,
    PARTS_COMMERCE_ENABLED: "true",
    HEARTHOS_WEBSITE_INBOX_ORG_ID: "11111111-1111-4111-8111-111111111111",
    HEARTHOS_WEBSITE_INBOX_SECRET: "s".repeat(32),
    DATABASE_URL: "postgres://parts_test@127.0.0.1:55439/postgres",
  });
  const body = JSON.stringify({
      type: "payment.updated",
      data: { object: { payment: { reference_id: "unrelated" } } },
    }),
    signature = createHmac("sha256", key)
      .update(url + body)
      .digest("base64");
  assert.equal(
    (
      await POST(
        new Request(url, {
          method: "POST",
          body,
          headers: { "x-square-hmacsha256-signature": signature },
        }),
      )
    ).status,
    200,
  );
});
