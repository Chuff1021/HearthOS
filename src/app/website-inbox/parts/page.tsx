"use client";
import Link from "next/link";
import QuoteBuilder from "./QuoteBuilder";
import DiscoveryReview from "./DiscoveryReview";
import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import type { Quote } from "@/lib/parts-commerce/domain";

type Part = {
  key: string;
  sku: string;
  name: string;
  offer: { status: string; quantity: number | null; priceCents: number } | null;
  override: { status: string; message: string } | null;
  pilot: boolean;
  duplicate: boolean;
  last_verified_at: string | null;
  last_error: string | null;
};
type Order = {
  id: string;
  snapshot: Quote;
  payment_state: string;
  fulfillment_state: string;
  delayed_until: string | null;
  supplier_confirmation: string | null;
  tracking: string | null;
  last_error: string | null;
};
type Data = {
  summary: {
    total: number;
    verified: number;
    errors: number;
    overrides: number;
  };
  parts: Part[];
  orders: Order[];
  scanner: {
    blocked_until: string | null;
    last_error: string | null;
    discovered: number;
  } | null;
  checkoutReady: boolean;
  localTaxRatePercent: number;
  discoveries: Array<{ url: string }>;
};
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
async function request(input?: unknown, q = "") {
  const r = await fetch(
    `/api/website-inbox/parts${input ? "" : `?q=${encodeURIComponent(q)}`}`,
    {
      method: input ? "POST" : "GET",
      headers: input ? { "Content-Type": "application/json" } : undefined,
      body: input ? JSON.stringify(input) : undefined,
      cache: "no-store",
    },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Parts service unavailable");
  return d;
}
export default function PartsOperations() {
  const [data, setData] = useState<Data | null>(null),
    [q, setQ] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await request(undefined, q));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parts unavailable");
    }
  }, [q]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 space-y-6 overflow-y-auto p-4 pb-24 lg:p-6">
          <Link href="/website-inbox" className="text-sm underline">
            ← Website Inbox
          </Link>
          <header>
            <h1 className="text-2xl font-bold">Parts stock & orders</h1>
            <p className="mt-2 text-sm">
              Stove Parts Unlimited · Owner controls
            </p>
          </header>
          {error && (
            <p role="alert" className="rounded border border-orange-300 p-4">
              {error}
            </p>
          )}
          {data && (
            <>
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(data.summary).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded border bg-[var(--color-surface)] p-4"
                  >
                    <p className="text-sm capitalize">{label}</p>
                    <p className="mt-2 text-2xl font-bold">
                      {value.toLocaleString()}
                    </p>
                  </div>
                ))}
              </section>
              <p className="text-sm">
                {data.checkoutReady
                  ? "Automatic checkout enabled for pilot parts"
                  : "Payments gated until supplier shipping, tax settings and Square are verified."}
              </p>
              {data.scanner?.last_error && (
                <p className="rounded border border-orange-300 p-4">
                  Scanner: {data.scanner.last_error}
                  {data.scanner.blocked_until
                    ? ` · Paused until ${new Date(data.scanner.blocked_until).toLocaleString()}`
                    : ""}
                </p>
              )}
              <p className="text-sm">
                Local sales tax rate: {data.localTaxRatePercent}% · Shipped
                orders use destination-based tax calculations.
              </p>
              <QuoteBuilder />
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">Website orders</h2>
                  <button
                    onClick={() => void load()}
                    className="rounded border px-4 py-2"
                  >
                    Refresh
                  </button>
                </div>
                {!data.orders.length && (
                  <p className="text-sm">
                    Authorized website orders will appear here and in the
                    Website Inbox.
                  </p>
                )}
                {data.orders.map((order) => (
                  <OrderCard key={order.id} order={order} reload={load} />
                ))}
              </section>
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">Inventory</h2>
                <label className="block text-sm">
                  Search SKU or part name
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="mt-2 block w-full rounded border bg-[var(--color-surface)] p-3"
                  />
                </label>
                <p className="text-xs">
                  Showing up to 50 results. Quantities are supplier counts at
                  the last successful check, not reserved supplier inventory.
                </p>
                {data.parts.map((part) => (
                  <PartCard key={part.key} part={part} reload={load} />
                ))}
              </section>
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">
                  New supplier pages awaiting catalog review
                </h2>
                <p className="text-sm">
                  {data.scanner?.discovered || 0} discovered. Confirm these are
                  parts and check SKU, package size, category and images before
                  publishing.
                </p>
                {data.discoveries.map((d) => (
                  <DiscoveryReview key={d.url} url={d.url} saved={load} />
                ))}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function OrderCard({
  order,
  reload,
}: {
  order: Order;
  reload: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState(
      order.supplier_confirmation || "",
    ),
    [tracking, setTracking] = useState(order.tracking || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request({ id: order.id, action, confirmation, tracking });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const q = order.snapshot;
  return (
    <article className="space-y-3 rounded border bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-bold">
            {order.id.slice(0, 8).toUpperCase()} · {q.address.name}
          </h3>
          <p className="text-sm">
            {q.address.email} · {money(q.totalCents)}
          </p>
        </div>
        <p className="text-sm font-semibold">
          {order.payment_state} · {order.fulfillment_state}
        </p>
      </div>
      <p className="whitespace-pre-line text-sm">
        {[
          q.address.street,
          q.address.street2,
          `${q.address.city}, ${q.address.state} ${q.address.zip}`,
        ]
          .filter(Boolean)
          .join("\n")}
      </p>
      <ul className="text-sm">
        {q.lines.map((l) => (
          <li key={l.key}>
            {l.quantity} × {l.sku} · {l.name}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        Shipping: {q.shipping.label}
        {order.delayed_until
          ? ` · Card hold expires ${new Date(order.delayed_until).toLocaleString()}`
          : ""}
      </p>
      {order.last_error && (
        <p role="alert" className="text-orange-700">
          {order.last_error}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {order.payment_state === "authorized" && (
        <div className="space-y-3">
          <p className="text-sm">
            Place the supplier order once, then enter its confirmation number to
            capture payment.
          </p>
          <label className="block text-sm">
            Supplier confirmation
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="mt-1 block w-full rounded border bg-transparent p-3"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy || !confirmation.trim()}
              onClick={() => void action("capture")}
              className="rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              Confirm supplier order & capture payment
            </button>
            <button
              disabled={busy}
              onClick={() => void action("void")}
              className="rounded border px-4 py-2"
            >
              Cancel card hold
            </button>
          </div>
        </div>
      )}
      {order.payment_state === "paid" && (
        <div className="space-y-3">
          <label className="block text-sm">
            Carrier and tracking number
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              className="mt-1 block w-full rounded border bg-transparent p-3"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy || !tracking.trim()}
              onClick={() => void action("tracking")}
              className="rounded border px-4 py-2"
            >
              Save tracking & email customer
            </button>
            <button
              disabled={busy}
              onClick={() => void action("refund")}
              className="rounded border px-4 py-2 text-red-700"
            >
              Refund full payment
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
function PartCard({
  part,
  reload,
}: {
  part: Part;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState(part.override?.message || ""),
    [status, setStatus] = useState(part.override?.status || "out_of_stock"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(action: string, extra = {}) {
    if (busy) return;
    setBusy(true);
    try {
      await request({ key: part.key, action, status, message, ...extra });
      await reload();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-3 rounded border bg-[var(--color-surface)] p-4">
      <h3 className="font-semibold">
        {part.sku} · {part.name}
      </h3>
      <p className="text-sm">
        {part.override?.status || part.offer?.status || "unverified"} ·{" "}
        {part.offer ? money(part.offer.priceCents) : "Price to verify"} ·{" "}
        {part.offer?.quantity == null
          ? "Quantity not published"
          : `${part.offer.quantity} at last check`}
      </p>
      <p className="text-xs">
        {part.last_verified_at
          ? `Checked ${new Date(part.last_verified_at).toLocaleString()}`
          : "Not yet scanned"}
        {part.duplicate ? " · Duplicate SKU: checkout blocked" : ""}
      </p>
      {part.last_error && (
        <p className="text-sm text-orange-700">{part.last_error}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          disabled={busy}
          onClick={() => void action("refresh")}
          className="rounded border px-3 py-2 text-sm"
        >
          Queue refresh
        </button>
        <button
          disabled={busy || part.duplicate}
          onClick={() => void action("pilot", { enabled: !part.pilot })}
          className="rounded border px-3 py-2 text-sm"
        >
          {part.pilot ? "Remove from pilot" : "Enable for pilot"}
        </button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">
          Owner availability override
          {part.override ? ` · ${part.override.message}` : ""}
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            Availability
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full rounded border bg-[var(--color-surface)] p-2"
            >
              <option value="out_of_stock">Out of stock</option>
              <option value="special_order">Special order</option>
              <option value="unverified">Needs confirmation</option>
            </select>
          </label>
          <label className="block text-sm">
            Customer message
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 block w-full rounded border bg-transparent p-3"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy || !message.trim()}
              onClick={() => void action("override")}
              className="rounded border px-3 py-2 text-sm"
            >
              Save override
            </button>
            {part.override && (
              <button
                disabled={busy}
                onClick={() => void action("clear_override")}
                className="rounded border px-3 py-2 text-sm"
              >
                Remove override & rescan
              </button>
            )}
          </div>
        </div>
      </details>
    </article>
  );
}
