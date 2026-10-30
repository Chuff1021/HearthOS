import type { Sql } from "postgres";
import { CommerceError, hash, text, uuid } from "./domain";
import { commerceDb } from "./store";

type CartItem = { name: string; sku: string; quantity: number; price: number };
type Contact = { name: string; email: string; phone: string };
type Attribution = { channel: string; landingPath: string };
const events = ["cart", "checkout", "heartbeat", "leave", "contact", "call", "empty"];

export function parseCartActivity(input: Record<string, unknown>) {
  if (typeof input.journeyId !== "string" || !uuid.test(input.journeyId) ||
      typeof input.event !== "string" || !events.includes(input.event))
    throw new CommerceError("Invalid cart activity.");
  const items = input.items;
  if (!Array.isArray(items) || items.length > 25 || (!items.length && input.event !== "empty"))
    throw new CommerceError("Choose items for your cart.");
  const lines: CartItem[] = items.map((item) => {
    if (!Number.isSafeInteger(item?.quantity) || item.quantity < 1 || item.quantity > 100 ||
        typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 || item.price > 1000000)
      throw new CommerceError("Invalid cart item.");
    return { name: text(item.name, 300), sku: text(item.sku, 150, true), quantity: item.quantity, price: item.price };
  });
  let contact: Contact | null = null;
  if (input.event === "contact") {
    const c = input.contact as Partial<Contact> | undefined;
    if (!c || typeof c !== "object") throw new CommerceError("Enter your contact details.");
    contact = { name: text(c.name, 150), email: text(c.email, 254, true), phone: text(c.phone, 50, true) };
    if ((!contact.email && !contact.phone) ||
        (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) ||
        (contact.phone && contact.phone.replace(/\D/g, "").length < 10))
      throw new CommerceError("Enter a valid email or phone number.");
  }
  const a = input.attribution as Partial<Attribution> | undefined;
  const attribution = a && typeof a === "object" &&
    ["organic", "direct", "referral", "social", "email", "paid"].includes(a.channel || "") &&
    typeof a.landingPath === "string" && a.landingPath.length <= 220 &&
    /^\/(?:$|(?:category|product|guides|parts|tools)(?:\/[a-z0-9-]+){0,3}\/?$|(?:installation|showrooms|about|contact|shipping|returns|faq|warranty)\/?$)/.test(a.landingPath)
    ? { channel: a.channel!, landingPath: a.landingPath } : {};
  const intent = input.intent === "quote" ? "quote" : input.intent === "callback" ? "callback" : "checkout";
  return { id: input.journeyId, event: input.event, items: lines, contact, intent, attribution,
    notes: input.event === "contact" ? text(input.notes, 2000, true) : "" };
}

