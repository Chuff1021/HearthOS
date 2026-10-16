import { OrderError, type WebsiteOrder } from "./domain";

type SquareConfig = { accessToken: string; locationId: string; environment: "production" | "sandbox" };
export function createWebsiteSquareClient(config: SquareConfig, request: typeof fetch = fetch) {
  const base = config.environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  async function call(path: string, body?: unknown) {
    const response = await request(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", "Square-Version": "2026-08-19" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new OrderError("Square is temporarily unavailable. Retry this same checkout.", 503);
    return response.json();
  }
  return {
    async createLink(orgId: string, order: WebsiteOrder) {
      const data = await call("/v2/online-checkout/payment-links", {
        idempotency_key: `website:${orgId}:${order.id}`,
        quick_pay: { name: `Aaron's Fireplace order ${order.id.slice(0, 8).toUpperCase()}`, location_id: config.locationId, price_money: { amount: order.totalCents, currency: "USD" } },
        checkout_options: { allow_tipping: false, ask_for_shipping_address: false, redirect_url: `https://aaronsfireplaceco.com/checkout/confirmation?order=${order.id}` },
        pre_populated_data: { buyer_email: order.customer.email },
        description: `Website order ${order.id}. Items, shipping and tax are included in the confirmed order total.`,
      });
      const link = data?.payment_link;
      if (typeof link?.id !== "string" || typeof link.order_id !== "string" || typeof link.url !== "string") throw new OrderError("Square payment link could not be confirmed.", 503);
      const url = new URL(link.url);
      if (url.protocol !== "https:" || !["square.link", "checkout.square.site", "sandbox.square.link", "connect.squareupsandbox.com"].includes(url.hostname)) throw new OrderError("Square returned an unexpected payment URL.", 503);
      return { id: link.id, orderId: link.order_id, url: link.url as string };
    },
    async completedPayment(orderId: string, amountCents: number) {
      const data = await call(`/v2/orders/${encodeURIComponent(orderId)}`);
      const order = data?.order;
      if (order?.id !== orderId || order.location_id !== config.locationId || order.total_money?.currency !== "USD" || order.total_money?.amount !== amountCents) throw new OrderError("Square order does not match the checkout.", 409);
      if (!Array.isArray(order.tenders) || !order.tenders.length) return null;
      // Hosted checkout expects exactly one full payment; partial/split payments need review.
      if (order.tenders.length !== 1 || typeof order.tenders[0]?.payment_id !== "string") throw new OrderError("Payment requires review.", 409);
      const paymentData = await call(`/v2/payments/${encodeURIComponent(order.tenders[0].payment_id)}`);
      const p = paymentData?.payment;
      if (p?.id !== order.tenders[0].payment_id || p.order_id !== orderId || p.location_id !== config.locationId || p.amount_money?.currency !== "USD" || p.amount_money?.amount !== amountCents) throw new OrderError("Square payment does not match the checkout.", 409);
      if (p.status !== "COMPLETED") return null;
      if (Number(p.refunded_money?.amount || 0) > 0) throw new OrderError("Refunded payment requires review before fulfillment.", 409);
      return { id: p.id as string, orderId, amountCents, receiptUrl: typeof p.receipt_url === "string" ? p.receipt_url : "" };
    },
  };
}
