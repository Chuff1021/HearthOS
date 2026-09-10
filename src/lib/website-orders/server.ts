import "server-only";
import postgres from "postgres";
import { squareOrganization } from "@/lib/invoices/square-capture-intent";
import { websiteInboxConfig } from "@/lib/website-inbox/config";
import { OrderError, type WebsiteOrder } from "./domain";
import { createWebsiteOrderStore, type SavedWebsiteOrder } from "./store";
import { createWebsiteSquareClient } from "./square";

let store: ReturnType<typeof createWebsiteOrderStore> | undefined;
export function websiteOrdersEnabled() {
  return process.env.HEARTHOS_WEBSITE_ORDERS_ENABLED === "true";
}
async function services() {
  const inbox = websiteInboxConfig();
  const secret = process.env.HEARTHOS_WEBSITE_ORDER_SECRET;
  const { SQUARE_ACCESS_TOKEN: accessToken, SQUARE_LOCATION_ID: locationId, DATABASE_URL: database, SQUARE_ENVIRONMENT: environment } = process.env;
  if (!websiteOrdersEnabled() || !inbox || !secret || secret.length < 32 || !accessToken || !locationId || !database || !["sandbox", "production"].includes(environment || "")) throw new OrderError("Online payment setup is not complete.", 503);
  if (await squareOrganization() !== inbox.orgId) throw new OrderError("Square and website inbox belong to different businesses.", 503);
  const orders = store ??= createWebsiteOrderStore(postgres(database, { max: 2, idle_timeout: 20, connect_timeout: 10 }));
  const square = createWebsiteSquareClient({ accessToken, locationId, environment: environment as "production" | "sandbox" });
  return { inbox, orders, square };
}
export async function createWebsiteCheckout(order: WebsiteOrder) {
  const { inbox, orders, square } = await services();
  const saved = await orders.reserve(inbox.orgId, order);
  if (saved.state === "paid") return { orderId: order.id, status: "paid" };
  if (saved.checkout_url) return { orderId: order.id, status: "pending", url: saved.checkout_url };
  const link = await square.createLink(inbox.orgId, order);
  await orders.link(inbox.orgId, order.id, link);
  return { orderId: order.id, status: "pending", url: link.url };
}
async function confirm(saved: SavedWebsiteOrder, s: Awaited<ReturnType<typeof services>>) {
  if (saved.state === "paid") return { orderId: saved.id, status: "paid", receiptUrl: saved.receipt_url };
  if (!saved.square_order_id) return { orderId: saved.id, status: "pending" };
  const payment = await s.square.completedPayment(saved.square_order_id, saved.snapshot.totalCents);
  if (payment) await s.orders.paid(s.inbox.orgId, s.inbox.source, saved.id, payment);
  else await s.orders.checked(s.inbox.orgId, saved.id);
  return { orderId: saved.id, status: payment ? "paid" : "pending", ...(payment ? { receiptUrl: payment.receiptUrl } : {}) };
}
export async function websiteOrderStatus(id: string) {
  const s = await services();
  const saved = await s.orders.read(s.inbox.orgId, id);
  if (!saved) throw new OrderError("Order not found.", 404);
  return confirm(saved, s);
}
export async function verifiedWebsitePayments(orgId: string, ids: string[]) {
  if (!websiteOrdersEnabled()) return [];
  const s = await services();
  if (orgId !== s.inbox.orgId) return [];
  return s.orders.paidOrders(orgId, ids);
}
export async function reconcileWebsiteOrders() {
  if (!websiteOrdersEnabled()) return { enabled: false, checked: 0, paid: 0, needsReview: 0 };
  const s = await services();
  const pending = await s.orders.pending(s.inbox.orgId, 5);
  let paid = 0, needsReview = 0;
  // Independent orders progress even if one needs attention. A failed check stays pending.
  await Promise.all(pending.map(async order => {
    try { if ((await confirm(order, s)).status === "paid") paid += 1; }
    catch { needsReview += 1; await s.orders.checked(s.inbox.orgId, order.id); }
  }));
  return { enabled: true, checked: pending.length, paid, needsReview };
}
