import assert from "node:assert/strict";
import { test } from "node:test";
import { signCustomerLink, verifyCustomerLink } from "../../src/lib/security/public-links";

test("customer capabilities are signed, document-bound, purpose-bound, and expiring", () => {
  const previous = process.env.HEARTHOS_PUBLIC_LINK_SECRET;
  try {
    process.env.HEARTHOS_PUBLIC_LINK_SECRET = "test-only-secret-not-for-production-123456789";
    const now = 1800000000000;
    const token = signCustomerLink({ purpose: "payment", document: "TEST-123", maxCents: 50000 }, now);
    assert.equal(verifyCustomerLink(token, "payment", "TEST-123", now)?.maxCents, 50000);
    assert.equal(verifyCustomerLink(token, "payment", "OTHER", now), null);
    assert.equal(verifyCustomerLink(token, "estimate", "TEST-123", now), null);
    assert.equal(verifyCustomerLink(token, "payment", "TEST-123", now + 30 * 86400000), null);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), maxCents: 999999 })).toString("base64url");
    assert.equal(verifyCustomerLink(`${forged}.${signature}`, "payment", "TEST-123", now), null);
    for (const invalid of ["", "garbage", token + ".extra", "x".repeat(2049)]) assert.equal(verifyCustomerLink(invalid, "payment", "TEST-123", now), null);
    delete process.env.HEARTHOS_PUBLIC_LINK_SECRET;
    assert.equal(verifyCustomerLink(token, "payment", "TEST-123", now), null);
    assert.throws(() => signCustomerLink({ purpose: "estimate", document: "TEST" }), /not configured/);
  } finally {
    if (previous === undefined) delete process.env.HEARTHOS_PUBLIC_LINK_SECRET;
    else process.env.HEARTHOS_PUBLIC_LINK_SECRET = previous;
  }
});
