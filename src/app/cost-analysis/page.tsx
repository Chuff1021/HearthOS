"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type CostItem = {
  name: string;
  sku: string;
  fullName: string;
  avgCost: number;
  minCost: number;
  maxCost: number;
  mostRecentCost: number;
  lastPurchaseDate: string;
  timesOrdered: number;
  vendors: string[];
  qbCurrentCost: number;
  salePrice: number;
  variance: number;
  variancePct: number | null;
  margin: number | null;
};

type SortKey = "name" | "variance" | "variancePct" | "avgCost" | "qbCurrentCost" | "margin" | "timesOrdered";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}

function statusInfo(item: CostItem): { label: string; color: string; bg: string; priority: number } {
  if (item.qbCurrentCost === 0 && item.avgCost > 0) {
    return { label: "No QB Cost", color: "#9333EA", bg: "rgba(147,51,234,0.12)", priority: 0 };
  }
  const pct = Math.abs(item.variancePct ?? 0);
  if (item.variance > 0) {
    // Paying MORE than QB thinks — QB understating cost, margin overstated
    if (pct >= 20) return { label: "Critical", color: "#DC2626", bg: "rgba(220,38,38,0.12)", priority: 1 };
    if (pct >= 10) return { label: "High", color: "#EA580C", bg: "rgba(234,88,12,0.12)", priority: 2 };
    if (pct >= 5)  return { label: "Moderate", color: "#D97706", bg: "rgba(217,119,6,0.12)", priority: 3 };
  }
  if (item.variance < 0) {
    // Paying LESS than QB thinks — QB overstating cost (less common but still wrong)
    if (pct >= 10) return { label: "Overstated", color: "#0284C7", bg: "rgba(2,132,199,0.12)", priority: 4 };
  }
  return { label: "OK", color: "#16A34A", bg: "rgba(22,163,74,0.08)", priority: 5 };
}

