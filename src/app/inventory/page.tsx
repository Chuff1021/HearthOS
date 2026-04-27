"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DocumentDrawer, { type DocumentType } from "@/components/documents/DocumentDrawer";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
type InventoryItem = {
  id: string;
  qbItemId: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  location: string | null;
  unitPrice: number | null;
  cost: number | null;
  margin: number | null;
  quantityOnHand: number;
  reorderLevel: number;
  isLowStock: boolean;
  isActive: boolean;
  isTracked: boolean;
  lastPaidCost: number | null;
  lastPaidDate: string | null;
  lastPaidVendorId: string | null;
  avgPaidCost: number | null;
  billCount: number;
  updatedAt: string | null;
  lastSyncedAt: string | null;
};

type ListResponse = {
  items: InventoryItem[];
  page: number;
  limit: number;
  totalCount: number;
  stats: {
    totalItems: number;
    trackedItems: number;
    untrackedItems: number;
    lowStockCount: number;
    noCostCount: number;
    totalValue: number;
  };
  categories: string[];
};

type DetailResponse = {
  item: InventoryItem & { description: string | null; updatedAt: string };
  costSummary: {
    lastPaidCost: number | null;
    lastPaidDate: string | null;
    lastPaidVendorName: string | null;
    avg12mCost: number | null;
    minCostEver: number | null;
    maxCostEver: number | null;
    billCount: number;
    invoiceCount: number;
    openPOCount: number;
  };
  billHistory: Array<{
    billId: string; billNumber: string | null; issueDate: string | null;
    vendorId: string | null; vendorName: string | null;
    qty: string; unitCost: string; amount: string; description: string | null;
  }>;
  salesHistory: Array<{
    invoiceId: string; invoiceNumber: string | null; issueDate: string | null;
    customerId: string | null; customerName: string | null;
    qty: string; unitPrice: string; total: string; description: string | null;
  }>;
  openPOs: Array<{
    poId: string; poNumber: string | null; issueDate: string | null; expectedDate: string | null;
    status: string | null; vendorId: string | null; vendorName: string | null;
    qty: string; receivedQty: string; unitCost: string;
  }>;
  vendorBreakdown: Array<{
    vendorId: string | null; vendorName: string | null;
    timesPurchased: number; totalQty: string;
    avgCost: string; minCost: string; maxCost: string; lastPaid: string | null;
  }>;
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number | null | undefined, dash = "—") =>
  n == null || isNaN(Number(n)) ? dash : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const fmtPct = (n: number | null) =>
  n == null || isNaN(n) ? "—" : `${n.toFixed(1)}%`;

const trendArrow = (current: number | null, prior: number | null) => {
  if (current == null || prior == null || prior === 0) return null;
  const diff = ((current - prior) / prior) * 100;
  if (Math.abs(diff) < 1) return { sym: "→", color: "var(--color-text-muted)", label: "stable" };
  return diff > 0
    ? { sym: "↑", color: "#FF204E", label: `+${diff.toFixed(0)}%` }
    : { sym: "↓", color: "#16A34A", label: `${diff.toFixed(0)}%` };
};

// Debounce hook for search input
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// ───────────────────────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────────────────────
type ScopeKey = "active" | "retired" | "all";
type FilterKey = "all" | "low_stock" | "no_cost";

