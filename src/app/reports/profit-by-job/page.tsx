"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DocumentDrawer, { type DocumentType } from "@/components/documents/DocumentDrawer";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
type Row = {
  id: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  status: string | null;
  customerId: string | null;
  customerName: string | null;
  revenue: number;
  tax: number;
  billed: number;
  cogs: number;
  billable: number;
  profit: number;
  margin: number | null;
  balance: number;
};

type ListResponse = {
  items: Row[];
  page: number;
  limit: number;
  totalCount: number;
  windowStats: {
    invoiceCount: number;
    revenue: number;
    tax: number;
    billed: number;
    cogs: number;
    billable: number;
    totalCost: number;
    profit: number;
    margin: number | null;
    avgMarginPerInvoice: number | null;
    unprofitableCount: number;
    balance: number;
    bestProfit: number | null;
    worstProfit: number | null;
  };
};

type DetailResponse = {
  invoice: any;
  customer: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  lines: Array<{
    id: string;
    order: number;
    description: string | null;
    qbItemId: string | null;
    itemName: string | null;
    itemSku: string | null;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    total: number;
    cost: number;
    profit: number;
    margin: number | null;
    isTaxPassthrough?: boolean;
  }>;
  billExpenses: Array<{
    billId: string; billNumber: string | null; issueDate: string | null;
    vendorId: string | null; vendorName: string | null;
    description: string | null; amount: number;
    qbItemId: string | null; lineId: string;
  }>;
  summary: {
    revenue: number;
    taxPassthrough?: number;
    tax: number;
    billed: number;
    cogs: number;
    billable: number;
    totalCost: number;
    profit: number;
    margin: number | null;
    balance: number;
  };
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number | null | undefined, dash = "—") =>
  n == null || isNaN(Number(n)) ? dash : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtSignedMoney = (n: number | null | undefined) => {
  if (n == null || isNaN(Number(n))) return "—";
  const v = Number(n);
  return v < 0 ? `-$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmtMoney(v);
};

const fmtPct = (n: number | null) => n == null || isNaN(n) ? "—" : `${n.toFixed(1)}%`;

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const profitColor = (p: number) => (p < 0 ? "#FF204E" : p > 0 ? "#16A34A" : "var(--color-text-muted)");
const marginColor = (m: number | null) => {
  if (m == null) return "var(--color-text-muted)";
  if (m < 0) return "#FF204E";
  if (m < 15) return "#F59E0B";
  return "#16A34A";
};

// Date range presets
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

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────
type SortKey = "date" | "revenue" | "total" | "number";
type ProfitFilter = "all" | "unprofitable" | "negativeMargin";

export default function ProfitByJobPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [preset, setPreset] = useState("365");
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const limit = 100;
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const range = presetRange(preset) || { since: "", until: "" };
    const params = new URLSearchParams({
      q: debounced,
      since: range.since,
      until: range.until,
      status: statusFilter,
      profitFilter,
      sort,
      dir,
      page: String(page),
      limit: String(limit),
    });
    try {
      const r = await fetch(`/api/reports/profit-by-job?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setData(j);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [debounced, preset, statusFilter, profitFilter, sort, dir, page]);

  useEffect(() => { setPage(1); }, [debounced, preset, statusFilter, profitFilter, sort, dir]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.limit)) : 1;
  const sortFor = (col: SortKey) => () => {
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir(col === "number" ? "asc" : "desc"); }
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
                <Link href="/reports" className="text-xs" style={{ color: "var(--color-text-muted)" }}>← Reports</Link>
                <h1 className="text-xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>Profit by Job</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Per-invoice P&amp;L. Revenue from line items, cost from inventory + customer-tagged vendor bills.
                </p>
              </div>
            </div>

            {/* Filter / control row */}
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                placeholder="Search by invoice #, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[280px] px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              />
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              >
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last 365 days</option>
                <option value="ytd">Year to date</option>
                <option value="all">All time</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              >
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="sent">Sent</option>
                <option value="draft">Draft</option>
                <option value="void">Void</option>
              </select>
              <ProfitPill label="All jobs" value="all" current={profitFilter} onClick={setProfitFilter} />
              <ProfitPill label="Unprofitable" value="unprofitable" current={profitFilter} onClick={setProfitFilter} />
              <ProfitPill label="Negative margin" value="negativeMargin" current={profitFilter} onClick={setProfitFilter} />
            </div>

            {/* Window stats banner — totals across the WHOLE filter range, not just the page */}
            <WindowStatsBanner
              data={data}
              preset={preset}
              loading={loading}
            />

            {/* Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--color-surface-2)" }}>
                    <tr>
                      <Th onClick={sortFor("number")} active={sort === "number"} dir={dir}>Invoice</Th>
                      <Th onClick={sortFor("date")} active={sort === "date"} dir={dir}>Date</Th>
                      <Th>Customer</Th>
                      <Th>Status</Th>
                      <Th onClick={sortFor("revenue")} active={sort === "revenue"} dir={dir} className="text-right">Revenue</Th>
                      <Th className="text-right">Material</Th>
                      <Th className="text-right">Other</Th>
                      <Th className="text-right">Profit</Th>
                      <Th className="text-right">Margin</Th>
                      <Th className="text-right">Balance</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className="cursor-pointer transition-colors"
                        style={{ borderTop: "1px solid var(--color-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {r.invoiceNumber || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtDate(r.issueDate)}</td>
                        <td className="px-3 py-2" style={{ color: "var(--color-text-primary)" }}>{r.customerName || "—"}</td>
                        <td className="px-3 py-2 text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>{r.status || "—"}</td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(r.revenue)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-secondary)" }}>{fmtMoney(r.cogs)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-secondary)" }}>{fmtMoney(r.billable)}</td>
                        <td className="px-3 py-2 text-right font-medium" style={{ color: profitColor(r.profit) }}>{fmtSignedMoney(r.profit)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: marginColor(r.margin) }}>{fmtPct(r.margin)}</td>
                        <td className="px-3 py-2 text-right text-xs" style={{ color: r.balance > 0 ? "#F59E0B" : "var(--color-text-muted)" }}>
                          {r.balance > 0 ? fmtMoney(r.balance) : "—"}
                        </td>
                      </tr>
                    ))}
                    {!loading && data?.items.length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No jobs match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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

            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              <strong>Notes:</strong> Material cost is computed from the current inventory cost × line quantity.
              Other costs include vendor bills tagged to the same customer with bill date in [invoice date − 30d, invoice date + 60d].
              Labor cost isn&apos;t yet attributed to specific jobs (time entries don&apos;t link to invoices). When job-level time tracking is wired up, labor will roll into Other.
            </p>
          </div>
        </main>
      </div>

      {selectedId && (
        <ProfitDetailDrawer
          jobId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Window stats banner
// ───────────────────────────────────────────────────────────────────────────
const presetLabel = (p: string) => ({
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 365 days",
  ytd: "Year to date",
  all: "All time",
}[p] || "Window");

function WindowStatsBanner({ data, preset, loading }: { data: ListResponse | null; preset: string; loading: boolean }) {
  const w = data?.windowStats;
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            P&amp;L · {presetLabel(preset)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {w
              ? `${w.invoiceCount.toLocaleString()} invoices · ${w.unprofitableCount} unprofitable`
              : loading ? "Calculating…" : "—"}
          </p>
        </div>
        {w && w.balance > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Open A/R</p>
            <p className="text-sm font-semibold" style={{ color: "#F59E0B" }}>{fmtMoney(w.balance)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <BannerStat label="Revenue" value={fmtMoney(w?.revenue ?? 0)} />
        <BannerStat label="Material cost" value={fmtMoney(w?.cogs ?? 0)} tone="warn" />
        <BannerStat label="Other costs" value={fmtMoney(w?.billable ?? 0)} tone="warn" />
        <BannerStat
          label="Profit"
          value={fmtSignedMoney(w?.profit ?? 0)}
          tone={(w?.profit ?? 0) < 0 ? "danger" : "good"}
          big
        />
        <BannerStat
          label="Margin"
          value={fmtPct(w?.margin ?? null)}
          hint={w?.avgMarginPerInvoice != null ? `Avg ${fmtPct(w.avgMarginPerInvoice)} per job` : undefined}
          tone={
            w?.margin == null ? undefined : w.margin < 0 ? "danger" : w.margin < 15 ? "warn" : "good"
          }
        />
      </div>
    </div>
  );
}

function BannerStat({ label, value, hint, tone, big }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "danger"; big?: boolean }) {
  const color = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : tone === "good" ? "#16A34A" : "var(--color-text-primary)";
  return (
    <div className="p-3 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className={(big ? "text-2xl" : "text-xl") + " font-bold mt-0.5"} style={{ color }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────
function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "danger" }) {
  const color = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : tone === "good" ? "#16A34A" : "var(--color-text-primary)";
  return (
    <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function ProfitPill({ label, value, current, onClick }: { label: string; value: ProfitFilter; current: ProfitFilter; onClick: (v: ProfitFilter) => void }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className="px-3 py-2 rounded-lg text-xs font-medium"
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
// Detail drawer — full P&L for one job/invoice
// ───────────────────────────────────────────────────────────────────────────
function ProfitDetailDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    fetch(`/api/reports/profit-by-job/${jobId}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => ok ? setData(j) : setError(j.error || "Failed"))
      .catch((e) => setError(e?.message || "Failed"));
  }, [jobId]);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex" onClick={onClose}>
        <div className="flex-1 bg-black/40" />
        <div className="h-full w-full md:w-[760px] p-5" style={{ background: "var(--color-surface-1)", borderLeft: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
          <p className="text-sm" style={{ color: "#FF204E" }}>Failed to load: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div
        className="h-full w-full md:w-[760px] overflow-y-auto"
        style={{ background: "var(--color-surface-1)", borderLeft: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {!data && <div className="p-6 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>}
        {data && (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 p-5" style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono mb-1" style={{ color: "var(--color-text-muted)" }}>
                    Invoice #{data.invoice.invoiceNumber || data.invoice.id}
                    {data.invoice.status && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase" style={{ background: "var(--color-surface-2)" }}>
                        {data.invoice.status}
                      </span>
                    )}
                  </p>
                  <h2 className="text-lg font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                    {data.customer?.name || "—"}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{fmtDate(data.invoice.issueDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDocDrill({ type: "invoice", id: jobId })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                  >
                    View invoice
                  </button>
                  <button onClick={onClose} className="p-2 rounded-lg" style={{ color: "var(--color-text-muted)" }}>✕</button>
                </div>
              </div>

              {/* P&L summary */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <BigStat label="Revenue" value={fmtMoney(data.summary.revenue)} />
                <BigStat label="Total cost" value={fmtMoney(data.summary.totalCost)} tone="warn" />
                <BigStat
                  label="Profit"
                  value={fmtSignedMoney(data.summary.profit)}
                  hint={data.summary.margin != null ? `${fmtPct(data.summary.margin)} margin` : undefined}
                  tone={data.summary.profit < 0 ? "danger" : "good"}
                />
              </div>
            </div>

            {/* Revenue / line items */}
            <div className="p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-secondary)" }}>
                Revenue + line cost
              </h3>
              {data.lines.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No line items.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead style={{ color: "var(--color-text-muted)" }}>
                    <tr>
                      <th className="text-left py-1 pr-3">Item</th>
                      <th className="text-right py-1 px-1">Qty</th>
                      <th className="text-right py-1 px-1">Sale</th>
                      <th className="text-right py-1 px-1">Cost</th>
                      <th className="text-right py-1 px-1">Total</th>
                      <th className="text-right py-1 px-1">Profit</th>
                      <th className="text-right py-1 pl-1">M%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td className="py-1.5 pr-3">
                          <div style={{ color: "var(--color-text-primary)" }}>
                            {l.description || l.itemName || "—"}
                            {l.isTaxPassthrough && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                                tax pass-through
                              </span>
                            )}
                          </div>
                          {l.itemSku && <div className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>{l.itemSku}</div>}
                        </td>
                        <td className="py-1.5 px-1 text-right" style={{ color: "var(--color-text-secondary)" }}>{l.quantity}</td>
                        <td className="py-1.5 px-1 text-right" style={{ color: "var(--color-text-secondary)" }}>{fmtMoney(l.unitPrice)}</td>
                        <td className="py-1.5 px-1 text-right" style={{ color: "var(--color-text-secondary)" }}>{l.isTaxPassthrough ? "—" : (l.unitCost > 0 ? fmtMoney(l.unitCost) : "—")}</td>
                        <td className="py-1.5 px-1 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(l.total)}</td>
                        <td className="py-1.5 px-1 text-right font-medium" style={{ color: l.isTaxPassthrough ? "var(--color-text-muted)" : profitColor(l.profit) }}>{l.isTaxPassthrough ? "—" : fmtSignedMoney(l.profit)}</td>
                        <td className="py-1.5 pl-1 text-right" style={{ color: l.isTaxPassthrough ? "var(--color-text-muted)" : marginColor(l.margin) }}>{l.isTaxPassthrough ? "—" : fmtPct(l.margin)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid var(--color-border)" }}>
                      <td className="py-2 pr-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>Subtotal</td>
                      <td colSpan={3}></td>
                      <td className="py-2 px-1 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(data.summary.revenue + (data.summary.taxPassthrough ?? 0))}</td>
                      <td className="py-2 px-1 text-right font-semibold" style={{ color: profitColor(data.summary.revenue - data.summary.cogs) }}>
                        {fmtSignedMoney(data.summary.revenue - data.summary.cogs)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Other expenses (billable bills) */}
            <div className="p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>Other expenses</h3>
                <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  {data.billExpenses.length} bill line{data.billExpenses.length === 1 ? "" : "s"} attributed to this customer near the invoice date
                </span>
              </div>
              {data.billExpenses.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No customer-tagged vendor bills in this window.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.billExpenses.map((b) => (
                    <button
                      key={b.lineId}
                      onClick={() => setDocDrill({ type: "bill", id: b.billId })}
                      className="w-full text-left text-xs flex items-center justify-between p-2 rounded hover:opacity-80"
                      style={{ background: "var(--color-surface-2)" }}
                    >
                      <div className="min-w-0">
                        <div style={{ color: "var(--color-text-primary)" }}>{b.vendorName || "—"} <span style={{ color: "var(--color-text-muted)" }}>· {b.description || "expense"}</span></div>
                        <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                          BILL {b.billNumber ? `#${b.billNumber} · ` : ""}{fmtDate(b.issueDate)}
                        </div>
                      </div>
                      <span className="font-medium" style={{ color: "#F59E0B" }}>{fmtMoney(b.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Final P&L summary */}
            <div className="p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-secondary)" }}>P&amp;L summary</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1.5" style={{ color: "var(--color-text-secondary)" }}>Revenue (line totals)</td>
                    <td className="py-1.5 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(data.summary.revenue)}</td>
                  </tr>
                  {(data.summary.taxPassthrough ?? 0) > 0 && (
                    <tr>
                      <td className="py-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>+ Tax pass-through (line items)</td>
                      <td className="py-1.5 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtMoney(data.summary.taxPassthrough)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>+ Tax (informational)</td>
                    <td className="py-1.5 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtMoney(data.summary.tax)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>= Total billed</td>
                    <td className="py-1.5 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtMoney(data.summary.billed)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5" style={{ color: "var(--color-text-secondary)" }}>− Material cost (COGS)</td>
                    <td className="py-1.5 text-right" style={{ color: "#F59E0B" }}>{fmtMoney(data.summary.cogs)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-1.5" style={{ color: "var(--color-text-secondary)" }}>− Other expenses (bills)</td>
                    <td className="py-1.5 text-right" style={{ color: "#F59E0B" }}>{fmtMoney(data.summary.billable)}</td>
                  </tr>
                  <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                    <td className="py-2 font-semibold" style={{ color: "var(--color-text-primary)" }}>Profit</td>
                    <td className="py-2 text-right font-bold text-lg" style={{ color: profitColor(data.summary.profit) }}>
                      {fmtSignedMoney(data.summary.profit)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5" style={{ color: "var(--color-text-secondary)" }}>Margin</td>
                    <td className="py-1.5 text-right" style={{ color: marginColor(data.summary.margin) }}>{fmtPct(data.summary.margin)}</td>
                  </tr>
                  {data.summary.balance > 0 && (
                    <tr>
                      <td className="py-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>Open balance</td>
                      <td className="py-1.5 text-right text-xs" style={{ color: "#F59E0B" }}>{fmtMoney(data.summary.balance)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="h-12" />
          </>
        )}

        {docDrill && (
          <DocumentDrawer
            type={docDrill.type}
            id={docDrill.id}
            onClose={() => setDocDrill(null)}
          />
        )}
      </div>
    </div>
  );
}

function BigStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "danger" }) {
  const color = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : tone === "good" ? "#16A34A" : "var(--color-text-primary)";
  return (
    <div className="p-3 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
    </div>
  );
}
