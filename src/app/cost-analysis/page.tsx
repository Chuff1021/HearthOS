"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type CostItem = {
  name: string;
  sku: string;
  fullName: string;
  category: string;
  hasBillHistory: boolean;
  avgCost: number | null;
  minCost: number | null;
  maxCost: number | null;
  mostRecentCost: number | null;
  lastPurchaseDate: string | null;
  timesOrdered: number;
  vendors: string[];
  qbCurrentCost: number;
  salePrice: number;
  variance: number;
  variancePct: number | null;
  margin: number | null;
};

type SortKey = "name" | "variance" | "variancePct" | "avgCost" | "qbCurrentCost" | "margin" | "timesOrdered" | "category";
type FilterMode = "all" | "issues" | "critical" | "no-cost" | "no-history";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}

function statusInfo(item: CostItem): { label: string; color: string; bg: string; priority: number } {
  if (!item.hasBillHistory) {
    return { label: "No History", color: "#6B7280", bg: "rgba(107,114,128,0.12)", priority: 6 };
  }
  if (item.qbCurrentCost === 0 && (item.avgCost ?? 0) > 0) {
    return { label: "No QB Cost", color: "#9333EA", bg: "rgba(147,51,234,0.12)", priority: 0 };
  }
  const pct = Math.abs(item.variancePct ?? 0);
  if (item.variance > 0) {
    if (pct >= 20) return { label: "Critical", color: "#DC2626", bg: "rgba(220,38,38,0.12)", priority: 1 };
    if (pct >= 10) return { label: "High", color: "#EA580C", bg: "rgba(234,88,12,0.12)", priority: 2 };
    if (pct >= 5)  return { label: "Moderate", color: "#D97706", bg: "rgba(217,119,6,0.12)", priority: 3 };
  }
  if (item.variance < 0 && pct >= 10) {
    return { label: "Overstated", color: "#0284C7", bg: "rgba(2,132,199,0.12)", priority: 4 };
  }
  return { label: "OK", color: "#16A34A", bg: "rgba(22,163,74,0.08)", priority: 5 };
}

