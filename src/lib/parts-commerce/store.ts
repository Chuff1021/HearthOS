import postgres, { type Sql } from "postgres";
import { CommerceError, hash, type Offer, type Quote } from "./domain";

let connection: Sql;
export function commerceDb() {
  if (!process.env.DATABASE_URL)
    throw new CommerceError("Parts database is not configured.", 503);
  return (connection ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  }));
}
export type PartRow = {
  key: string;
  sku: string;
  source_id: string;
  url: string;
  catalog: Record<string, unknown>;
  offer: Offer | null;
  override: { status: Offer["status"]; message: string } | null;
  duplicate: boolean;
  pilot: boolean;
  last_error: string | null;
  last_verified_at: Date | null;
  lease_token: string;
  failures: number;
};
export type OrderRow = {
  id: string;
  org_id: string;
  quote_id: string;
  snapshot: Quote;
  session_hash: string;
  square_order_id: string | null;
  square_payment_id: string | null;
  payment_state: string;
  fulfillment_state: string;
  delayed_until: Date | null;
  supplier_confirmation: string | null;
  tracking: string | null;
  receipt_url: string | null;
  last_error: string | null;
  created_at: Date;
};
export function effectiveOffer(row: PartRow): Offer | null {
  if (!row.offer) return null;
  const status =
    row.duplicate || row.last_error
      ? "unverified"
      : row.override?.status || row.offer.status;
  const availability = row.override?.message || row.offer.availability;
  return {
    ...row.offer,
    status,
    availability,
    hash: hash([row.offer.hash, row.override, row.duplicate, row.last_error]),
  };
}
export async function readParts(
  org: string,
  keys: string[],
  sql = commerceDb(),
) {
  return sql<
    PartRow[]
  >`SELECT * FROM hearth_parts WHERE org_id=${org} AND key IN ${sql(keys)} ORDER BY key`;
}
export async function saveOffer(
  org: string,
  row: PartRow,
  offer: Offer,
  lease?: string,
) {
  const sql = commerceDb();
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const updated =
      await tx`UPDATE hearth_parts SET offer=${tx.json(JSON.parse(JSON.stringify(offer)))},last_verified_at=${offer.checkedAt},last_attempt_at=now(),
      last_error=NULL,failures=0,lease_until=NULL,lease_token=NULL,
      next_scan_at=CASE WHEN active_until>now() THEN now()+interval '15 minutes' ELSE now()+interval '24 hours' END
      WHERE org_id=${org} AND key=${row.key} AND (${lease || null}::uuid IS NULL OR lease_token=${lease || null}::uuid)
      RETURNING key`;
    if (updated.length)
      await tx`INSERT INTO hearth_parts_history(org_id,key,kind,payload)
      SELECT ${org},${row.key},'scan',${tx.json(JSON.parse(JSON.stringify(offer)))} WHERE ${row.offer?.hash || ""}<>${offer.hash}`;
  });
}
export async function saveScanError(
  org: string,
  key: string,
  message: string,
  retrySeconds: number,
  lease?: string,
) {
  const sql = commerceDb();
  await sql`UPDATE hearth_parts SET last_attempt_at=now(),last_error=${message.slice(0, 200)},failures=failures+1,
    next_scan_at=now()+make_interval(secs=>${retrySeconds}),lease_until=NULL,lease_token=NULL
    WHERE org_id=${org} AND key=${key} AND (${lease || null}::uuid IS NULL OR lease_token=${lease || null}::uuid)`;
}
export async function outbox(
  tx: Sql,
  org: string,
  id: string,
  to: string,
  subject: string,
  body: string,
) {
  if (!to) return;
  await tx`INSERT INTO hearth_parts_outbox(org_id,id,payload) VALUES (${org},${id},${tx.json({ to, subject, body })}) ON CONFLICT DO NOTHING`;
}
export async function publishOrder(org: string, id: string) {
  const sql = commerceDb();
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const [order] = await tx<
      OrderRow[]
    >`SELECT * FROM hearth_parts_orders WHERE org_id=${org} AND id=${id} FOR UPDATE`;
    if (!order || order.payment_state === "pending") return;
    const q = order.snapshot;
    const status =
      {
        authorized: "Authorized — supplier order needed",
        paid: "Paid",
        voided: "Authorization canceled",
        failed: "Payment failed",
        refunding: "Refund pending",
        refunded: "Refunded",
      }[order.payment_state] || "Review needed";
    const payload = {
      id: order.id,
      type: "order",
      createdAt: order.created_at.toISOString(),
      name: q.address.name,
      email: q.address.email,
      phone: q.address.phone,
      subject: `${status} · ${id.slice(0, 8).toUpperCase()}`,
      message: "Parts website order",
      total: q.totalCents / 100,
      items: q.lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        price: (l.unitPriceCents * l.quantity) / 100,
      })),
      metadata: {
        address: [
          q.address.street,
          q.address.street2,
          `${q.address.city}, ${q.address.state} ${q.address.zip}`,
        ]
          .filter(Boolean)
          .join("\n"),
        paymentStatus: status,
        fulfillmentStatus: order.fulfillment_state,
        partsCommerce: "true",
        squarePaymentId: order.square_payment_id || "",
        supplierConfirmation: order.supplier_confirmation || "",
        tracking: order.tracking || "",
        shippingMethod: q.shipping.label,
        authorizationExpires: order.delayed_until?.toISOString() || "",
        itemPriceBasis: "line_total",
      },
    };
    await tx`INSERT INTO hearth_website_inbox(org_id,source,external_id,kind,received_at,payload)
      VALUES(${org},'aarons-website',${id},'order',${order.created_at},${tx.json(payload)})
      ON CONFLICT(org_id,source,external_id) DO UPDATE SET payload=EXCLUDED.payload`;
    const body = `Aaron's Fireplace Co. order ${id.slice(0, 8).toUpperCase()}\n${status}\nTotal: $${(q.totalCents / 100).toFixed(2)}\n${order.payment_state === "authorized" ? "This is a temporary card hold. We will capture payment after confirming your supplier order." : ""}\n${order.tracking ? `Tracking: ${order.tracking}` : ""}\nQuestions? Reply to this email.`;
    await outbox(
      tx,
      org,
      `${id}:${order.payment_state}`,
      q.address.email,
      `Aaron's order ${id.slice(0, 8).toUpperCase()}: ${status}`,
      body,
    );
    if (order.tracking)
      await outbox(
        tx,
        org,
        `${id}:tracking:${hash(order.tracking).slice(0, 16)}`,
        q.address.email,
        "Your parts have shipped",
        body,
      );
  });
}
