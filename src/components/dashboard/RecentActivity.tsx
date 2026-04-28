"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ActivityType = "payment" | "invoice" | "estimate" | "bill" | "po";

type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  actor: string | null;
  amount: number | null;
  at: string;
  href: string;
  status: string | null;
};

const ICON: Record<ActivityType, { bg: string; color: string; svg: ReactNode }> = {
  payment: {
    bg: "rgba(34,197,94,0.12)",
    color: "#16A34A",
    svg: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zm-12 4a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  invoice: {
    bg: "rgba(248,151,31,0.12)",
    color: "#f8971f",
    svg: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
  estimate: {
    bg: "rgba(168,85,247,0.12)",
    color: "#A855F7",
    svg: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
      </svg>
    ),
  },
  bill: {
    bg: "rgba(239,68,68,0.12)",
    color: "#EF4444",
    svg: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  po: {
    bg: "rgba(14,165,233,0.12)",
    color: "#0EA5E9",
    svg: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      </svg>
    ),
  },
};

function dayBucket(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() === today.getTime()) return "Today";
  if (dayStart.getTime() === yest.getTime()) return "Yesterday";
  const diffDays = Math.floor((today.getTime() - dayStart.getTime()) / 86400000);
  if (diffDays > 0 && diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: dayStart.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // Date-only (no time component): show calendar date directly, ignore "X days ago".
  if (iso.length === 10) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RecentActivity() {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [filter, setFilter] = useState<"all" | ActivityType>("all");
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/dashboard/activity?limit=40", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setItems(Array.isArray(j.activity) ? j.activity : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.type === filter)),
    [items, filter],
  );

  // Group consecutive items by day bucket
  const grouped = useMemo(() => {
    const out: Array<{ bucket: string; rows: Activity[] }> = [];
    let cur: { bucket: string; rows: Activity[] } | null = null;
    for (const i of visible) {
      const b = dayBucket(i.at);
      if (!cur || cur.bucket !== b) {
        cur = { bucket: b, rows: [] };
        out.push(cur);
      }
      cur.rows.push(i);
    }
    return out;
  }, [visible]);

  const counts = useMemo(() => {
    const c: Record<ActivityType, number> = { payment: 0, invoice: 0, estimate: 0, bill: 0, po: 0 };
    for (const i of items) c[i.type]++;
    return c;
  }, [items]);

  const FilterPill = ({ value, label, count }: { value: typeof filter; label: string; count?: number }) => (
    <button
      onClick={() => setFilter(value)}
      className="text-[11px] px-2 py-1 rounded transition-colors"
      style={{
        background: filter === value ? "var(--color-ember)" : "var(--color-surface-1)",
        color: filter === value ? "#fff" : "var(--color-text-secondary)",
        border: "1px solid var(--color-border)",
      }}
    >
      {label}{count != null ? ` ${count}` : ""}
    </button>
  );

  return (
    <>
      <div className="rounded-xl overflow-hidden h-full flex flex-col" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
        <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Recent activity</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Real money in / out across QuickBooks-synced records
              </p>
            </div>
            <button onClick={load} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
              Refresh
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill value="all" label="All" count={items.length} />
            <FilterPill value="payment" label="Payments" count={counts.payment} />
            <FilterPill value="invoice" label="Invoices" count={counts.invoice} />
            <FilterPill value="estimate" label="Estimates" count={counts.estimate} />
            <FilterPill value="bill" label="Bills" count={counts.bill} />
            <FilterPill value="po" label="POs" count={counts.po} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loading && items.length === 0 ? (
            <div className="px-5 py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading activity…</div>
          ) : error ? (
            <div className="px-5 py-8 text-sm" style={{ color: "#EF4444" }}>{error}</div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>No activity matches this filter.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.bucket}>
                <div className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wide sticky top-0" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                  {g.bucket}
                </div>
                {g.rows.map((a) => {
                  const ic = ICON[a.type];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelected(a)}
                      className="w-full text-left flex items-start gap-3 px-5 py-3 cursor-pointer transition-all hover:opacity-90"
                      style={{ borderBottom: "1px solid var(--color-border)" }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ic.bg, color: ic.color }}>
                        {ic.svg}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-[13px] font-medium leading-tight truncate" style={{ color: "var(--color-text-primary)" }}>
                            {a.title}
                          </div>
                          <div className="text-[10px] flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                            {timeAgo(a.at)}
                          </div>
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                          {a.description}
                        </div>
                        {a.actor && (
                          <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
                            {a.actor}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{selected.title}</h3>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{selected.description}</p>
                {selected.actor && <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{selected.actor}</p>}
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{new Date(selected.at).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-sm" style={{ color: "var(--color-text-muted)" }}>✕</button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded text-sm" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Close</button>
              <button onClick={() => router.push(selected.href)} className="px-3 py-1.5 rounded text-sm text-white" style={{ background: "var(--color-ember)" }}>Open</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
