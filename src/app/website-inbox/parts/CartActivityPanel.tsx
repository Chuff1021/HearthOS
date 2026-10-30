"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
type Report = {
  channels?: Array<{ channel: string; carts: number; checkout: number; contacts: number; calls: number; authorized: number }>;
  startedAt: string | null;
  summary: { carts: number; checkout: number; contacts: number; calls: number; inactive: number; completed: number };
  recent: Array<{ id: string; createdAt: string; lastSeenAt: string; status: string; called: boolean;
    attribution?: { channel: string; landingPath: string }; contact: { name: string; email: string; phone: string } | null;
    items: Array<{ name: string; sku: string; quantity: number }> }>;
};
export default function CartActivityPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/website-inbox/parts?view=carts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cart activity unavailable.");
      setReport(data); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Cart activity unavailable."); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 60000); return () => clearInterval(timer); }, [load]);
  return <section id="cart-activity" className="space-y-4 rounded border bg-[var(--color-surface)] p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Carts & checkout follow-up</h2>
      <button type="button" onClick={() => void load()} className="rounded border px-4 py-2">Refresh cart activity</button>
    </div>
    <p className="text-sm">Last 30 days. Cart sessions count visits, not unique people. A cart becomes inactive after 30 minutes without activity. A phone-button click does not confirm an order.</p>
    {error && <p role="alert">{error}</p>}
    {!report && !error && <p role="status">Loading cart activity…</p>}
    {report && <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {([ ["carts", "Carts opened"], ["checkout", "Reached checkout"], ["contacts", "Contact details saved"], ["calls", "Clicked phone number"], ["inactive", "Inactive carts"], ["completed", "Online authorizations"] ] as const).map(([key, label]) =>
          <div key={key} className="rounded border p-3"><p className="text-sm">{label}</p><p className="mt-1 text-2xl font-bold">{report.summary[key].toLocaleString()}</p></div>)}
      </div>
      <p className="text-xs">{report.startedAt ? `First tracked cart: ${new Date(report.startedAt).toLocaleString()}.` : "Tracking starts with the first new cart visit. Past abandoned carts cannot be recovered."} Phone orders are not automatically matched to these totals.</p>
      {Boolean(report.channels?.length) && <div><h3 className="font-semibold">Traffic sources for tracked carts</h3><p className="mt-1 text-xs">First observed landing in the browser session. Referrer restrictions can hide the source. These are cart sessions, not all site visitors or confirmed sales.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Source", "Carts", "Checkout", "Contacts", "Phone clicks", "Authorized"].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{report.channels?.map(row => <tr key={row.channel} className="border-t"><th className="p-2 text-left font-medium">{row.channel}</th>{[row.carts,row.checkout,row.contacts,row.calls,row.authorized].map((v,i) => <td key={i} className="p-2">{v}</td>)}</tr>)}</tbody></table></div></div>}
      {!report.recent.length && <p>No cart visits recorded yet.</p>}
      <div className="max-h-[36rem] space-y-3 overflow-y-auto">
        {report.recent.map((cart) => <article key={cart.id} className="rounded border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-semibold">{cart.contact?.name || "Anonymous cart"}</h3><p className="mt-1 text-sm">{cart.status}{cart.called ? " · Clicked to call" : ""}</p></div>
            <p className="text-xs">Last activity: {new Date(cart.lastSeenAt).toLocaleString()}</p>
          </div>
          {cart.attribution?.channel && <p className="mt-2 break-words text-xs">Source: {cart.attribution.channel} · Landing: {cart.attribution.landingPath}</p>}
          {cart.contact && <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 break-all text-sm">
            {cart.contact.phone && <a href={`tel:${cart.contact.phone.replace(/[^+\d]/g, "")}`} className="underline">{cart.contact.phone}</a>}
            {cart.contact.email && <a href={`mailto:${cart.contact.email}`} className="underline">{cart.contact.email}</a>}
          </div>}
          <ul className="mt-3 space-y-1 text-sm">{cart.items.map((item, index) => <li key={`${item.sku}-${index}`}>{item.quantity} × {item.name}{item.sku ? ` · ${item.sku}` : ""}</li>)}</ul>
          {cart.contact && <p className="mt-3 text-sm"><Link className="underline" href={`/website-inbox?q=${encodeURIComponent(cart.contact.email || cart.contact.phone || cart.contact.name)}`}>Open Website Inbox to record follow-up</Link></p>}
        </article>)}
      </div>
    </>}
  </section>;
}
