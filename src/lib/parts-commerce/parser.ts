import {
  CommerceError,
  cents,
  hash,
  supplierUrl,
  type Offer,
  type Availability,
} from "./domain";

export const PARSER_VERSION = 1;
export const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const match = (html: string, regex: RegExp) =>
  plain(html.match(regex)?.[1] || "");
export function parseSupplierPage(
  html: string,
  url: string,
  expected?: { sku: string; sourceId: string },
  now = new Date(),
): Offer {
  supplierUrl(url);
  if (
    !html.includes("productView") ||
    /<title[^>]*>[^<]*(?:just a moment|access denied|captcha)/i.test(html)
  )
    throw new CommerceError("Supplier page blocked or not a product.", 503);
  const source = html.match(/\bvar\s+BCData\s*=\s*({[\s\S]*?});/)?.[1];
  let attributes;
  try {
    attributes = JSON.parse(source || "").product_attributes;
  } catch {
    throw new CommerceError("Supplier page format changed.", 503);
  }
  if (
    !attributes ||
    typeof attributes.instock !== "boolean" ||
    typeof attributes.purchasable !== "boolean"
  )
    throw new CommerceError("Supplier availability is incomplete.", 503);
  const sourceId =
    html.match(/name=["']product_id["']\s+value=["'](\d+)["']/)?.[1] || "";
  const sku = typeof attributes.sku === "string" ? attributes.sku.trim() : "";
  if (
    !sourceId ||
    !sku ||
    (expected && (sku !== expected.sku || sourceId !== expected.sourceId))
  )
    throw new CommerceError("Supplier product identity changed.", 409);
  const price = attributes.price?.without_tax;
  if (
    price?.currency !== "USD" ||
    typeof price.value !== "number" ||
    price.value <= 0 ||
    attributes.call_for_price_message
  )
    throw new CommerceError("Supplier price is not verifiable.", 503);
  const quantity = attributes.stock;
  if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 0))
    throw new CommerceError("Supplier quantity is invalid.", 503);
  const availability = match(
    html,
    /<span[^>]*class="productView-info-name"[^>]*>Availability:<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/,
  );
  const special =
    /(?:special[ -]?order|back[ -]?order|\bweeks?\b|\bmonths?\b|manufacturer|made to order)/i.test(
      availability,
    );
  let status: Availability =
    !attributes.instock || !attributes.purchasable || quantity === 0
      ? "out_of_stock"
      : special
        ? "special_order"
        : "available";
  // A purchasing flag alone is not proof of physical stock.
  if (
    status === "available" &&
    quantity === null &&
    !/in stock|ships? (?:in|within) (?:1|24|one|next)|ships? in 1 to 2 business days|same day/i.test(
      availability,
    )
  )
    status = "unverified";
  const rrp = attributes.price?.rrp_without_tax?.value;
  const priceCents = cents(price.value),
    listCents =
      typeof rrp === "number" && rrp > price.value ? cents(rrp) : null;
  const name = match(
    html,
    /<h1[^>]*class="[^"]*productView-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/,
  );
  if (!name) throw new CommerceError("Supplier product title is missing.", 503);
  // Required selections are excluded from automatic checkout until a variant mapping is reviewed.
  const optionsHtml =
    html.match(
      /<div data-product-option-change[^>]*>([\s\S]*?)<div class="form-field form-field--stock"/,
    )?.[1] || html;
  const requiresOptions =
    /data-product-attribute="(?:set-select|set-radio|set-checkbox|set-rectangle|set-product|swatch|input-text|input-number|input-checkbox|textarea|date|input-file)"/.test(
      optionsHtml,
    );
  const catalog = {
    name,
    description:
      match(html, /<meta\s+name="description"\s+content="([^"]*)"/i) || name,
    imageUrl: match(html, /<meta\s+property="og:image"\s+content="([^"]*)"/i),
  };
  return {
    key: `spu:${sourceId}`,
    sku,
    sourceId,
    url,
    name,
    priceCents,
    listCents,
    quantity,
    status,
    availability,
    checkedAt: now.toISOString(),
    requiresOptions,
    catalog,
    hash: hash({
      sourceId,
      sku,
      name,
      priceCents,
      listCents,
      quantity,
      status,
      availability,
      requiresOptions,
      parserVersion: PARSER_VERSION,
    }),
  };
}