export async function recordCartActivity(org: string, input: Record<string, unknown>, session: string, sql = commerceDb()) {
  const v = parseCartActivity(input), sessionHash = hash(session);
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    // Serialize first writes from the same browser, including rate-limit checks.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${org}),hashtext(${sessionHash}))`;
    const [previous] = await tx`SELECT session_hash,contact_at,contact,items,attribution FROM hearth_cart_sessions WHERE org_id=${org} AND id=${v.id} FOR UPDATE`;
    if (previous && previous.session_hash !== sessionHash) throw new CommerceError("Cart session unavailable.", 404);
    if (!previous) {
      const [rate] = await tx`SELECT count(*)::int AS count FROM hearth_cart_sessions WHERE org_id=${org} AND session_hash=${sessionHash} AND created_at>now()-interval '24 hours'`;
      if (rate.count >= 30) throw new CommerceError("Please try again later.", 429);
      if (["empty", "leave", "heartbeat"].includes(v.event)) return;
    }
    await tx`INSERT INTO hearth_cart_sessions(org_id,id,session_hash,items,checkout_at,called_at,contact_at,contact,attribution)
      VALUES(${org},${v.id},${sessionHash},${tx.json(v.items)},${v.event === "checkout" || v.contact ? new Date() : null},${v.event === "call" ? new Date() : null},${v.contact ? new Date() : null},${v.contact ? tx.json(v.contact) : null},${tx.json(v.attribution)})
      ON CONFLICT(org_id,id) DO UPDATE SET last_seen_at=now(),
      attribution=CASE WHEN hearth_cart_sessions.attribution='{}'::jsonb THEN EXCLUDED.attribution ELSE hearth_cart_sessions.attribution END,
      checkout_at=CASE WHEN ${v.event === "checkout" || Boolean(v.contact)} THEN COALESCE(hearth_cart_sessions.checkout_at,now()) ELSE hearth_cart_sessions.checkout_at END,
      called_at=CASE WHEN ${v.event === "call"} THEN COALESCE(hearth_cart_sessions.called_at,now()) ELSE hearth_cart_sessions.called_at END,
      contact_at=CASE WHEN ${Boolean(v.contact)} THEN COALESCE(hearth_cart_sessions.contact_at,now()) ELSE hearth_cart_sessions.contact_at END,
      contact=COALESCE(EXCLUDED.contact,hearth_cart_sessions.contact),
      emptied_at=CASE WHEN ${v.event === "empty"} THEN now() WHEN ${["cart", "checkout", "contact"].includes(v.event)} THEN NULL ELSE hearth_cart_sessions.emptied_at END,
      items=CASE WHEN ${["cart", "checkout", "contact", "empty"].includes(v.event)} THEN EXCLUDED.items ELSE hearth_cart_sessions.items END`;
    if (!v.contact) return;
    // One follow-up per cart session; later field edits update it without resetting
    // the owner's contacted/follow-up status. This is never a paid order.
    const firstContact = previous?.contact_at || new Date();
    const payload = {
      id: v.id, type: "contact", createdAt: new Date(firstContact).toISOString(),
      ...v.contact,
      subject: v.intent === "quote" ? "Checkout shipping quote requested" : v.intent === "callback" ? "Checkout callback requested" : "Checkout follow-up — no payment collected",
      message: ["Customer shared contact details while checking out. Follow up to help complete the order.", v.notes].filter(Boolean).join("\n\n"),
      items: v.items.map((item) => ({ ...item, price: Math.round(item.price * item.quantity * 100) / 100 })),
      metadata: { ...(previous?.attribution?.channel ? { trafficChannel: previous.attribution.channel, landingPage: previous.attribution.landingPath } : v.attribution.channel ? { trafficChannel: v.attribution.channel, landingPage: v.attribution.landingPath } : {}), checkoutFollowUp: "true", paymentStatus: "Not collected — contact request only", itemPriceBasis: "line_total", priceNote: "Cart estimates only; verify availability, shipping, tax and final total before taking payment." },
    };
    await tx`INSERT INTO hearth_website_inbox(org_id,source,external_id,kind,received_at,payload)
      VALUES(${org},'aarons-website',${v.id},'contact',${firstContact},${tx.json(payload)})
      ON CONFLICT(org_id,source,external_id) DO UPDATE SET payload=EXCLUDED.payload`;
  });
  return { ok: true };
}

export async function cartActivityReport(org: string, sql = commerceDb()) {
  // Only the server-bound cart ID on a verified order counts as completion.
  // A phone click is not proof that an order was actually placed or paid.
  const rows = await sql`SELECT c.id,c.created_at,c.last_seen_at,c.checkout_at,c.contact_at,c.called_at,c.emptied_at,c.items,c.contact,c.attribution,
    EXISTS(SELECT 1 FROM hearth_parts_orders o WHERE o.org_id=c.org_id AND o.snapshot->>'cartSessionId'=c.id::text
      AND o.payment_state IN ('authorized','paid','refunding','refunded')) AS completed
    FROM hearth_cart_sessions c WHERE c.org_id=${org} AND c.created_at>=now()-interval '30 days' ORDER BY c.created_at DESC`;
  const inactive = (row: typeof rows[number]) => !row.completed && !row.emptied_at && Date.now() - new Date(row.last_seen_at).getTime() >= 30 * 60000;
  const [started] = await sql`SELECT min(created_at) AS started_at FROM hearth_cart_sessions WHERE org_id=${org}`;
  const channels = new Map<string, { channel: string; carts: number; checkout: number; contacts: number; calls: number; authorized: number }>();
  for (const row of rows) {
    const channel = row.attribution?.channel || "unattributed";
    const total = channels.get(channel) || { channel, carts: 0, checkout: 0, contacts: 0, calls: 0, authorized: 0 };
    total.carts++; if (row.checkout_at) total.checkout++; if (row.contact_at) total.contacts++;
    if (row.called_at) total.calls++; if (row.completed) total.authorized++;
    channels.set(channel, total);
  }
  return {
    channels: [...channels.values()].sort((a,b) => b.carts-a.carts),
    startedAt: started.started_at,
    summary: {
      carts: rows.length, checkout: rows.filter((r) => r.checkout_at).length,
      contacts: rows.filter((r) => r.contact_at).length, calls: rows.filter((r) => r.called_at).length,
      inactive: rows.filter(inactive).length, completed: rows.filter((r) => r.completed).length,
    },
    recent: rows.slice(0, 50).map((row) => ({
      id: row.id, createdAt: row.created_at, lastSeenAt: row.last_seen_at,
      attribution: row.attribution as Attribution | null, contact: row.contact as Contact | null, items: row.items as CartItem[],
      status: row.completed ? "Online order authorized" : row.emptied_at ? "Cart cleared" : inactive(row) ? "Inactive 30+ minutes" : "Recently active",
      called: Boolean(row.called_at),
    })),
  };
}
