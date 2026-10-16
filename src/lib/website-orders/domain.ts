import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type WebsiteOrder = {
  id: string;
  customer: { name: string; email: string; phone: string; address: string };
  items: Array<{ sku: string; name: string; quantity: number; unitPriceCents: number }>;
  shipping: { method: string; quoteId: string; amountCents: number };
  tax: { amountCents: number; quoteId: string };
  totalCents: number;
  notes: string;
};
export class OrderError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OrderError("Invalid order details.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, optional = false) {
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > max || (!optional && !value.trim())) throw new OrderError("Missing or invalid order details.");
  return value.trim();
}
function cents(value: unknown, positive = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (positive ? 1 : 0) || Number(value) > 99_999_999) throw new OrderError("Invalid order amount.");
  return Number(value);
}
export function parseWebsiteOrder(value: unknown): WebsiteOrder {
  const v = object(value), customer = object(v.customer), shipping = object(v.shipping), tax = object(v.tax);
  if (typeof v.id !== "string" || !orderIdPattern.test(v.id)) throw new OrderError("Invalid order number.");
  if (!Array.isArray(v.items) || !v.items.length || v.items.length > 50) throw new OrderError("Choose between 1 and 50 order lines.");
  const items = v.items.map(value => {
    const line = object(value);
    if (!Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 100) throw new OrderError("Invalid quantity.");
    return { sku: text(line.sku, 100), name: text(line.name, 250), quantity: Number(line.quantity), unitPriceCents: cents(line.unitPriceCents, true) };
  });
  if (new Set(items.map(line => line.sku)).size !== items.length) throw new OrderError("Duplicate order lines.");
  const result: WebsiteOrder = {
    id: v.id.toLowerCase(), customer: { name: text(customer.name, 200), email: text(customer.email, 254), phone: text(customer.phone, 50), address: text(customer.address, 1000) },
    items, shipping: { method: text(shipping.method, 200), quoteId: text(shipping.quoteId, 200), amountCents: cents(shipping.amountCents) },
    tax: { amountCents: cents(tax.amountCents), quoteId: text(tax.quoteId, 200) }, totalCents: cents(v.totalCents, true), notes: text(v.notes, 2000, true),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.customer.email)) throw new OrderError("Invalid customer email.");
  const total = items.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0) + result.shipping.amountCents + result.tax.amountCents;
  if (total !== result.totalCents) throw new OrderError("Order total does not match its items, shipping and tax.");
  return result;
}
export function orderHash(order: WebsiteOrder) { return createHash("sha256").update(JSON.stringify(order)).digest("hex"); }

// Dedicated server-to-server signing key. No merchant credentials in the website.
export function verifyOrderRequest(method: string, path: string, body: string, headers: Headers, secret: string | undefined, now = Date.now()) {
  const timestamp = headers.get("x-hearthos-timestamp") || "";
  const signature = headers.get("x-hearthos-signature") || "";
  if (!secret || secret.length < 32 || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300_000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}\n${method}\n${path}\n${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function paidSubmission(order: WebsiteOrder, payment: { id: string; receiptUrl: string; orderId: string }, createdAt: string) {
  return {
    id: order.id, type: "order" as const, createdAt,
    ...order.customer, subject: `Paid website order ${order.id.slice(0, 8).toUpperCase()}`, message: order.notes,
    total: order.totalCents / 100,
    // Legacy website requests store line totals, not unit prices.
    items: order.items.map(line => ({ name: line.name, sku: line.sku, quantity: line.quantity, price: line.unitPriceCents * line.quantity / 100 })),
    metadata: { address: order.customer.address, paymentStatus: "Paid", fulfillmentStatus: "Ready to fulfill", squarePaymentId: payment.id,
      squareOrderId: payment.orderId, receiptUrl: payment.receiptUrl, shippingMethod: order.shipping.method,
      shipping: (order.shipping.amountCents / 100).toFixed(2), shippingQuoteId: order.shipping.quoteId,
      tax: (order.tax.amountCents / 100).toFixed(2), taxQuoteId: order.tax.quoteId, itemPriceBasis: "line_total" },
  };
}