export default function CostAnalysisPage() {
  const [items, setItems] = useState<CostItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [updatingRows, setUpdatingRows] = useState<Set<string>>(new Set());
  const [rowResults, setRowResults] = useState<Record<string, { ok: boolean; cost?: number; error?: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("variance");
  const [sortDesc, setSortDesc] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>("issues");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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

  // Generic update — pass item names to update, or empty for no-cost-only
  async function updateItems(names?: string[]) {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const body = names ? { items: names } : {};
      const res = await fetch("/api/cost-analysis/update-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setUpdateResult(data);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  function updateNoCostItems() { return updateItems(undefined); }

  async function updateSingleItem(name: string) {
    setUpdatingRows((prev) => new Set(prev).add(name));
    try {
      const res = await fetch("/api/cost-analysis/update-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [name] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      const r = data.results?.[0];
      setRowResults((prev) => ({ ...prev, [name]: r || { ok: false, error: "No result" } }));
      if (r?.ok) await loadData();
    } catch (e: any) {
      setRowResults((prev) => ({ ...prev, [name]: { ok: false, error: e.message } }));
    } finally {
      setUpdatingRows((prev) => { const s = new Set(prev); s.delete(name); return s; });
    }
  }

  useEffect(() => { loadData(); }, []);

  // Unique categories from all items
  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category || "Other"));
    return ["all", ...Array.from(cats).sort()];
  }, [items]);

  const stats = useMemo(() => {
    const withHistory = items.filter((i) => i.hasBillHistory);
    return {
      critical:   withHistory.filter((i) => statusInfo(i).priority <= 1).length,
      high:       withHistory.filter((i) => statusInfo(i).priority === 2).length,
      moderate:   withHistory.filter((i) => statusInfo(i).priority === 3).length,
      noQbCost:   withHistory.filter((i) => statusInfo(i).label === "No QB Cost").length,
      ok:         withHistory.filter((i) => statusInfo(i).label === "OK").length,
      noHistory:  items.filter((i) => !i.hasBillHistory).length,
      total:      items.length,
      totalOverpaying: withHistory
        .filter((i) => i.variance > 0)
        .reduce((s, i) => s + i.variance * i.timesOrdered, 0),
    };
  }, [items]);

  function setSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(key !== "name"); }
  }

  // Tokenize search query — all tokens must match somewhere in the item
  function matchesSearch(item: CostItem, tokens: string[]): boolean {
    if (tokens.length === 0) return true;
    const haystack = [
      item.name,
      item.fullName,
      item.sku,
      item.category,
      ...item.vendors,
    ].join(" ").toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  }

  const filtered = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

    let out = items.filter((item) => {
      if (!matchesSearch(item, tokens)) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;

      switch (filterMode) {
        case "issues":
          return statusInfo(item).label !== "OK" && statusInfo(item).label !== "No History";
        case "critical":
          return statusInfo(item).priority <= 2;
        case "no-cost":
          return statusInfo(item).label === "No QB Cost";
        case "no-history":
          return !item.hasBillHistory;
        default:
          return true;
      }
    });

    out = [...out].sort((a, b) => {
      if (sortKey === "name") {
        return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      }
      if (sortKey === "category") {
        const cmp = a.category.localeCompare(b.category);
        return sortDesc ? -cmp : cmp;
      }
      let av: number, bv: number;
      switch (sortKey) {
        case "variance":     av = a.variance;           bv = b.variance;           break;
        case "variancePct":  av = Math.abs(a.variancePct ?? 0); bv = Math.abs(b.variancePct ?? 0); break;
        case "avgCost":      av = a.avgCost ?? 0;       bv = b.avgCost ?? 0;       break;
        case "qbCurrentCost":av = a.qbCurrentCost;      bv = b.qbCurrentCost;      break;
        case "margin":       av = a.margin ?? -999;     bv = b.margin ?? -999;     break;
        case "timesOrdered": av = a.timesOrdered;       bv = b.timesOrdered;       break;
        default:             av = a.variance;            bv = b.variance;
      }
      return sortDesc ? bv - av : av - bv;
    });

    return out;
  }, [items, search, filterMode, categoryFilter, sortKey, sortDesc]);

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

  const filterButtons: { key: FilterMode; label: string; count: number }[] = [
    { key: "all",        label: "All Items",          count: items.length },
    { key: "issues",     label: "Has Issues",         count: stats.critical + stats.high + stats.moderate + stats.noQbCost },
    { key: "critical",   label: "Critical / High",    count: stats.critical + stats.high },
    { key: "no-cost",    label: "No QB Cost",         count: stats.noQbCost },
    { key: "no-history", label: "No Purchase History",count: stats.noHistory },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-background)", color: "var(--color-text)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">

          {/* Page header */}
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold mb-1">Inventory Cost Analysis</h1>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                All QB inventory items — actual cost paid on vendor bills vs QB PurchaseCost
                {updatedAt && <span className="ml-2">· Last pulled {new Date(updatedAt).toLocaleDateString()}</span>}
                {items.length > 0 && <span className="ml-2">· {items.length} total items</span>}
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

          {/* Pull result banner */}
          {pullResult && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm space-y-1"
              style={{ background: "rgba(44,160,28,0.1)", border: "1px solid rgba(44,160,28,0.3)" }}>
              {pullResult.error ? (
                <div style={{ color: "#DC2626", fontWeight: 600 }}>{pullResult.error}</div>
              ) : (
                <>
                  <div>
                    <strong>{pullResult.billsPaid}</strong> paid bills · <strong>{pullResult.flagged?.totalQbItems ?? 0}</strong> total QB items ·{" "}
                    <strong>{pullResult.itemsFound}</strong> shown below
                    {pullResult.flagged?.noQbCost > 0 && <span style={{ color: "#9333EA" }}> · {pullResult.flagged.noQbCost} with no cost set</span>}
                    {pullResult.flagged?.noHistory > 0 && <span style={{ color: "#6B7280" }}> · {pullResult.flagged.noHistory} with no bill history</span>}
                  </div>
                  {pullResult.warning && <div style={{ color: "#D97706" }}>{pullResult.warning}</div>}
                  {pullResult.billError && <div className="text-xs" style={{ color: "#D97706" }}>Note: {pullResult.billError}</div>}
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
              {[
                { label: "Critical (>20%)", value: stats.critical,  color: "#DC2626" },
                { label: "High (10–20%)",   value: stats.high,      color: "#EA580C" },
                { label: "Moderate (5–10%)",value: stats.moderate,  color: "#D97706" },
                { label: "No QB Cost",      value: stats.noQbCost,  color: "#9333EA" },
                { label: "No History",      value: stats.noHistory, color: "#6B7280" },
                { label: "OK",              value: stats.ok,        color: "#16A34A" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl px-4 py-3 cursor-pointer" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* No QB cost — update button */}
          {stats.noQbCost > 0 && (
            <div className="mb-5 px-4 py-3 rounded-lg flex items-start justify-between gap-4 flex-wrap"
              style={{ background: "rgba(147,51,234,0.08)", border: "1px solid rgba(147,51,234,0.25)" }}>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: "#9333EA" }}>
                  {stats.noQbCost} item{stats.noQbCost !== 1 ? "s" : ""} have no cost set in QuickBooks
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Will be set to the most recent price paid on a vendor bill.
                </div>
                {updateResult && (
                  <div className="mt-2 text-xs">
                    {updateResult.error
                      ? <span style={{ color: "#DC2626" }}>{updateResult.error}</span>
                      : <span style={{ color: "#16A34A", fontWeight: 600 }}>{updateResult.updated} item{updateResult.updated !== 1 ? "s" : ""} updated in QB{updateResult.failed > 0 ? ` · ${updateResult.failed} failed` : ""}</span>
                    }
                  </div>
                )}
              </div>
              <button
                onClick={updateNoCostItems}
                disabled={updating}
                className="px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap"
                style={{ background: updating ? "var(--color-surface-2)" : "#9333EA", color: "#fff", opacity: updating ? 0.6 : 1 }}
              >
                {updating ? "Updating QB..." : `Update ${stats.noQbCost} Item${stats.noQbCost !== 1 ? "s" : ""} in QB`}
              </button>
            </div>
          )}

          {/* Critical / High bulk update banner */}
          {stats.critical + stats.high > 0 && (
            <div className="mb-5 px-4 py-3 rounded-lg flex items-start justify-between gap-4 flex-wrap"
              style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)" }}>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: "#DC2626" }}>
                  {stats.critical + stats.high} item{stats.critical + stats.high !== 1 ? "s" : ""} where QB cost is significantly understated (Critical + High)
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Will update QB PurchaseCost to the average price you actually paid on vendor bills.
                </div>
                {updateResult && updating === false && updateResult.results?.some((r: any) => r.ok) && (
                  <div className="mt-1 text-xs" style={{ color: "#16A34A", fontWeight: 600 }}>
                    {updateResult.updated} item{updateResult.updated !== 1 ? "s" : ""} updated in QB
                    {updateResult.failed > 0 && <span style={{ color: "#D97706" }}> · {updateResult.failed} failed</span>}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  const names = items
                    .filter((i) => statusInfo(i).priority <= 2) // critical + high
                    .map((i) => i.name);
                  updateItems(names);
                }}
                disabled={updating}
                className="px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap"
                style={{ background: updating ? "var(--color-surface-2)" : "#DC2626", color: "#fff", opacity: updating ? 0.6 : 1 }}
              >
                {updating ? "Updating QB..." : `Update ${stats.critical + stats.high} Item${stats.critical + stats.high !== 1 ? "s" : ""} in QB`}
              </button>
            </div>
          )}

          {/* Overpaying banner */}
          {stats.totalOverpaying > 100 && (
            <div className="mb-5 px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <span style={{ fontWeight: 600, color: "#DC2626" }}>Estimated cost understatement:</span>
              <span className="ml-2">{fmt(stats.totalOverpaying)} across all purchases — your QB cost records have been understating what you actually paid.</span>
            </div>
          )}

          {/* ── Search + Filters ── */}
          {items.length > 0 && (
            <div className="space-y-3 mb-4">
              {/* Search bar */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--color-text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, SKU, category, vendor..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded"
                    style={{ color: "var(--color-text-muted)", background: "var(--color-surface-3)" }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Filter mode + category */}
              <div className="flex gap-2 flex-wrap">
                {filterButtons.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilterMode(f.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                      background: filterMode === f.key ? "#2563EB" : "var(--color-surface-2)",
                      color: filterMode === f.key ? "#fff" : "var(--color-text)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}

                {/* Category dropdown */}
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c === "all" ? "All Categories" : c}</option>
                  ))}
                </select>
              </div>

              {/* Result count */}
              <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Showing {filtered.length} of {items.length} items
                {search && <span> matching <strong>"{search}"</strong></span>}
                {categoryFilter !== "all" && <span> in <strong>{categoryFilter}</strong></span>}
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="text-center py-16" style={{ color: "var(--color-text-muted)" }}>Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 rounded-xl" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="text-lg font-semibold mb-2">No data yet</div>
              <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
                Click "Pull Latest QB Data" to load your inventory and vendor bill history.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 rounded-xl" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="font-semibold mb-1">No items match</div>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Try clearing the search or changing the filter.
              </p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              {/* Header */}
              <div
                className="grid px-4 py-3"
                style={{ gridTemplateColumns: "2fr 90px 90px 100px 100px 90px 75px 80px", gap: "8px", background: "#1a2235" }}
              >
                <SortBtn k="name" label="Product" />
                <SortBtn k="category" label="Category" />
                <div className="text-xs font-bold uppercase" style={{ color: "rgba(255,255,255,0.7)" }}>Status</div>
                <SortBtn k="qbCurrentCost" label="QB Cost" />
                <SortBtn k="avgCost" label="Avg Paid" />
                <SortBtn k="variance" label="Variance" />
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
                      gridTemplateColumns: "2fr 90px 90px 100px 100px 90px 75px 80px",
                      gap: "8px",
                      background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-surface-2)",
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    {/* Name */}
                    <div>
                      <div className="font-semibold text-sm truncate" title={item.fullName}>
                        {item.name}
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
                        {item.sku && <span className="mr-2 font-mono">SKU: {item.sku}</span>}
                        {item.vendors.length > 0 && <span className="mr-2">{item.vendors.slice(0, 2).join(", ")}</span>}
                        {item.lastPurchaseDate && (
                          <span>Last bill: {new Date(item.lastPurchaseDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                        )}
                      </div>
                    </div>

                    {/* Category */}
                    <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }} title={item.category}>
                      {item.category}
                    </div>

                    {/* Status */}
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                      {s.priority <= 2 && !rowResults[item.name] && (
                        <button
                          onClick={() => updateSingleItem(item.name)}
                          disabled={updatingRows.has(item.name)}
                          className="text-xs px-2 py-0.5 rounded font-semibold"
                          style={{
                            background: updatingRows.has(item.name) ? "var(--color-surface-3)" : "rgba(37,99,235,0.12)",
                            color: "#2563EB",
                            border: "1px solid rgba(37,99,235,0.3)",
                            opacity: updatingRows.has(item.name) ? 0.6 : 1,
                          }}
                        >
                          {updatingRows.has(item.name) ? "Saving..." : "Update QB"}
                        </button>
                      )}
                      {rowResults[item.name] && (
                        <span className="text-xs font-semibold" style={{ color: rowResults[item.name].ok ? "#16A34A" : "#DC2626" }}>
                          {rowResults[item.name].ok
                            ? `✓ Set ${fmt(rowResults[item.name].cost)}`
                            : `✗ ${rowResults[item.name].error?.slice(0, 30) || "Failed"}`}
                        </span>
                      )}
                    </div>

                    {/* QB Cost */}
                    <div className="text-right font-mono text-sm">
                      {item.qbCurrentCost > 0 ? fmt(item.qbCurrentCost) : <span style={{ color: "#9333EA" }}>Not set</span>}
                    </div>

                    {/* Avg Paid */}
                    <div className="text-right font-mono text-sm">
                      {item.avgCost != null ? fmt(item.avgCost) : <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>No bills</span>}
                    </div>

                    {/* Variance */}
                    <div
                      className="text-right font-mono text-sm font-semibold"
                      style={{
                        color: item.variance > 0.01 ? "#DC2626"
                          : item.variance < -0.01 ? "#0284C7"
                          : "#16A34A",
                      }}
                    >
                      {item.hasBillHistory
                        ? `${item.variance > 0 ? "+" : ""}${fmt(item.variance)}`
                        : <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>—</span>}
                    </div>

                    {/* Margin */}
                    <div
                      className="text-right font-mono text-sm"
                      style={{
                        color: item.margin == null ? "var(--color-text-muted)"
                          : item.margin < 20 ? "#DC2626"
                          : item.margin < 35 ? "#D97706"
                          : "#16A34A",
                      }}
                    >
                      {item.margin != null ? `${item.margin}%` : "—"}
                    </div>

                    {/* Orders */}
                    <div className="text-right text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {item.timesOrdered > 0 ? (
                        <>
                          {item.timesOrdered}x
                          {item.minCost !== item.maxCost && item.minCost != null && item.maxCost != null && (
                            <div className="text-xs">{fmt(item.minCost)}–{fmt(item.maxCost)}</div>
                          )}
                        </>
                      ) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fix plan */}
          {(stats.critical + stats.high + stats.noQbCost > 0) && !loading && (
            <div className="mt-8 rounded-xl p-5" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-bold text-base mb-3">Fix Plan</h2>
              <ol className="space-y-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                <li className="flex gap-2">
                  <span className="font-bold" style={{ color: "#9333EA", minWidth: 20 }}>1.</span>
                  <span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Fix missing costs</span> — click the purple button above to push the last-paid price into QB for all {stats.noQbCost} items with no cost set.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold" style={{ color: "#DC2626", minWidth: 20 }}>2.</span>
                  <span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Fix {stats.critical + stats.high} Critical/High items</span> — click "Update {stats.critical + stats.high} Items in QB" above to push the average paid price to all of them at once, or click "Update QB" on individual rows.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold" style={{ color: "#D97706", minWidth: 20 }}>3.</span>
                  <span>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Review {stats.noHistory} items with no history</span> — use the "No Purchase History" filter to see items in your inventory that don't appear on any vendor bill in the last 24 months. These may be duplicates, discontinued items, or items entered under a different name.
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
