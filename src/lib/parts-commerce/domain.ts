import { createHash } from "node:crypto";

export class CommerceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Availability =
  "available" | "special_order" | "out_of_stock" | "unverified";
export type Address = {
  name: string;
  email: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: "US";
};
export type CartLine = { key: string; quantity: number };
export type Offer = {
  key: string;
  sku: string;
  sourceId: string;
  url: string;
  name: string;
  priceCents: number;
  listCents: number | null;
  quantity: number | null;
  status: Availability;
  availability: string;
  checkedAt: string;
  hash: string;
  requiresOptions: boolean;
  catalog: Record<string, unknown>;
};
export type Quote = {
  id: string;
  address: Address;
  lines: Array<
    CartLine & {
      sku: string;
      name: string;
      unitPriceCents: number;
      sourceId: string;
      offerHash: string;
    }
  >;
  shipping: {
    id: string;
    label: string;
    amountCents: number;
    supplierCartId: string;
  };
  taxCents: number;
  totalCents: number;
  expiresAt: string;
  manualShipping?: { reference: string; confirmedBy: string };
};
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function text(value: unknown, max = 200, optional = false) {
  if (optional && (value === undefined || value === null)) return "";
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (!optional && !value.trim())
  )
    throw new CommerceError("Missing or invalid details.");
  return value.trim();
}
export function cents(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 999999
  )
    throw new CommerceError("Invalid price.");
  return Math.round(value * 100);
}
export function parseCart(input: unknown): CartLine[] {
  if (!Array.isArray(input) || !input.length || input.length > 25)
    throw new CommerceError("Choose between 1 and 25 different parts.");
  const lines = input.map((line) => {
    if (
      !Number.isSafeInteger(line?.quantity) ||
      line.quantity < 1 ||
      line.quantity > 100
    )
      throw new CommerceError("Invalid quantity.");
    return { key: text(line.key, 150), quantity: line.quantity as number };
  });
  if (new Set(lines.map((l) => l.key)).size !== lines.length)
    throw new CommerceError("Combine duplicate cart lines.");
  return lines;
}
export function parseAddress(input: Record<string, unknown>): Address {
  if (!input || typeof input !== "object")
    throw new CommerceError("Enter a shipping address.");
  const result: Address = {
    name: text(input.name),
    email: text(input.email, 254),
    phone: text(input.phone, 50, true),
    street: text(input.street),
    street2: text(input.street2, 200, true),
    city: text(input.city),
    state: text(input.state, 2).toUpperCase(),
    zip: text(input.zip, 10),
    country: "US",
  };
  const states =
    "AL AR AZ CA CO CT DE FL GA IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(
      " ",
    );
  if (
    input.country !== "US" ||
    !states.includes(result.state) ||
    !/^\d{5}(-\d{4})?$/.test(result.zip)
  )
    throw new CommerceError(
      "Automatic shipping currently serves the contiguous United States. Please request a quote for this address.",
    );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
    throw new CommerceError("Enter a valid email address.");
  return result;
}
export function supplierUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.stove-parts-unlimited.com" ||
    url.port ||
    url.username ||
    url.password
  )
    throw new CommerceError("Unexpected supplier address.");
  return url;
}
export function assertPurchasable(
  offer: Offer,
  quantity: number,
  now = Date.now(),
) {
  if (
    offer.status !== "available" ||
    offer.requiresOptions ||
    !Number.isSafeInteger(offer.priceCents) ||
    offer.priceCents < 1 ||
    !Number.isFinite(Date.parse(offer.checkedAt)) ||
    now - Date.parse(offer.checkedAt) > 60_000 ||
    (offer.quantity !== null && offer.quantity < quantity)
  ) {
    throw new CommerceError(
      `${offer.sku}: availability needs confirmation. Request an online quote.`,
      409,
    );
  }
}
