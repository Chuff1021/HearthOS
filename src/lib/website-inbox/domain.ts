export const inboxStatuses = ["new", "contacted", "follow_up", "closed"] as const;
export type InboxStatus = typeof inboxStatuses[number];
export type WebsiteSubmission = {
  id: string; type: "contact" | "order" | "service"; createdAt: string;
  name: string; email: string; phone: string; subject: string; message: string;
  total?: number;
  items?: Array<{ name: string; sku?: string; quantity: number; price: number }>;
  metadata?: Record<string, string>;
};
export type InboxRecord = {
  external_id: string; kind: WebsiteSubmission["type"]; received_at: string;
  payload: WebsiteSubmission; status: InboxStatus; follow_up_at: string | null; revision: number;
};
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid record");
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 4000) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid text");
  return value.trim();
}
export function parseSubmission(input: unknown): WebsiteSubmission {
  const v = record(input);
  if (!uuidPattern.test(String(v.id)) || !["contact", "order", "service"].includes(String(v.type))) throw new Error("Invalid submission identity");
  if (typeof v.createdAt !== "string" || !Number.isFinite(Date.parse(v.createdAt))) throw new Error("Invalid date");
  const result: WebsiteSubmission = {
    id: String(v.id), type: v.type as WebsiteSubmission["type"], createdAt: new Date(v.createdAt).toISOString(),
    name: string(v.name), email: string(v.email), phone: string(v.phone), subject: string(v.subject), message: string(v.message),
  };
  if (!result.name || (!result.phone && !result.email)) throw new Error("Missing contact details");
  if (v.total !== undefined) {
    if (typeof v.total !== "number" || !Number.isFinite(v.total) || v.total < 0) throw new Error("Invalid total");
    result.total = v.total;
  }
  if (v.items !== undefined) {
    if (!Array.isArray(v.items) || v.items.length > 50) throw new Error("Invalid order lines");
    result.items = v.items.map(input => {
      const item = record(input);
      if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) <= 0 || typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0) throw new Error("Invalid order line");
      return { name: string(item.name), sku: string(item.sku), quantity: Number(item.quantity), price: item.price };
    });
  }
  if (v.metadata !== undefined) {
    const entries = Object.entries(record(v.metadata));
    if (entries.length > 40) throw new Error("Invalid metadata");
    result.metadata = Object.fromEntries(entries.map(([key, value]) => [string(key, 80), string(value)]));
  }
  return result;
}
export function parseExport(input: unknown) {
  const v = record(input);
  if (v.version !== 1 || !Array.isArray(v.items) || v.items.length > 10) throw new Error("Invalid export page");
  if (v.nextCursor !== null && (typeof v.nextCursor !== "string" || !v.nextCursor || v.nextCursor.length > 2048)) throw new Error("Invalid export cursor");
  return { items: v.items.map(parseSubmission), nextCursor: v.nextCursor as string | null };
}
export function parseAction(input: unknown) {
  const v = record(input);
  if (!uuidPattern.test(String(v.id)) || !uuidPattern.test(String(v.actionId)) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0) throw new Error("Invalid update");
  if (!inboxStatuses.includes(v.status as InboxStatus)) throw new Error("Invalid status");
  const date = string(v.followUpAt, 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error("Invalid follow-up date");
  if (v.status === "follow_up" && !date) throw new Error("Choose a follow-up date");
  return { id: String(v.id), actionId: String(v.actionId), revision: Number(v.revision), status: v.status as InboxStatus,
    followUpAt: v.status === "follow_up" ? date : null, note: string(v.note) };
}
export function scheduleHref(item: WebsiteSubmission) {
  const query = new URLSearchParams({ create: "1", customerName: item.name, address: item.metadata?.address || "", title: item.subject || "Website request", jobType: "service" });
  const date = item.metadata?.requestedDate;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))) query.set("scheduledDate", date);
  return `/schedule?${query}`;
}
