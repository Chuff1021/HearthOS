"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Inbox, Mail, Phone, RefreshCw, Search, X } from "lucide-react";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { inboxStatuses, scheduleHref, type InboxRecord, type InboxStatus } from "@/lib/website-inbox/domain";

type Activity = { action_id: string; created_at: string; status: InboxStatus; follow_up_at: string | null; note: string; actor_name: string };
type Data = { configured: boolean; items: InboxRecord[]; total: number; sync: { last_checked_at: string | null; last_complete_at: string | null } | null };
const labels: Record<InboxStatus, string> = { new: "New", contacted: "Contacted", follow_up: "Follow-up", closed: "Closed" };
const typeLabels = { contact: "Message", order: "Order request", service: "Service request" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const dateTime = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
async function jsonRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(url, { ...options, cache: "no-store", signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result as T;
}

export default function WebsiteInboxPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<InboxRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const syncLock = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const result = await jsonRequest<Data>(`/api/website-inbox?${new URLSearchParams({ q: query, status, offset: String(offset) })}`, { signal: abort.signal });
        if (!abort.signal.aborted) setData(result);
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Inbox unavailable"); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, status, offset, refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRefresh(v => v + 1); }, 60_000);
    return () => clearInterval(timer);
  }, []);
  async function sync() {
    if (syncLock.current) return;
    syncLock.current = true; setSyncing(true); setNotice(""); setError("");
    try {
      let imported = 0;
      let more = false;
      for (let page = 0; page < 10; page++) {
        const result = await jsonRequest<{ imported: number; more: boolean; busy: boolean }>("/api/website-inbox/sync", { method: "POST" });
        imported += result.imported; more = result.more;
        if (!more || result.busy) break;
      }
      setNotice(`${imported} new requests imported.${more ? " Import is continuing; check again shortly." : " Website inbox is up to date."}`);
      setRefresh(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Website sync unavailable"); }
    finally { syncLock.current = false; setSyncing(false); }
  }
  return <div className="website-inbox flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}><Sidebar/><div className="min-w-0 flex-1 flex flex-col overflow-hidden"><Header/><main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-6 space-y-5" style={{ color: "var(--color-text-primary)" }}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Website Inbox</h1><p className="text-sm text-[var(--color-text-secondary)]">Aaron&apos;s Fireplace Co.</p></div>
      <button className="ui-btn-primary flex items-center gap-2 px-4 py-2" disabled={syncing || !data?.configured} onClick={sync}><RefreshCw size={16} className={syncing ? "animate-spin" : ""}/>{syncing ? "Checking website..." : "Check website"}</button>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}<button className="underline ml-3" onClick={() => setRefresh(v => v + 1)}>Retry</button></div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {data && !data.configured ? <section className="border rounded-lg p-8 text-center"><Inbox className="mx-auto mb-3"/><h2 className="font-semibold">Website connection pending</h2><p className="mt-2 text-sm text-[var(--color-text-secondary)]">The website connection has not been activated. Existing submissions remain saved on your website.</p></section> : <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-lg border bg-[var(--color-surface)] px-3 py-2 flex-1 min-w-48"><Search size={16}/><input className="bg-transparent outline-none min-w-0 w-full" aria-label="Search website requests" placeholder="Search name, email, phone, or subject" value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }}/></label>
        <select aria-label="Request status" className="rounded-lg border p-2 bg-[var(--color-surface)]" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="all">All statuses</option>{inboxStatuses.map(v => <option key={v} value={v}>{labels[v]}</option>)}</select>
      </div>
      <div className="flex justify-between gap-3 text-sm text-[var(--color-text-secondary)]"><span>{loading ? "Loading requests..." : `${data?.total ?? 0} requests`}</span><span>{data?.sync?.last_complete_at ? `Last full check ${dateTime(data.sync.last_complete_at)}` : "Initial import pending"}</span></div>
      <section aria-busy={loading} className="border rounded-lg divide-y overflow-hidden bg-[var(--color-surface)]">
        {data?.items.map(item => <button key={item.external_id} onClick={() => setSelected(item)} className="w-full text-left p-4 flex flex-wrap items-start justify-between gap-3 hover:bg-[var(--color-surface-2)]">
          <div className="min-w-0 flex-1"><div className="text-xs text-[var(--color-text-secondary)]">{typeLabels[item.kind]} · {dateTime(item.received_at)}</div><h2 className="font-semibold mt-1 break-words">{item.payload.name}</h2><p className="text-sm break-words">{item.payload.subject || item.payload.message.slice(0, 120) || "Website request"}</p></div>
          <div className="text-right text-sm"><span className={`inline-block rounded px-2 py-1 ${item.status === "new" ? "bg-orange-50 text-orange-800" : item.status === "closed" ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800"}`}>{labels[item.status]}</span>{item.follow_up_at && <div className="mt-1">Follow-up {item.follow_up_at}</div>}{item.kind === "order" && item.payload.total !== undefined && <div className="mt-1">{money(item.payload.total)} estimated</div>}</div>
        </button>)}
        {!loading && !error && !data?.items.length && <div className="p-10 text-center text-[var(--color-text-secondary)]"><Inbox className="mx-auto mb-2"/>No matching requests</div>}
      </section>
      <nav aria-label="Inbox pages" className="flex justify-end gap-3 items-center"><button title="Previous page" aria-label="Previous page" className="p-2 border rounded-lg" disabled={offset === 0 || loading} onClick={() => setOffset(v => Math.max(0, v - 50))}><ChevronLeft size={18}/></button><span className="text-sm">Page {Math.floor(offset / 50) + 1}</span><button title="Next page" aria-label="Next page" className="p-2 border rounded-lg" disabled={!data || offset + 50 >= data.total || loading} onClick={() => setOffset(v => v + 50)}><ChevronRight size={18}/></button></nav>
    </>}
    {selected && <RequestDialog key={selected.external_id} item={selected} close={() => setSelected(null)} saved={() => setRefresh(v => v + 1)}/>}
  </main></div></div>;
}

