import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";
import { parseCartActivity, recordCartActivity, cartActivityReport } from "../../src/lib/parts-commerce/cart-activity";

const item = { name: "Replacement Part", sku: "TEST-123", quantity: 2, price: 12.5 };
test("cart contacts validate before saving and never accept card data as contact fields", () => {
  const event = { journeyId: randomUUID(), event: "contact", items: [item] };
  for (const contact of [{ name: "Customer" }, { name: "Customer", email: "bad-email" }, { name: "Customer", phone: "123" }, { name: "Customer", email: "a@b.com", phone: "invalid" }])
    assert.throws(() => parseCartActivity({ ...event, contact }));
  const parsed = parseCartActivity({ ...event, contact: { name: "Customer", email: "customer@example.com", phone: "417-555-0100", card: "should not be copied" } });
  assert.deepEqual(Object.keys(parsed.contact!).sort(), ["email", "name", "phone"]);
  assert.throws(() => parseCartActivity({ ...event, items: [{ ...item, quantity: -1 }] }));
});

test("durable cart funnel → contact → deduplicated private inbox, isolation, inactivity and verified conversion", async () => {
  const local = "postgres://parts_test@127.0.0.1:55439/postgres";
  const schema = `cart_test_${Date.now()}`;
  const admin = postgres(local, { max: 1 });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const url = new URL(local);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  const sql = postgres(url.href, { max: 3 });
  try {
    await sql`CREATE TABLE organizations(id uuid PRIMARY KEY)`;
    await sql`CREATE TABLE hearth_website_inbox(org_id uuid,source text,external_id uuid,kind text,received_at timestamptz,payload jsonb,status text DEFAULT 'new',PRIMARY KEY(org_id,source,external_id))`;
    await sql`CREATE TABLE hearth_parts_orders(org_id uuid,session_hash text,snapshot jsonb,payment_state text)`;
    await sql.unsafe((await fs.readFile("scripts/sql/cart-activity.sql", "utf8")).replace(/^BEGIN;/, "").replace(/COMMIT;\s*$/, ""));
    await sql.unsafe((await fs.readFile("scripts/sql/cart-attribution.sql", "utf8")).replace(/^BEGIN;/, "").replace(/COMMIT;\s*$/, ""));
    const org = randomUUID(), otherOrg = randomUUID(), id = randomUUID(), session = "a".repeat(64);
    await sql`INSERT INTO organizations VALUES(${org}),(${otherOrg})`;
    const input = { journeyId: id, event: "cart", items: [item], attribution: { channel: "organic", landingPath: "/product/test-part", email: "must-not-be-saved@example.com" } };
    await recordCartActivity(org, input, session, sql);
    await recordCartActivity(org, { ...input, event: "checkout" }, session, sql);
    const contact = { name: "Test Customer", email: "customer@example.com", phone: "417-555-0100" };
    const response = await recordCartActivity(org, { ...input, event: "contact", contact }, session, sql);
    assert.deepEqual(response, { ok: true });
    await sql`UPDATE hearth_website_inbox SET status='contacted' WHERE org_id=${org}`;
    await Promise.all([1, 2].map(() => recordCartActivity(org, { ...input, event: "contact", contact: { ...contact, phone: "417-555-0101" } }, session, sql)));
    const inbox = await sql`SELECT * FROM hearth_website_inbox WHERE org_id=${org}`;
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].status, "contacted");
    assert.equal(inbox[0].kind, "contact");
    assert.equal(inbox[0].payload.phone, "417-555-0101");
    assert.equal(inbox[0].payload.items[0].price, 25);
    assert.match(inbox[0].payload.metadata.paymentStatus, /Not collected/);
    assert.equal(inbox[0].payload.metadata.trafficChannel, "organic");
    assert.equal(inbox[0].payload.metadata.landingPage, "/product/test-part");
    assert.equal((await cartActivityReport(org, sql)).channels[0].contacts, 1);
    await recordCartActivity(org, { ...input, event: "heartbeat", attribution: { channel: "paid", landingPath: "/" } }, session, sql);
    const [originalSource] = await sql`SELECT attribution FROM hearth_cart_sessions WHERE org_id=${org}`;
    assert.deepEqual(originalSource.attribution, { channel: "organic", landingPath: "/product/test-part" });
    await assert.rejects(() => recordCartActivity(org, { ...input, event: "contact", contact }, "b".repeat(64), sql), { status: 404 });
    assert.equal((await cartActivityReport(otherOrg, sql)).summary.carts, 0);
    await recordCartActivity(org, { ...input, event: "call" }, session, sql);
    await sql`UPDATE hearth_cart_sessions SET last_seen_at=now()-interval '31 minutes' WHERE org_id=${org}`;
    let report = await cartActivityReport(org, sql);
    assert.deepEqual(report.summary, { carts: 1, checkout: 1, contacts: 1, calls: 1, inactive: 1, completed: 0 });
    await recordCartActivity(org, { ...input, event: "heartbeat" }, session, sql);
    assert.equal((await cartActivityReport(org, sql)).summary.inactive, 0);
    await sql`INSERT INTO hearth_parts_orders VALUES(${org},'unused',${sql.json({ cartSessionId: id })},'pending')`;
    assert.equal((await cartActivityReport(org, sql)).summary.completed, 0);
    await sql`UPDATE hearth_parts_orders SET payment_state='authorized' WHERE org_id=${org}`;
    assert.equal((await cartActivityReport(org, sql)).summary.completed, 1);
    const second = randomUUID();
    await recordCartActivity(org, { ...input, journeyId: second }, session, sql);
    await recordCartActivity(org, { ...input, journeyId: second, event: "empty", items: [] }, session, sql);
    await sql`UPDATE hearth_cart_sessions SET last_seen_at=now()-interval '31 minutes' WHERE org_id=${org}`;
    report = await cartActivityReport(org, sql);
    assert.equal(report.summary.inactive, 0);
    assert.equal(report.summary.completed, 1);
    assert.equal(report.summary.carts, 2);
  } finally {
    await sql.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test("cart attribution strips extra fields and rejects URL queries or non-public paths", () => {
  const input = { journeyId: randomUUID(), event: "cart", items: [item] };
  assert.deepEqual(parseCartActivity({ ...input, attribution: { channel: "organic", landingPath: "/parts/napoleon", email: "private" } }).attribution, { channel: "organic", landingPath: "/parts/napoleon" });
  for (const landingPath of ["/contact?email=person@example.com", "/admin/customers/secret", "https://evil.example", "/checkout"]) {
    assert.deepEqual(parseCartActivity({ ...input, attribution: { channel: "organic", landingPath } }).attribution, {});
  }
});