// Map UI scope → API filter param
const scopeToApiFilter = (scope: ScopeKey): string => {
  if (scope === "active") return "tracked";
  if (scope === "retired") return "untracked";
  return "all";
};
type SortKey = "name" | "qty" | "unit_price" | "cost" | "updated";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [scope, setScope] = useState<ScopeKey>("active");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [trimOpen, setTrimOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const limit = 100;
  // When the user types a query, search spans both active and retired so
  // retired items remain findable without forcing them to switch tabs.
  const searching = debounced.trim().length > 0;
  const effectiveScope: ScopeKey = searching ? "all" : scope;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    // Combine scope + secondary filter into the single API filter param.
    // If a secondary filter is set (low_stock, no_cost), it wins; otherwise use scope.
    const apiFilter = filter !== "all" ? filter : scopeToApiFilter(effectiveScope);
    const params = new URLSearchParams({
      q: debounced,
      filter: apiFilter,
      category,
      sort,
      dir,
      page: String(page),
      limit: String(limit),
    });
    try {
      const r = await fetch(`/api/inventory?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setData(j);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [debounced, filter, effectiveScope, category, sort, dir, page]);

  useEffect(() => { setPage(1); }, [debounced, filter, scope, category, sort, dir]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.limit)) : 1;

  const headerSort = (col: SortKey) => () => {
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir(col === "name" ? "asc" : "desc"); }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1800px] mx-auto space-y-4">

            {/* Title row */}
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Inventory</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Search, sort, manage every part. Click an item for full cost history.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => fetchList()} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)" }}>
                  Refresh
                </button>
                <button
                  onClick={() => setAuditOpen(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)" }}
                  title="Compare each item's cost to its most recent PO and auto-correct"
                >
                  Price audit…
                </button>
                <button
                  onClick={() => setTrimOpen(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)" }}
                  title="Mark items with no recent activity as retired"
                >
                  Trim inventory…
                </button>
                <button
                  onClick={async () => {
                    const r = await fetch("/api/quickbooks/sync/items", { method: "POST" });
                    if (r.ok) fetchList();
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)" }}
                >
                  Sync from QuickBooks
                </button>
              </div>
            </div>

            {/* Stats banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Active inventory"
                value={data?.stats.trackedItems ?? 0}
                onClick={() => setScope("active")}
                active={scope === "active" && !searching}
              />
              <StatCard
                label="Retired"
                value={data?.stats.untrackedItems ?? 0}
                tone="warn"
                onClick={() => setScope("retired")}
                active={scope === "retired" && !searching}
              />
              <StatCard
                label="Low Stock"
                value={data?.stats.lowStockCount ?? 0}
                tone={(data?.stats.lowStockCount ?? 0) > 0 ? "danger" : "good"}
                onClick={() => setFilter("low_stock")}
                active={filter === "low_stock"}
              />
              <StatCard label="Active value" value={fmtMoney(data?.stats.totalValue ?? 0)} />
            </div>

            {/* Search + category */}
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                placeholder={searching ? "Searching all inventory…" : "Search by name, SKU, description, category…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[280px] px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              >
                <option value="">All categories</option>
                {data?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <FilterPill label="No filter" value="all" current={filter} onClick={setFilter} />
              <FilterPill label="Low stock" value="low_stock" current={filter} onClick={setFilter} />
              <FilterPill label="No cost set" value="no_cost" current={filter} onClick={setFilter} />
            </div>

            {/* Scope tabs — primary working set selector */}
            <div className="flex items-center gap-1 px-1 py-1 rounded-xl w-fit" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              {([
                { id: "active", label: "Active inventory", count: data?.stats.trackedItems },
                { id: "retired", label: "Retired", count: data?.stats.untrackedItems },
                { id: "all", label: "All", count: data?.stats.totalItems },
              ] as const).map((tab) => {
                const isActive = !searching && scope === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setScope(tab.id); setSearch(""); }}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: isActive ? "var(--color-surface-1)" : "transparent",
                      color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                      border: isActive ? "1px solid var(--color-border)" : "1px solid transparent",
                    }}
                  >
                    {tab.label}
                    {typeof tab.count === "number" && (
                      <span className="ml-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{tab.count.toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
              {searching && (
                <span className="ml-2 px-2 py-0.5 rounded text-xs" style={{ background: "rgba(255,68,0,0.15)", color: "#eaa23f" }}>
                  Searching all
                </span>
              )}
            </div>

            {/* Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--color-surface-2)" }}>
                    <tr>
                      <Th onClick={headerSort("name")} active={sort === "name"} dir={dir}>Item</Th>
                      <Th>Category</Th>
                      <Th onClick={headerSort("qty")} active={sort === "qty"} dir={dir} className="text-right">On Hand</Th>
                      <Th className="text-right">Reorder</Th>
                      <Th onClick={headerSort("unit_price")} active={sort === "unit_price"} dir={dir} className="text-right">Sale Price</Th>
                      <Th onClick={headerSort("cost")} active={sort === "cost"} dir={dir} className="text-right">Current Cost</Th>
                      <Th className="text-right">Last Paid</Th>
                      <Th className="text-right">Avg Paid</Th>
                      <Th className="text-right">Margin</Th>
                      <Th>Location</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((item) => {
                      const trend = trendArrow(item.lastPaidCost, item.avgPaidCost);
                      const costMismatch = item.cost != null && item.lastPaidCost != null && Math.abs(Number(item.cost) - item.lastPaidCost) / Math.max(item.lastPaidCost, 0.01) > 0.1;
                      const isRetired = (item as any).isTracked === false;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className="cursor-pointer transition-colors"
                          style={{ borderTop: "1px solid var(--color-border)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium flex items-center gap-2" style={{ color: "var(--color-text-primary)", opacity: isRetired ? 0.7 : 1 }}>
                              {item.name}
                              {isRetired && (
                                <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>retired</span>
                              )}
                              {!item.isActive && <span className="text-[9px] uppercase opacity-60">qb-inactive</span>}
                            </div>
                            <div className="text-[11px] font-mono mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                              {item.sku || "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {item.category || "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium" style={{ color: item.isLowStock && item.isActive ? "#FF204E" : "var(--color-text-primary)" }}>
                            {item.quantityOnHand}
                          </td>
                          <td className="px-3 py-2 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {item.reorderLevel || "—"}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-primary)" }}>
                            {fmtMoney(item.unitPrice)}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: costMismatch ? "#F59E0B" : "var(--color-text-primary)" }}>
                            {fmtMoney(item.cost)}
                            {costMismatch && <span className="ml-1 text-[10px]" title="Current cost differs from last paid by &gt;10%">⚠</span>}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-secondary)" }}>
                            {fmtMoney(item.lastPaidCost)}
                            {trend && (
                              <span className="ml-1 text-[10px]" style={{ color: trend.color }} title={trend.label}>
                                {trend.sym}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-muted)" }}>
                            {fmtMoney(item.avgPaidCost)}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: item.margin != null && item.margin < 0 ? "#FF204E" : "var(--color-text-secondary)" }}>
                            {fmtPct(item.margin)}
                          </td>
                          <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {item.location || "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && data?.items.length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No items match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-3 py-2 text-xs" style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                <span>
                  {loading ? "Loading…" : data ? (
                    <>Showing <strong>{(page - 1) * limit + 1}</strong>–<strong>{Math.min(page * limit, data.totalCount)}</strong> of <strong>{data.totalCount.toLocaleString()}</strong></>
                  ) : "—"}
                </span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded disabled:opacity-30" style={{ background: "var(--color-surface-1)" }}>Prev</button>
                  <span>Page {page} of {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded disabled:opacity-30" style={{ background: "var(--color-surface-1)" }}>Next</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {selectedId && (
        <DetailDrawer
          itemId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => fetchList()}
        />
      )}

      {trimOpen && (
        <TrimModal
          onClose={() => setTrimOpen(false)}
          onApplied={() => { setTrimOpen(false); fetchList(); }}
        />
      )}

      {auditOpen && (
        <PriceAuditModal
          onClose={() => setAuditOpen(false)}
          onApplied={() => fetchList()}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Price audit modal
// ───────────────────────────────────────────────────────────────────────────
type AuditRow = {
  id: string;
  qbItemId: string;
  name: string;
  sku: string | null;
  category: string | null;
  currentCost: number;
  vendorCost: number;
  delta: number;
  pctDelta: number;
  isTracked: boolean;
  noCostSet: boolean;
  vendorName: string | null;
  vendorId: string | null;
  sourceType: "bill" | "po";
  sourceId: string;
  sourceNumber: string | null;
  sourceDate: string | null;
  unitPrice: number | null;
  newMargin: number | null;
};

type AuditSource = "bills" | "pos" | "either";

type AuditResponse = {
  window: { monthsBack: number; cutoff: string };
  source: AuditSource;
  thresholds: { minVariancePct: number; minVarianceAmt: number };
  itemsConsidered: number;
  itemsWithData: number;
  itemsFlagged: number;
  noCostSetCount: number;
  goingUpCount: number;
  goingDownCount: number;
  bySourceType: { bill: number; po: number };
  totalAdjustment: number;
  rows: AuditRow[];
};

function PriceAuditModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [source, setSource] = useState<AuditSource>("bills");
  const [monthsBack, setMonthsBack] = useState(24);
  const [minPct, setMinPct] = useState(1);
  const [includeRetired, setIncludeRetired] = useState(false);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        source,
        monthsBack: String(monthsBack),
        minVariancePct: String(minPct),
        includeRetired: includeRetired ? "true" : "false",
      });
      const r = await fetch(`/api/inventory/price-audit?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setData(j);
      // Default-select every flagged row so 'Auto-correct all' is one click.
      setSelected(new Set(j.rows.map((row: AuditRow) => row.id)));
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, [source, monthsBack, minPct, includeRetired]);

  useEffect(() => { run(); }, [run]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = data && data.rows.length > 0 && selected.size === data.rows.length;

  const apply = async () => {
    if (!data) return;
    setApplying(true);
    try {
      const corrections = data.rows
        .filter((r) => selected.has(r.id))
        .map((r) => ({ id: r.id, newCost: r.vendorCost }));
      const res = await fetch("/api/inventory/price-audit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corrections }),
      });
      if (res.ok) {
        onApplied();
        await run(); // refresh list — applied rows should drop out
      }
    } finally {
      setApplying(false);
    }
  };

  const totalDelta = data
    ? data.rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + Math.abs(r.delta), 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Price audit</h2>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Compare each item&apos;s current cost against its most recent purchase order. Auto-correct any drift.
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--color-text-muted)" }}>✕</button>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-4 mt-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Compare against</span>
              {([
                { id: "bills" as const, label: "Bills paid" },
                { id: "pos" as const, label: "POs" },
                { id: "either" as const, label: "Either" },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSource(opt.id)}
                  className="px-2.5 py-1 rounded-lg text-xs"
                  style={{
                    background: source === opt.id ? "#f8971f" : "var(--color-surface-2)",
                    color: source === opt.id ? "white" : "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                  title={
                    opt.id === "bills"
                      ? "What you actually paid on vendor bills"
                      : opt.id === "pos"
                        ? "What you ordered on purchase orders"
                        : "Whichever document is more recent per item"
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Window</span>
              {[12, 18, 24, 36].map((m) => (
                <button
                  key={m}
                  onClick={() => setMonthsBack(m)}
                  className="px-2.5 py-1 rounded-lg text-xs"
                  style={{
                    background: monthsBack === m ? "#f8971f" : "var(--color-surface-2)",
                    color: monthsBack === m ? "white" : "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {m} mo
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Min variance</span>
              {[1, 2, 5, 10].map((p) => (
                <button
                  key={p}
                  onClick={() => setMinPct(p)}
                  className="px-2.5 py-1 rounded-lg text-xs"
                  style={{
                    background: minPct === p ? "#f8971f" : "var(--color-surface-2)",
                    color: minPct === p ? "white" : "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {p}%
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs ml-auto" style={{ color: "var(--color-text-secondary)" }}>
              <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} />
              Include retired items
            </label>
          </div>

          {/* Summary stats */}
          {data && !loading && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4 text-xs">
              <SummaryStat label="Considered" value={data.itemsConsidered.toLocaleString()} />
              <SummaryStat
                label={
                  data.source === "bills" ? "With recent bill" :
                  data.source === "pos" ? "With recent PO" :
                  "With recent doc"
                }
                value={data.itemsWithData.toLocaleString()}
              />
              <SummaryStat label="Flagged" value={data.itemsFlagged.toLocaleString()} tone="warn" />
              <SummaryStat label="Going up" value={data.goingUpCount.toLocaleString()} tone="danger" />
              <SummaryStat label="Going down" value={data.goingDownCount.toLocaleString()} tone="good" />
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading && <p className="p-5 text-sm" style={{ color: "var(--color-text-muted)" }}>Auditing…</p>}
          {error && <p className="p-5 text-sm" style={{ color: "#FF204E" }}>{error}</p>}
          {data && !loading && data.rows.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                No cost discrepancies found at the {minPct}% threshold over the last {monthsBack} months. 🎉
              </p>
            </div>
          )}
          {data && !loading && data.rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: "var(--color-surface-2)" }}>
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={!!allSelected}
                      onChange={() => {
                        if (allSelected) setSelected(new Set());
                        else setSelected(new Set(data.rows.map((r) => r.id)));
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Item</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Current</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>From vendor</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Δ</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>%</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>New margin</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Vendor / PO</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const checked = selected.has(r.id);
                  const deltaColor = r.noCostSet ? "#F59E0B" : r.delta > 0 ? "#FF204E" : "#16A34A";
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {r.name}
                          {r.noCostSet && (
                            <span className="ml-2 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>
                              no cost set
                            </span>
                          )}
                          {!r.isTracked && (
                            <span className="ml-2 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                              retired
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                          {r.sku || "—"}{r.category ? ` · ${r.category}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-secondary)" }}>{fmtMoney(r.currentCost)}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(r.vendorCost)}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: deltaColor }}>
                        {r.delta > 0 ? "+" : ""}{fmtMoney(r.delta)}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: deltaColor }}>
                        {r.noCostSet ? "—" : `${r.pctDelta > 0 ? "+" : ""}${r.pctDelta.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: r.newMargin != null && r.newMargin < 0 ? "#FF204E" : "var(--color-text-muted)" }}>
                        {r.newMargin != null ? `${r.newMargin.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setDocDrill({
                            type: r.sourceType === "bill" ? "bill" : "purchase-order",
                            id: r.sourceId,
                          })}
                          className="text-left hover:opacity-80"
                        >
                          <div style={{ color: "var(--color-text-secondary)" }}>{r.vendorName || "—"}</div>
                          <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                            <span className="uppercase mr-1" style={{ color: "var(--color-text-muted)" }}>{r.sourceType === "bill" ? "Bill" : "PO"}</span>
                            {r.sourceNumber ? `#${r.sourceNumber} · ` : ""}{fmtDate(r.sourceDate)}
                          </div>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 flex items-center gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          {data && data.rows.length > 0 && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {selected.size} selected · ${totalDelta.toFixed(2)} total absolute adjustment
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }}>
              Cancel
            </button>
            <button
              disabled={applying || !data || selected.size === 0}
              onClick={apply}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white disabled:opacity-50"
            >
              {applying ? "Correcting…" : `Auto-correct ${selected.size > 0 ? `(${selected.size})` : ""}`}
            </button>
          </div>
        </div>
      </div>

      {docDrill && (
        <DocumentDrawer
          type={docDrill.type}
          id={docDrill.id}
          onClose={() => setDocDrill(null)}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "danger" }) {
  const color = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : tone === "good" ? "#16A34A" : "var(--color-text-primary)";
  return (
    <div className="px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-sm font-semibold mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, tone, onClick, active }: { label: string; value: number | string; tone?: "good" | "warn" | "danger"; onClick?: () => void; active?: boolean }) {
  const color = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : tone === "good" ? "#16A34A" : "var(--color-text-primary)";
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`p-4 rounded-xl text-left transition-all w-full ${active ? "ring-2 ring-orange-500" : ""}`}
      style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{typeof value === "number" ? value.toLocaleString() : value}</p>
    </Tag>
  );
}

function FilterPill<V extends string>({ label, value, current, onClick }: { label: string; value: V; current: V; onClick: (v: V) => void }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
      style={{
        background: active ? "#f8971f" : "var(--color-surface-1)",
        color: active ? "white" : "var(--color-text-secondary)",
        border: "1px solid var(--color-border)",
      }}
    >
      {label}
    </button>
  );
}

function Th({ children, onClick, active, dir, className = "" }: { children: React.ReactNode; onClick?: () => void; active?: boolean; dir?: "asc" | "desc"; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide ${onClick ? "cursor-pointer select-none hover:opacity-80" : ""} ${className}`}
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
      {active && <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Trim modal
// ───────────────────────────────────────────────────────────────────────────
type TrimPreview = {
  window: { monthsBack: number };
  sources: { invoices: boolean; purchaseOrders: boolean; bills: boolean };
  total: number;
  currentTracked: number;
  currentUntracked: number;
  activeIdsInWindow: number;
  wouldStayTracked: number;
  wouldBecomeUntracked: number;
};

function TrimModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [monthsBack, setMonthsBack] = useState(24);
  const [includeInvoices, setIncludeInvoices] = useState(true);
  const [includePOs, setIncludePOs] = useState(true);
  const [includeBills, setIncludeBills] = useState(false);
  const [preview, setPreview] = useState<TrimPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    setLoading(true); setError(null); setPreview(null);
    try {
      const r = await fetch("/api/inventory/trim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthsBack,
          includeInvoices,
          includePurchaseOrders: includePOs,
          includeBills,
          dryRun: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Preview failed");
      setPreview(j);
    } catch (e: any) {
      setError(e?.message || "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [monthsBack, includeInvoices, includePOs, includeBills]);

  // Auto-preview when settings change
  useEffect(() => { runPreview(); }, [runPreview]);

  const apply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const r = await fetch("/api/inventory/trim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthsBack,
          includeInvoices,
          includePurchaseOrders: includePOs,
          includeBills,
          dryRun: false,
        }),
      });
      if (r.ok) onApplied();
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Trim inventory</h2>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Items not used in the selected time window will be marked <strong>untracked</strong> and hidden from the default view.
                Reversible — items aren&apos;t deleted, and you can mark them tracked again any time.
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--color-text-muted)" }}>✕</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>Time window</label>
            <div className="mt-2 flex gap-2">
              {[12, 18, 24, 36].map((m) => (
                <button
                  key={m}
                  onClick={() => setMonthsBack(m)}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{
                    background: monthsBack === m ? "#f8971f" : "var(--color-surface-2)",
                    color: monthsBack === m ? "white" : "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {m} mo
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>Count an item as active if it appears on…</label>
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-primary)" }}>
                <input type="checkbox" checked={includeInvoices} onChange={(e) => setIncludeInvoices(e.target.checked)} />
                a customer invoice (sold)
              </label>
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-primary)" }}>
                <input type="checkbox" checked={includePOs} onChange={(e) => setIncludePOs(e.target.checked)} />
                a purchase order (ordered from a vendor)
              </label>
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-primary)" }}>
                <input type="checkbox" checked={includeBills} onChange={(e) => setIncludeBills(e.target.checked)} />
                a vendor bill (paid for)
              </label>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            {loading && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Calculating…</p>}
            {error && <p className="text-sm" style={{ color: "#FF204E" }}>{error}</p>}
            {preview && !loading && (
              <div className="space-y-1.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <div className="flex justify-between">
                  <span>Items with activity in the last {preview.window.monthsBack} months</span>
                  <strong style={{ color: "var(--color-text-primary)" }}>{preview.activeIdsInWindow.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Will stay tracked</span>
                  <strong style={{ color: "#16A34A" }}>{preview.wouldStayTracked.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Will be marked untracked</span>
                  <strong style={{ color: "#F59E0B" }}>{preview.wouldBecomeUntracked.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between text-xs pt-1.5 mt-1.5" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <span>Currently tracked</span>
                  <span>{preview.currentTracked.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs" style={{ color: "var(--color-text-muted)" }}>
                  <span>Currently untracked</span>
                  <span>{preview.currentUntracked.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }}>
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!preview || applying}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white disabled:opacity-50"
          >
            {applying ? "Trimming…" : "Apply trim"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Detail drawer
// ───────────────────────────────────────────────────────────────────────────
function DetailDrawer({ itemId, onClose, onSaved }: { itemId: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/inventory/${itemId}`);
    if (r.ok) setData(await r.json());
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex" onClick={onClose}>
        <div className="ml-auto h-full w-full md:w-[640px]" style={{ background: "var(--color-surface-1)", borderLeft: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
          <div className="p-6 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
        </div>
      </div>
    );
  }

  const item = data.item;
  const cs = data.costSummary;
  const isRetired = (item as any).isTracked === false;

  const setField = (k: string, v: any) => setEditing((e) => ({ ...e, [k]: v }));
  const editValue = (k: keyof typeof item) => (k in editing ? editing[k] : (item as any)[k]);
  const dirty = Object.keys(editing).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/inventory/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (r.ok) {
        setEditing({});
        await load();
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  const applySuggestedCost = () => {
    if (cs.lastPaidCost != null) setField("cost", cs.lastPaidCost);
  };

  const toggleTracked = async () => {
    setSaving(true);
    try {
      await fetch(`/api/inventory/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTracked: isRetired }), // flip
      });
      await load();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div
        className="h-full w-full md:w-[720px] overflow-y-auto"
        style={{ background: "var(--color-surface-1)", borderLeft: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 p-5" style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-mono mb-1 flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
                <span>{item.sku || item.qbItemId || "—"}</span>
                {isRetired && (
                  <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)" }}>retired</span>
                )}
              </p>
              <h2 className="text-lg font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{item.name}</h2>
              {item.category && (
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{item.category}</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg" style={{ color: "var(--color-text-muted)" }}>✕</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {dirty && (
              <>
                <button disabled={saving} onClick={save} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-500 text-white disabled:opacity-50">
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button onClick={() => setEditing({})} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }}>
                  Discard
                </button>
              </>
            )}
            <button
              disabled={saving}
              onClick={toggleTracked}
              className="px-3 py-1.5 rounded-lg text-sm font-medium ml-auto disabled:opacity-50"
              style={{ background: "var(--color-surface-2)", color: isRetired ? "#16A34A" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
            >
              {isRetired ? "Restore to active" : "Retire item"}
            </button>
          </div>
        </div>

        {/* Cost & stock summary */}
        <Section title="Stock & Cost">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="On hand" value={editValue("quantityOnHand")} onChange={(v) => setField("quantityOnHand", v)} />
            <NumberField label="Reorder level" value={editValue("reorderLevel") ?? 0} onChange={(v) => setField("reorderLevel", v)} />
            <MoneyField label="Sale price" value={editValue("unitPrice")} onChange={(v) => setField("unitPrice", v)} />
            <MoneyField label="Current cost" value={editValue("cost")} onChange={(v) => setField("cost", v)} />
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Last paid" value={fmtMoney(cs.lastPaidCost)} hint={cs.lastPaidVendorName ? `${cs.lastPaidVendorName} · ${fmtDate(cs.lastPaidDate)}` : fmtDate(cs.lastPaidDate)} />
            <Stat label="Avg paid" value={fmtMoney(cs.avg12mCost)} />
            <Stat label="Margin" value={fmtPct(item.margin)} hint={item.margin != null && item.margin < 0 ? "losing money" : undefined} tone={item.margin != null && item.margin < 0 ? "danger" : undefined} />
            <Stat label="Min ever" value={fmtMoney(cs.minCostEver)} />
            <Stat label="Max ever" value={fmtMoney(cs.maxCostEver)} />
            <Stat label="Bills using" value={cs.billCount} hint={`${cs.invoiceCount} invoices`} />
          </div>

          {cs.lastPaidCost != null && Math.abs((Number(item.cost ?? 0) - cs.lastPaidCost)) / Math.max(cs.lastPaidCost, 0.01) > 0.05 && (
            <button
              onClick={applySuggestedCost}
              className="mt-3 px-3 py-2 rounded-lg text-xs font-medium"
              style={{ background: "rgba(255, 68, 0, 0.15)", color: "#eaa23f", border: "1px solid #f8971f" }}
            >
              Update current cost to match last paid: {fmtMoney(cs.lastPaidCost)}
            </button>
          )}
        </Section>

        <Section title="Vendor breakdown" hint="Last 24 months">
          {data.vendorBreakdown.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No bills found for this item.</p>
          ) : (
            <table className="w-full text-xs">
              <thead style={{ color: "var(--color-text-muted)" }}>
                <tr>
                  <th className="text-left py-1">Vendor</th>
                  <th className="text-right py-1">Bills</th>
                  <th className="text-right py-1">Avg</th>
                  <th className="text-right py-1">Range</th>
                  <th className="text-right py-1">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {data.vendorBreakdown.map((v, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td className="py-1.5" style={{ color: "var(--color-text-primary)" }}>{v.vendorName || "Unknown"}</td>
                    <td className="py-1.5 text-right" style={{ color: "var(--color-text-secondary)" }}>{v.timesPurchased}</td>
                    <td className="py-1.5 text-right" style={{ color: "var(--color-text-secondary)" }}>{fmtMoney(Number(v.avgCost))}</td>
                    <td className="py-1.5 text-right text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {fmtMoney(Number(v.minCost))} – {fmtMoney(Number(v.maxCost))}
                    </td>
                    <td className="py-1.5 text-right" style={{ color: "var(--color-text-muted)" }}>{fmtDate(v.lastPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {data.openPOs.length > 0 && (
          <Section title="On order" hint={`${data.openPOs.length} open PO${data.openPOs.length === 1 ? "" : "s"}`}>
            <div className="space-y-1.5">
              {data.openPOs.map((po) => (
                <button
                  key={po.poId}
                  onClick={() => setDocDrill({ type: "purchase-order", id: po.poId })}
                  className="w-full text-left text-xs flex items-center justify-between p-2 rounded hover:opacity-80 transition-opacity"
                  style={{ background: "var(--color-surface-2)" }}
                >
                  <div>
                    <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>{po.poNumber}</span>
                    <span className="mx-2" style={{ color: "var(--color-text-muted)" }}>·</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>{po.vendorName || "—"}</span>
                  </div>
                  <div className="flex gap-3" style={{ color: "var(--color-text-muted)" }}>
                    <span>qty {Number(po.qty)}</span>
                    <span>{fmtMoney(Number(po.unitCost))}</span>
                    <span>exp. {fmtDate(po.expectedDate)}</span>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Recent bills" hint={`${data.billHistory.length} shown · click to open`}>
          {data.billHistory.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No bills with this item yet.</p>
          ) : (
            <div className="space-y-1.5">
              {data.billHistory.slice(0, 15).map((b, i) => (
                <button
                  key={i}
                  onClick={() => setDocDrill({ type: "bill", id: b.billId })}
                  className="w-full text-left text-xs flex items-center justify-between p-2 rounded hover:opacity-80 transition-opacity"
                  style={{ background: "var(--color-surface-2)" }}
                >
                  <div className="min-w-0">
                    <span style={{ color: "var(--color-text-primary)" }}>{b.vendorName || "—"}</span>
                    <span className="mx-2" style={{ color: "var(--color-text-muted)" }}>·</span>
                    <span style={{ color: "var(--color-text-muted)" }}>{fmtDate(b.issueDate)}</span>
                    {b.billNumber && <span className="ml-2 font-mono" style={{ color: "var(--color-text-muted)" }}>#{b.billNumber}</span>}
                  </div>
                  <div className="flex gap-3 shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                    <span>qty {Number(b.qty)}</span>
                    <span className="font-medium">{fmtMoney(Number(b.unitCost))}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Recent sales" hint={`${data.salesHistory.length} shown · click to open`}>
          {data.salesHistory.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No invoices with this item yet.</p>
          ) : (
            <div className="space-y-1.5">
              {data.salesHistory.slice(0, 15).map((s, i) => (
                <button
                  key={i}
                  onClick={() => setDocDrill({ type: "invoice", id: s.invoiceId })}
                  className="w-full text-left text-xs flex items-center justify-between p-2 rounded hover:opacity-80 transition-opacity"
                  style={{ background: "var(--color-surface-2)" }}
                >
                  <div className="min-w-0">
                    <span style={{ color: "var(--color-text-primary)" }}>{s.customerName || "—"}</span>
                    <span className="mx-2" style={{ color: "var(--color-text-muted)" }}>·</span>
                    <span style={{ color: "var(--color-text-muted)" }}>{fmtDate(s.issueDate)}</span>
                    {s.invoiceNumber && <span className="ml-2 font-mono" style={{ color: "var(--color-text-muted)" }}>#{s.invoiceNumber}</span>}
                  </div>
                  <div className="flex gap-3 shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                    <span>qty {Number(s.qty)}</span>
                    <span className="font-medium">{fmtMoney(Number(s.unitPrice))}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Details">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Name" value={editValue("name") ?? ""} onChange={(v) => setField("name", v)} />
            <TextField label="SKU" value={editValue("sku") ?? ""} onChange={(v) => setField("sku", v)} />
            <TextField label="Category" value={editValue("category") ?? ""} onChange={(v) => setField("category", v)} />
            <TextField label="Location" value={editValue("location") ?? ""} onChange={(v) => setField("location", v)} />
          </div>
          <TextAreaField label="Description" value={editValue("description") ?? ""} onChange={(v) => setField("description", v)} />
          <div className="mt-3">
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <input
                type="checkbox"
                checked={!!editValue("isActive")}
                onChange={(e) => setField("isActive", e.target.checked)}
              />
              Active
            </label>
          </div>
        </Section>

        <div className="h-12" />
      </div>

      {docDrill && (
        <DocumentDrawer
          type={docDrill.type}
          id={docDrill.id}
          onClose={() => setDocDrill(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Drawer subcomponents
// ───────────────────────────────────────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>{title}</h3>
        {hint && <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "danger" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: tone === "danger" ? "#FF204E" : "var(--color-text-primary)" }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</label>
      <input
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
        style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
      />
    </div>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</label>
      <div className="relative mt-0.5">
        <span className="absolute left-2 top-1.5 text-sm" style={{ color: "var(--color-text-muted)" }}>$</span>
        <input
          type="number"
          step="0.01"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full pl-6 pr-2 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
        />
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
        style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-3">
      <label className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
        style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
      />
    </div>
  );
}
