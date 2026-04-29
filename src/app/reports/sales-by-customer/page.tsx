"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Row = {
  customerId: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number | null;
  openBalance: number;
  invoiceCount: number;
  lastSale: string | null;
};

type Response = {
  customers: Row[];
  totals: { revenue: number; openBalance: number; invoiceCount: number; customerCount: number };
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

export default function SalesByCustomerPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<string>("365");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [includeNoSales, setIncludeNoSales] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const r = presetRange(preset);
    if (r) { setSince(r.since); setUntil(r.until); }
  }, [preset]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    if (includeNoSales) params.set("includeNoSales", "true");
    params.set("limit", "2000");
    try {
      const r = await fetch(`/api/reports/sales-by-customer?${params}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [since, until, includeNoSales]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.customers;
    return data.customers.filter((r) =>
      r.customerName.toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">
            <div>
              <Link href="/reports" className="text-xs" style={{ color: "var(--color-text-muted)" }}>← Reports</Link>
              <h1 className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>Sales by Customer</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Top customers by revenue, with margin and open balance.</p>
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {[["30","Last 30"],["90","Last 90"],["365","Last 365"],["ytd","YTD"],["all","All time"]].map(([k,l]) => (
                  <button key={k} onClick={() => setPreset(k)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{
                    background: preset === k ? "rgba(248,151,31,0.16)" : "var(--color-surface-1)",
                    color: preset === k ? "#9a5d12" : "var(--color-text-muted)",
                    border: preset === k ? "1px solid #f8971f" : "1px solid var(--color-border)",
                  }}>{l}</button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search customer / email / phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm outline-none flex-1 min-w-[220px]"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              />
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={includeNoSales} onChange={(e) => setIncludeNoSales(e.target.checked)} />
                Show customers with no sales in window
              </label>
            </div>

            {data && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tile label="Total revenue" value={fmtMoney(data.totals.revenue)} accent="#16A34A" />
                <Tile label="Open balance" value={fmtMoney(data.totals.openBalance)} accent="#f8971f" />
                <Tile label="Customers" value={String(data.totals.customerCount)} accent="var(--color-text-muted)" />
                <Tile label="Invoices" value={String(data.totals.invoiceCount)} accent="var(--color-text-muted)" />
              </div>
            )}

            {loading ? (
              <Empty text="Loading…" />
            ) : !data || visible.length === 0 ? (
              <Empty text={search.trim() ? `No customers match "${search}".` : "No sales in this window."} />
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "var(--color-surface-2)" }}>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Customer</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Invoices</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Revenue</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Profit</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Margin</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Open</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Last sale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.customerId || r.customerName} style={{ borderTop: "1px solid var(--color-border)", opacity: r.revenue === 0 ? 0.7 : 1 }}>
                          <td className="px-4 py-3">
                            {r.customerId ? (
                              <Link href={`/customers/${r.customerId}`} className="font-medium hover:underline" style={{ color: "var(--color-text-primary)" }}>{r.customerName}</Link>
                            ) : (
                              <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{r.customerName}</span>
                            )}
                            {(r.email || r.phone) && (
                              <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                                {[r.email, r.phone].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: "var(--color-text-secondary)" }}>{r.invoiceCount}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(r.revenue)}</td>
                          <td className="px-4 py-3 text-right" style={{ color: r.profit < 0 ? "#DC2626" : r.profit > 0 ? "#16A34A" : "var(--color-text-muted)" }}>{fmtMoney(r.profit)}</td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: r.margin == null ? "var(--color-text-muted)" : r.margin < 0 ? "#DC2626" : r.margin < 15 ? "#F59E0B" : "#16A34A" }}>
                            {r.margin == null ? "—" : `${r.margin.toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: r.openBalance > 0 ? "#f8971f" : "var(--color-text-muted)" }}>
                            {r.openBalance > 0 ? fmtMoney(r.openBalance) : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>{fmtDate(r.lastSale)}</td>
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