export default function CostAnalysisPage() {
  const [items, setItems] = useState<CostItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("variance");
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState<"all" | "issues" | "critical">("issues");
  const [search, setSearch] = useState("");

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cost-analysis/pull");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(data.items || []);
      setUpdatedAt(data.updatedAt || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runPull() {
    setPulling(true);
    setError(null);
    setPullResult(null);
    try {
      const res = await fetch("/api/cost-analysis/pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pull failed");
      setPullResult(data);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPulling(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  function setSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  const filtered = useMemo(() => {
    let out = items;

    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.fullName.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.vendors.some((v) => v.toLowerCase().includes(q))
      );
    }

    if (filter === "issues") {
      out = out.filter((i) => {
        const s = statusInfo(i);
        return s.label !== "OK";
      });
    } else if (filter === "critical") {
      out = out.filter((i) => {
        const s = statusInfo(i);
        return s.priority <= 2; // Critical, High, No QB Cost
      });
    }

    out = [...out].sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "name": return sortDesc
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name);
        case "variance": av = a.variance; bv = b.variance; break;
        case "variancePct": av = Math.abs(a.variancePct ?? 0); bv = Math.abs(b.variancePct ?? 0); break;
        case "avgCost": av = a.avgCost; bv = b.avgCost; break;
        case "qbCurrentCost": av = a.qbCurrentCost; bv = b.qbCurrentCost; break;
        case "margin": av = a.margin ?? -999; bv = b.margin ?? -999; break;
        case "timesOrdered": av = a.timesOrdered; bv = b.timesOrdered; break;
        default: av = a.variance; bv = b.variance;
      }
      return sortDesc ? bv - av : av - bv;
    });

    return out;
  }, [items, filter, search, sortKey, sortDesc]);

  const stats = useMemo(() => {
    const critical = items.filter((i) => statusInfo(i).priority <= 1).length;
    const high = items.filter((i) => statusInfo(i).priority === 2).length;
    const moderate = items.filter((i) => statusInfo(i).priority === 3).length;
    const noQbCost = items.filter((i) => statusInfo(i).label === "No QB Cost").length;
    const ok = items.filter((i) => statusInfo(i).label === "OK").length;
    const totalOverpaying = items
      .filter((i) => i.variance > 0)
      .reduce((s, i) => s + i.variance * i.timesOrdered, 0);
    return { critical, high, moderate, noQbCost, ok, total: items.length, totalOverpaying };
  }, [items]);

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => setSort(k)}
        className="text-left text-xs font-bold uppercase flex items-center gap-1"
        style={{ color: active ? "#fff" : "rgba(255,255,255,0.7)" }}
      >
        {label}
        <span style={{ fontSize: 10 }}>{active ? (sortDesc ? "▼" : "▲") : "⇅"}</span>
      </button>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-background)", color: "var(--color-text)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">

          {/* Header row */}
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold mb-1">Purchase Cost vs QB Cost</h1>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Actual costs paid on bills vs what QuickBooks has as PurchaseCost
                {updatedAt && <span className="ml-2">· Last pulled {new Date(updatedAt).toLocaleDateString()}</span>}
              </p>
            </div>
            <button
              onClick={runPull}
              disabled={pulling}
              className="px-5 py-2.5 rounded-lg text-sm font-bold"
              style={{ background: pulling ? "var(--color-surface-2)" : "#2CA01C", color: "#fff", opacity: pulling ? 0.6 : 1 }}
            >
              {pulling ? "Pulling QB Data..." : "Pull Latest QB Data"}
            </button>
          </div>

          {/* Pull result */}
          {pullResult && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm space-y-1"
              style={{
                background: pullResult.success ? "rgba(44,160,28,0.1)" : "rgba(220,38,38,0.08)",
                border: `1px solid ${pullResult.success ? "rgba(44,160,28,0.3)" : "rgba(220,38,38,0.3)"}`,
              }}>
              {pullResult.success ? (
                <>
                  <div>
                    Pulled <strong>{pullResult.billsPaid}</strong> paid bills (of {pullResult.billsTotal} total) ·{" "}
                    <strong>{pullResult.itemsFound}</strong> unique products ·{" "}
                    <span style={{ color: "#DC2626", fontWeight: 600 }}>{pullResult.flagged?.costUnderstated} items where QB cost is too low</span>
                    {pullResult.flagged?.noQbCost > 0 && <span style={{ color: "#9333EA" }}> · {pullResult.flagged.noQbCost} with no QB cost set</span>}
                  </div>
                  {pullResult.debug?.note && (
                    <div style={{ color: "#D97706" }}>{pullResult.debug.note}</div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ color: "#DC2626", fontWeight: 600 }}>{pullResult.error}</div>
                  {pullResult.debug && (
                    <div className="mt-2 text-xs space-y-0.5" style={{ color: "var(--color-text-muted)" }}>
                      <div>QB Items fetched: {pullResult.debug.itemsFetched ?? 0}</div>
                      {pullResult.debug.billFetchError && <div>Bill fetch error: {pullResult.debug.billFetchError}</div>}
                      {pullResult.debug.itemFetchError && <div>Item fetch error: {pullResult.debug.itemFetchError}</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#DC2626" }}>
              {error}
            </div>
          )}

          {/* Stats cards */}
          {items.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { label: "Critical (>20% off)", value: stats.critical, color: "#DC2626" },
                { label: "High (10–20% off)", value: stats.high, color: "#EA580C" },
                { label: "Moderate (5–10% off)", value: stats.moderate, color: "#D97706" },
                { label: "No QB Cost Set", value: stats.noQbCost, color: "#9333EA" },
                { label: "OK (within 5%)", value: stats.ok, color: "#16A34A" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl px-4 py-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Est. impact */}
          {stats.totalOverpaying > 0 && (
            <div className="mb-5 px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <span style={{ fontWeight: 600, color: "#DC2626" }}>Estimated cost understatement:</span>
              <span className="ml-2">{fmt(stats.totalOverpaying)} across all purchases in the last 24 months — this is how much your QB cost records have been understating what you actually paid.</span>
            </div>
          )}

          {/* Controls */}
          {items.length > 0 && (
            <div className="flex gap-3 mb-4 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, vendor..."
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", width: 220 }}
              />
              {(["all", "issues", "critical"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    background: filter === f ? "#2563EB" : "var(--color-surface-2)",
                    color: filter === f ? "#fff" : "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {f === "all" ? `All (${items.length})` : f === "issues" ? `Has Issues (${stats.critical + stats.high + stats.moderate + stats.noQbCost})` : `Critical + High (${stats.critical + stats.high})`}
                </button>
              ))}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="text-center py-16" style={{ color: "var(--color-text-muted)" }}>
              {items.length === 0 ? "Loading..." : "Refreshing..."}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 rounded-xl" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="text-lg font-semibold mb-2">No cost data yet</div>
              <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>Click "Pull Latest QB Data" to fetch your paid bills from the last 24 months.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12" style={{ color: "var(--color-text-muted)" }}>No items match your filter.</div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              {/* Table header */}
              <div
                className="grid px-4 py-3 text-xs"
                style={{
                  gridTemplateColumns: "2fr 80px 100px 100px 100px 90px 80px 90px",
                  background: "#1a2235",
                  gap: "8px",
                }}
              >
                <SortBtn k="name" label="Product" />
                <div className="text-xs font-bold uppercase" style={{ color: "rgba(255,255,255,0.7)" }}>Status</div>
                <SortBtn k="qbCurrentCost" label="QB Cost" />
                <SortBtn k="avgCost" label="Avg Paid" />
                <SortBtn k="variance" label="Variance $" />
                <SortBtn k="variancePct" label="Variance %" />
                <SortBtn k="margin" label="Margin" />
                <SortBtn k="timesOrdered" label="Orders" />
              </div>

              {/* Rows */}
              {filtered.map((item, idx) => {
                const s = statusInfo(item);
                return (
                  <div
                    key={item.name}
                    className="grid px-4 py-3 text-sm items-center"
                    style={{
                      gridTemplateColumns: "2fr 80px 100px 100px 100px 90px 80px 90px",
                      gap: "8px",
                      background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-surface-2)",
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    {/* Product name */}
                    <div>
                      <div className="font-semibold text-sm truncate" title={item.fullName}>
                        {item.name}
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
                        {item.sku && <span className="mr-2">SKU: {item.sku}</span>}
                        {item.vendors.slice(0, 2).join(", ")}
                        {item.lastPurchaseDate && (
                          <span className="ml-2">
                            Last: {new Date(item.lastPurchaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <div>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: s.bg, color: s.color }}
                      >
                        {s.label}
                      </span>
                    </div>

                    {/* QB Current Cost */}
                    <div className="text-right font-mono text-sm">
                      {item.qbCurrentCost > 0 ? fmt(item.qbCurrentCost) : <span style={{ color: "#9333EA" }}>Not set</span>}
                    </div>

                    {/* Avg Paid */}
                    <div className="text-right font-mono text-sm">{fmt(item.avgCost)}</div>

                    {/* Variance $ */}
                    <div
                      className="text-right font-mono text-sm font-semibold"
                      style={{
                        color: item.variance > 0.01 ? "#DC2626" : item.variance < -0.01 ? "#0284C7" : "#16A34A",
                      }}
                    >
                      {item.variance > 0 ? "+" : ""}{fmt(item.variance)}
                    </div>

                    {/* Variance % */}
                    <div
                      className="text-right font-mono text-sm font-semibold"
                      style={{
                        color:
                          item.variancePct == null ? "var(--color-text-muted)"
                          : Math.abs(item.variancePct) >= 10 ? "#DC2626"
                          : Math.abs(item.variancePct) >= 5 ? "#D97706"
                          : "#16A34A",
                      }}
                    >
                      {fmtPct(item.variancePct)}
                    </div>

                    {/* Margin (based on avg actual cost) */}
                    <div
                      className="text-right font-mono text-sm"
                      style={{
                        color:
                          item.margin == null ? "var(--color-text-muted)"
                          : item.margin < 20 ? "#DC2626"
                          : item.margin < 35 ? "#D97706"
                          : "#16A34A",
                      }}
                    >
                      {item.margin != null ? `${item.margin}%` : "—"}
                    </div>

                    {/* Times ordered */}
                    <div className="text-right text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {item.timesOrdered}x
                      {item.minCost !== item.maxCost && (
                        <div className="text-xs" title={`Range: ${fmt(item.minCost)} – ${fmt(item.maxCost)}`}>
                          {fmt(item.minCost)}–{fmt(item.maxCost)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fix plan */}
          {stats.critical + stats.high + stats.noQbCost > 0 && !loading && (
            <div className="mt-8 rounded-xl p-5" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-bold text-base mb-3">Fix Plan</h2>
              <ol className="space-y-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                <li className="flex gap-2">
                  <span className="font-bold" style={{ color: "#DC2626", minWidth: 20 }}>1.</span>
                  <span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Update QB PurchaseCost</span> for the{" "}
                    <span style={{ color: "#DC2626", fontWeight: 600 }}>{stats.critical + stats.high}</span> Critical/High items first —
                    these have the largest gap between what you paid and what QB has recorded.
                    In QuickBooks: Products &amp; Services → find each item → edit → update "Cost" field to the Avg Paid shown above.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold" style={{ color: "#9333EA", minWidth: 20 }}>2.</span>
                  <span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Set missing costs</span> for the{" "}
                    <span style={{ color: "#9333EA", fontWeight: 600 }}>{stats.noQbCost}</span> items with no PurchaseCost in QB —
                    without this, QB shows $0 cost on those jobs and your P&amp;L is completely wrong for those products.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold" style={{ color: "#D97706", minWidth: 20 }}>3.</span>
                  <span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Review Moderate items</span> ({stats.moderate} products, 5–10% off) —
                    these could be vendor price increases you haven&apos;t pushed through yet.
                    Consider updating your sale prices too if margins are getting thin.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold" style={{ color: "#16A34A", minWidth: 20 }}>4.</span>
                  <span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Re-pull monthly</span> — click "Pull Latest QB Data" once a month
                    to catch any new cost drift before it compounds.
                  </span>
                </li>
              </ol>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