function RequestDialog({ item, close, saved }: { item: InboxRecord; close: () => void; saved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState(item.status);
  const [followUpAt, setFollowUpAt] = useState(item.follow_up_at || "");
  const [note, setNote] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<{ body: string } | null>(null);
  const loadActivity = useCallback(async () => {
    const result = await jsonRequest<{ activity: Activity[] }>(`/api/website-inbox?id=${item.external_id}`);
    setActivity(result.activity);
  }, [item.external_id]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { loadActivity().catch(() => setError("Follow-up history could not be loaded.")); }, [loadActivity]);
  async function save() {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      attempt.current ??= { body: JSON.stringify({ id: item.external_id, revision: item.revision, actionId: crypto.randomUUID(), status, followUpAt, note }) };
      await jsonRequest("/api/website-inbox", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: attempt.current.body });
      saved(); close();
    } catch (e) { setError(e instanceof Error ? e.message : "Save could not be confirmed"); }
    finally { lock.current = false; setSaving(false); }
  }
  const contact = item.payload;
  return <dialog ref={dialog} aria-labelledby="website-request-title" onCancel={e => { if (saving) e.preventDefault(); else close(); }} style={{ width: "min(760px, calc(100% - 24px))", background: "var(--color-bg)" }} className="m-auto max-h-[90dvh] overflow-y-auto rounded-lg border p-0 text-[var(--color-text-primary)] backdrop:bg-black/30">
    <header className="p-5 border-b flex justify-between gap-3"><div><p className="text-xs text-[var(--color-text-secondary)]">{typeLabels[item.kind]} · {dateTime(item.received_at)}</p><h2 id="website-request-title" className="text-xl font-semibold break-words">{contact.name}</h2></div><button title="Close request" aria-label="Close request" disabled={saving} onClick={close} className="p-2 self-start"><X size={20}/></button></header>
    <div className="p-5 space-y-5">
      <div className="flex flex-wrap gap-3 text-sm">
        {contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 border rounded-lg px-3 py-2"><Phone size={16}/>Call</a>}
        {contact.email && <a href={`mailto:${encodeURIComponent(contact.email)}`} className="inline-flex items-center gap-2 border rounded-lg px-3 py-2"><Mail size={16}/>Email</a>}
        <Link className="inline-flex items-center gap-2 border rounded-lg px-3 py-2" href={scheduleHref(contact)}><CalendarPlus size={16}/>Schedule job</Link>
      </div>
      <div className="text-sm break-words"><p>{contact.email}</p><p>{contact.phone}</p>{contact.metadata?.address && <p>{contact.metadata.address}</p>}</div>
      <section><h3 className="font-semibold break-words">{contact.subject || "Message"}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{contact.message || "No additional message"}</p></section>
      {contact.metadata && <dl className="grid sm:grid-cols-2 gap-3 text-sm">{Object.entries(contact.metadata).filter(([key]) => key !== "address").map(([key, value]) => <div key={key}><dt className="text-[var(--color-text-secondary)]">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="break-words whitespace-pre-wrap">{value}</dd></div>)}</dl>}
      {item.kind === "order" && <section><h3 className="font-semibold">Requested items</h3><ul className="divide-y mt-2">{contact.items?.map((line, index) => <li className="py-2 text-sm flex justify-between gap-3" key={index}><span className="break-words min-w-0">{line.quantity} × {line.name}{line.sku && <span className="block text-[var(--color-text-secondary)]">{line.sku}</span>}</span><span className="shrink-0">{money(line.price * line.quantity)}</span></li>)}</ul><p className="mt-2 text-sm font-semibold">{contact.total === undefined ? "Price to confirm" : `${money(contact.total)} estimated total`} · Payment not collected by website checkout</p></section>}
      <form className="border-t pt-4 space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
        <h3 className="font-semibold">Follow-up</h3>
        <fieldset disabled={saving || Boolean(attempt.current)} className="grid sm:grid-cols-2 gap-3 disabled:opacity-70">
          <label className="text-sm">Status
            <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as InboxStatus)} className="block w-full border rounded-lg p-2 mt-1 bg-[var(--color-surface)]">
              {inboxStatuses.map(v => <option key={v} value={v}>{labels[v]}</option>)}
            </select>
          </label>
          {status === "follow_up" && <label className="text-sm">Follow-up date
            <input required type="date" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} className="block w-full border rounded-lg p-2 mt-1 bg-[var(--color-surface)]"/>
          </label>}
          <label className="text-sm sm:col-span-2">Note
            <textarea maxLength={4000} value={note} onChange={e => setNote(e.target.value)} className="block w-full border rounded-lg p-2 mt-1 min-h-24 bg-[var(--color-surface)]"/>
          </label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="ui-btn-primary px-4 py-2" type="submit">{saving ? "Saving..." : attempt.current ? "Retry same update" : "Save update"}</button>
      </form>
      <section className="border-t pt-4"><h3 className="font-semibold">Activity</h3>{activity.length === 0 ? <p className="text-sm mt-2 text-[var(--color-text-secondary)]">No follow-up activity recorded</p> : <ol className="divide-y mt-2">{activity.map(entry => <li key={entry.action_id} className="py-3 text-sm"><p className="font-medium">{labels[entry.status]} · {entry.actor_name}</p><p className="text-xs text-[var(--color-text-secondary)]">{dateTime(entry.created_at)}{entry.follow_up_at && ` · Follow-up ${entry.follow_up_at}`}</p><p className="mt-1 whitespace-pre-wrap break-words">{entry.note}</p></li>)}</ol>}</section>
    </div>
  </dialog>;
}
