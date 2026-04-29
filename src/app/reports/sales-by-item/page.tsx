"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Row = {
  qbItemId: string | null;
  name: string;
  sku: string | null;
  qty: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number | null;
  avgPrice: number;
  invoiceCount: number;
  lastSold: string | null;
};

type Response = {
  items: Row[];
  totals: { revenue: number; qty: number; profit: number; itemCount: number };
  window: { since: string | null; until: string | null };
};

const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const presetRange = (preset: string): { since: string; until: string } | null => {
  const now = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "30":  { const d = new Date(now); d.setDate(d.getDate() - 30); return { since: ymd(d), until: ymd(now) }; }
    case "90":  { const d = new Date(now); d.setDate(d.getDate() - 90); return { since: ymd(d), until: ymd(now) }; }
    case "365": { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { since: ymd(d), until: ymd(now) }; }
    case "ytd": { const d = new Date(now.getFullYear(), 0, 1); return { since: ymd(d), until: ymd(now) }; }
    case "all": return { since: "", until: "" };
    default: return null;
  }
};

export default function SalesByItemPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<string>("365");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"revenue" | "qty" | "profit" | "margin" | "lastSold">("revenue");

  useEffect(() => {
    const r = presetRange(preset);
    if (r) { setSince(r.since); setUntil(r.until); }
  }, [preset]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    params.set("limit", "500");
    try {
      const r = await fetch(`/api/reports/sales-by-item?${params}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [since, until]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.items;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.sku || "").toLowerCase().includes(q));
    }
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "qty": return b.qty - a.qty;
        case "profit": return b.profit - a.profit;
        case "margin": return (b.margin ?? -999) - (a.margin ?? -999);
        case "lastSold": return (b.lastSold || "").localeCompare(a.lastSold || "");
        default: return b.revenue - a.revenue;
      }
    });
    return rows;
  }, [data, search, sort]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">
            <div>
              <Link href="/reports" className="text-xs" style={{ color: "var(--color-text-muted)" }}>← Reports</Link>
              <h1 className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>Sales by Item</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Top-selling items, with margin and last sold date.</p>
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              <div className="flex gap-1.5">
                {[["30","Last 30"],["90","Last 90"],["365","Last 365"],["ytd","YTD"],["all","All time"]].map(([k,l]) => (
                  <button key={k} onClick={() => setPreset(k)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{
                    background: preset === k ? "rgba(248,151,31,0.16)" : "var(--color-surface-1)",
                    color: preset === k ? "#9a5d12" : "var(--color-text-muted)",
                    border: preset === k ? "1px solid #f8971f" : "1px solid var(--color-border)",
                  }}>{l}</button>
                ))}
              </div>
              <input
                type="text" placeholder="Search item or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
              >
                <option value="revenue">Sort: Revenue</option>
                <option value="qty">Sort: Quantity</option>
                <option value="profit">Sort: Profit</option>
                <option value="margin">Sort: Margin</option>
                <option value="lastSold">Sort: Last sold</option>
              </select>
            </div>

            {data && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tile label="Revenue" value={fmtMoney(data.totals.revenue)} accent="#16A34A" />
                <Tile label="Profit" value={fmtMoney(data.totals.profit)} accent={data.totals.profit < 0 ? "#DC2626" : "#16A34A"} />
                <Tile label="Items sold" value={String(data.totals.itemCount)} accent="var(--color-text-muted)" />
                <Tile label="Total qty" value={data.totals.qty.toLocaleString()} accent="var(--color-text-muted)" />
              </div>
            )}

            {loading ? (
              <Empty text="Loading…" />
            ) : filtered.length === 0 ? (
              <Empty text="No items match." />
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "var(--color-surface-2)" }}>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Item</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Qty</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Avg price</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Revenue</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Profit</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Margin</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Invoices</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Last sold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.qbItemId || r.name} style={{ borderTop: "1px solid var(--color-border)" }}>
                          <td className="px-4 py-3">
                            <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{r.name}</div>
                            {r.sku && <div className="text-[11px] font-mono" style={{ color: "var(--color-text-muted)" }}>{r.sku}</div>}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: "var(--color-text-secondary)" }}>{r.qty.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: "var(--color-text-secondary)" }}>{fmtMoney(r.avgPrice)}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(r.revenue)}</td>
                          <td className="px-4 py-3 text-right" style={{ color: r.profit < 0 ? "#DC2626" : r.profit > 0 ? "#16A34A" : "var(--color-text-muted)" }}>{fmtMoney(r.profit)}</td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: r.margin == null ? "var(--color-text-muted)" : r.margin < 0 ? "#DC2626" : r.margin < 15 ? "#F59E0B" : "#16A34A" }}>
                            {r.margin == null ? "—" : `${r.margin.toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: "var(--color-text-secondary)" }}>{r.invoiceCount}</td>
                          <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>{fmtDate(r.lastSold)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderLeft: `4px solid ${accent}` }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: accent === "var(--color-text-muted)" ? "var(--color-text-primary)" : accent }}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl p-12 text-center text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>{text}</div>;
}
