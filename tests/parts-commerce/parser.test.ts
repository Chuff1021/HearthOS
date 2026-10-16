import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSupplierPage } from "../../src/lib/parts-commerce/parser";
import {
  assertPurchasable,
  parseAddress,
  parseCart,
} from "../../src/lib/parts-commerce/domain";
const url = "https://www.stove-parts-unlimited.com/part.htm";
function page(extra = {}, availability = "In Stock") {
  return `<div class="productView"><h1 class="productView-title">A gasket (ABC)</h1><input name="product_id" value="123"/><span class="productView-info-name">Availability:</span><span class="productView-info-value">${availability}</span></div><script>var BCData = ${JSON.stringify({ product_attributes: { sku: "ABC", price: { without_tax: { value: 12.34, currency: "USD" }, rrp_without_tax: { value: 20 } }, instock: true, purchasable: true, stock: 5, ...extra } })};</script>`;
}
test("reads sale price, exact quantity and stable identity", () => {
  const o = parseSupplierPage(page(), url, { sku: "ABC", sourceId: "123" });
  assert.equal(o.priceCents, 1234);
  assert.equal(o.listCents, 2000);
  assert.equal(o.quantity, 5);
  assert.equal(o.status, "available");
  assert.equal(o.key, "spu:123");
});
test("unknown quantity stays null; flag alone does not prove stock", () => {
  const o = parseSupplierPage(page({ stock: null }, ""), url);
  assert.equal(o.quantity, null);
  assert.equal(o.status, "unverified");
  assert.equal(
    parseSupplierPage(page({ stock: null }), url).status,
    "available",
  );
});
test("purchasable special-order pages are not physical stock", () => {
  assert.equal(
    parseSupplierPage(
      page({ stock: null }, "Usually Ships in 2 to 4 Weeks"),
      url,
    ).status,
    "special_order",
  );
});
test("malformed pages and missing fields never turn into zero stock", () => {
  for (const html of [
    "<html>Captcha</html>",
    page({ stock: undefined }),
    page({ instock: undefined }),
    page({ price: { without_tax: { value: 1 } } }),
  ])
    assert.throws(() => parseSupplierPage(html, url));
});
test("mismatched identity and unexpected origins are rejected", () => {
  assert.throws(() =>
    parseSupplierPage(page(), url, { sku: "WRONG", sourceId: "123" }),
  );
  assert.throws(() => parseSupplierPage(page(), "https://evil.example/"));
});
test("required variants need review; out-of-stock flags beat availability text", () => {
  assert.equal(
    parseSupplierPage(page() + `<div data-product-attribute="set-select">`, url)
      .requiresOptions,
    true,
  );
  assert.equal(
    parseSupplierPage(page({ stock: 0 }), url).status,
    "out_of_stock",
  );
});
test("checkout rejects stale data, insufficient stock and special orders", () => {
  const o = parseSupplierPage(page(), url);
  assert.doesNotThrow(() => assertPurchasable(o, 1));
  assert.throws(() => assertPurchasable(o, 6));
  assert.throws(() => assertPurchasable({ ...o, checkedAt: "bad" }, 1));
  assert.throws(() =>
    assertPurchasable(
      { ...o, checkedAt: new Date(Date.now() - 61000).toISOString() },
      1,
    ),
  );
  assert.throws(() => assertPurchasable({ ...o, status: "special_order" }, 1));
});
test("validates lower-48 destinations and unique bounded cart quantities", () => {
  const a = {
    name: "Customer",
    email: "a@example.com",
    street: "1 Main",
    city: "Republic",
    state: "MO",
    zip: "65738",
    country: "US",
  };
  assert.equal(parseAddress(a).state, "MO");
  assert.throws(() => parseAddress({ ...a, state: "AK" }));
  assert.throws(() =>
    parseCart([
      { key: "spu:1", quantity: 1 },
      { key: "spu:1", quantity: 2 },
    ]),
  );
  assert.throws(() => parseCart([{ key: "spu:1", quantity: 0 }]));
});

test("ordinary 1–2 business day processing is available; weeks are special-order", () => {
  assert.equal(
    parseSupplierPage(page({}, "Usually Ships in 1 to 2 Business Days"), url)
      .status,
    "available",
  );
  assert.equal(
    parseSupplierPage(
      page({ stock: null }, "Usually Ships in 1 to 2 Weeks"),
      url,
    ).status,
    "special_order",
  );
});
