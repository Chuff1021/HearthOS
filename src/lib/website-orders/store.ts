import type { Sql } from "postgres";
import { OrderError, orderHash, paidSubmission, type WebsiteOrder } from "./domain";

export type SavedWebsiteOrder = {
  id: string; org_id: string; request_hash: string; snapshot: WebsiteOrder; state: "pending" | "paid";
  square_order_id: string | null; square_payment_link_id: string | null; checkout_url: string | null;
  square_payment_id: string | null; receipt_url: string | null; created_at: Date; paid_at: Date | null;
};
export function createWebsiteOrderStore(sql: Sql) {
  return {
    async reserve(orgId: string, order: WebsiteOrder) {
      const hash = orderHash(order);
      await sql`INSERT INTO hearth_website_orders (org_id,id,request_hash,snapshot)
        VALUES (${orgId},${order.id},${hash},${sql.json(order)}) ON CONFLICT DO NOTHING`;
      const [saved] = await sql<SavedWebsiteOrder[]>`SELECT * FROM hearth_website_orders WHERE org_id=${orgId} AND id=${order.id}`;
      if (!saved || saved.request_hash !== hash) throw new OrderError("This order number already belongs to a different checkout.", 409);
      return saved;
    },
    async read(orgId: string, id: string) {
      const [saved] = await sql<SavedWebsiteOrder[]>`SELECT * FROM hearth_website_orders WHERE org_id=${orgId} AND id=${id}`;
      return saved;
    },
    async paidOrders(orgId: string, ids: string[]) {
      if (!ids.length) return [];
      return sql<Array<{ id: string; square_payment_id: string; paid_at: Date }>>`SELECT id,square_payment_id,paid_at FROM hearth_website_orders
        WHERE org_id=${orgId} AND state='paid' AND id IN ${sql(ids)}`;
    },
    async link(orgId: string, id: string, link: { orderId: string; id: string; url: string }) {
      const rows = await sql`UPDATE hearth_website_orders SET square_order_id=${link.orderId},square_payment_link_id=${link.id},checkout_url=${link.url}
        WHERE org_id=${orgId} AND id=${id} AND (square_order_id IS NULL OR square_order_id=${link.orderId}) RETURNING id`;
      if (rows.length !== 1) throw new OrderError("Payment link needs review.", 409);
    },
    async pending(orgId: string, limit = 10) {
      return sql<SavedWebsiteOrder[]>`SELECT * FROM hearth_website_orders WHERE org_id=${orgId} AND state='pending' AND square_order_id IS NOT NULL
        ORDER BY checked_at ASC NULLS FIRST,created_at ASC LIMIT ${limit}`;
    },
    async checked(orgId: string, id: string) {
      await sql`UPDATE hearth_website_orders SET checked_at=now() WHERE org_id=${orgId} AND id=${id}`;
    },
    async paid(orgId: string, source: string, id: string, payment: { id: string; orderId: string; amountCents: number; receiptUrl: string }) {
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const [saved] = await tx<SavedWebsiteOrder[]>`SELECT * FROM hearth_website_orders WHERE org_id=${orgId} AND id=${id} FOR UPDATE`;
        if (!saved || saved.square_order_id !== payment.orderId || saved.snapshot.totalCents !== payment.amountCents) throw new OrderError("Payment does not match the website order.", 409);
        if (saved.state === "paid") {
          if (saved.square_payment_id !== payment.id) throw new OrderError("Order already has a different payment.", 409);
          return;
        }
        const receivedAt = new Date().toISOString();
        const payload = paidSubmission(saved.snapshot, payment, receivedAt);
        const inserted = await tx`INSERT INTO hearth_website_inbox (org_id,source,external_id,kind,received_at,payload)
          VALUES (${orgId},${source},${id},'order',${receivedAt},${tx.json(payload)}) ON CONFLICT DO NOTHING RETURNING external_id`;
        if (!inserted.length) throw new OrderError("An existing inbox request uses this order number. Review required.", 409);
        await tx`UPDATE hearth_website_orders SET state='paid',square_payment_id=${payment.id},receipt_url=${payment.receiptUrl},paid_at=now(),checked_at=now()
          WHERE org_id=${orgId} AND id=${id}`;
      });
    },
  };
}
