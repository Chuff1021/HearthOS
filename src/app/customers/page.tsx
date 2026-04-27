"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { colorFromName, initialsFromName } from "@/lib/avatar";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
type CustomerRow = {
  id: string;
  qbCustomerId: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  isActive: boolean;
  balance: number;
  invoiceCount: number;
  openInvoiceCount: number;
  paymentCount: number;
  totalRevenue: number;
  lastActivity: string | null;
};

type ListResponse = {
  items: CustomerRow[];
  totals: { customers: number; balance: number; openInvoices: number; revenue: number };
  moneyBar: {
    totalDue: number;
    openInvoiceCount: number;
    overdueAmount: number;
    overdueCount: number;
    revenueYTD: number;
    ytdInvoiceCount: number;
  };
};

type FilterKey = "active" | "all" | "with_balance" | "inactive";
type SortKey = "name" | "balance" | "revenue" | "activity";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const relTime = (s: string | null | undefined) => {
  if (!s) return "Never";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold flex-shrink-0"
      style={{
        background: colorFromName(name),
        color: "white",
        width: size,
        height: size,
        fontSize: size * 0.4,
        letterSpacing: 0.5,
      }}
    >
      {initialsFromName(name)}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersListInner />
    </Suspense>
  );
}

function CustomersListInner() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [sort, setSort] = useState<SortKey>("balance");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ q: debounced, filter, sort, dir });
    try {
      const r = await fetch(`/api/customers/center?${params}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [debounced, filter, sort, dir]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const sortFor = (col: SortKey) => () => {
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir(col === "name" ? "asc" : "desc"); }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Customers</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Track jobs, A/R, and lifetime value across every customer.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await fetch("/api/quickbooks/sync/customers", { method: "POST" });
                    fetchList();
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                >
                  Sync from QuickBooks
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white"
                  title="Coming soon"
                  disabled
                  style={{ opacity: 0.6, cursor: "not-allowed" }}
                >
                  + New customer
                </button>
              </div>
            </div>

            {/* Money bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MoneyTile
                label="Open A/R"
                value={fmtMoney(data?.moneyBar.totalDue ?? 0)}
                hint={`${data?.moneyBar.openInvoiceCount ?? 0} open invoices`}
                tone={(data?.moneyBar.totalDue ?? 0) > 0 ? "warn" : undefined}
                onClick={() => setFilter("with_balance")}
              />
              <MoneyTile
                label="Overdue"
                value={fmtMoney(data?.moneyBar.overdueAmount ?? 0)}
                hint={`${data?.moneyBar.overdueCount ?? 0} invoices past due`}
                tone={(data?.moneyBar.overdueCount ?? 0) > 0 ? "danger" : "good"}
              />
              <MoneyTile
                label="Revenue YTD"
                value={fmtMoney(data?.moneyBar.revenueYTD ?? 0)}
                hint={`${data?.moneyBar.ytdInvoiceCount ?? 0} invoices this year`}
                tone="good"
              />
              <MoneyTile
                label="Customers"
                value={(data?.totals.customers ?? 0).toLocaleString()}
                hint={`${data?.totals.openInvoices ?? 0} with open invoices`}
                tone="brand"
              />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[280px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--color-text-muted)" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search by name, company, or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                />
              </div>
              <Pill label="Active" v="active" cur={filter} on={setFilter} />
              <Pill label="Owe money" v="with_balance" cur={filter} on={setFilter} />
              <Pill label="All" v="all" cur={filter} on={setFilter} />
              <Pill label="Inactive" v="inactive" cur={filter} on={setFilter} />
            </div>

            {/* Customer table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead style={{ background: "var(--color-surface-2)" }}>
                    <tr>
                      <Th onClick={sortFor("name")} active={sort === "name"} dir={dir}>Customer</Th>
                      <Th>Contact</Th>
                      <Th className="text-center">Open</Th>
                      <Th onClick={sortFor("revenue")} active={sort === "revenue"} dir={dir} className="text-right">Total revenue</Th>
                      <Th onClick={sortFor("balance")} active={sort === "balance"} dir={dir} className="text-right">A/R balance</Th>
                      <Th onClick={sortFor("activity")} active={sort === "activity"} dir={dir} className="text-right">Last activity</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !data && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading customers…</td></tr>
                    )}
                    {!loading && data?.items.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No customers match.</td></tr>
                    )}
                    {data?.items.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/customers/${c.id}`)}
                        className="cursor-pointer transition-colors"
                        style={{ borderTop: "1px solid var(--color-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={c.displayName} />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                                <span className="truncate">{c.displayName}</span>
                                {!c.isActive && <span className="text-[9px] uppercase tracking-wide opacity-60">inactive</span>}
                              </div>
                              {c.companyName && c.companyName !== c.displayName && (
                                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{c.companyName}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {c.email && <div className="truncate max-w-[220px]">{c.email}</div>}
                          {c.phone && <div style={{ color: "var(--color-text-muted)" }}>{c.phone}</div>}
                          {!c.email && !c.phone && <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {c.openInvoiceCount > 0 ? (
                            <span className="text-sm font-medium" style={{ color: "#F59E0B" }}>{c.openInvoiceCount}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm" style={{ color: "var(--color-text-primary)" }}>
                          {c.totalRevenue > 0 ? fmtMoney(c.totalRevenue) : <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.balance > 0 ? (
                            <span className="text-sm font-semibold" style={{ color: "#F59E0B" }}>{fmtMoney(c.balance)}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>$0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {relTime(c.lastActivity)}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-muted)" }}>→</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && (
                <div className="px-4 py-2.5 text-xs" style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                  Showing <strong>{data.items.length.toLocaleString()}</strong> customers · {fmtMoney(data.totals.balance)} A/R · {fmtMoney(data.totals.revenue)} lifetime revenue
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function MoneyTile({ label, value, hint, tone, onClick }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "danger" | "brand"; onClick?: () => void }) {
  const accent =
    tone === "danger" ? "#FF204E" :
    tone === "warn" ? "#F59E0B" :
    tone === "good" ? "#16A34A" :
    tone === "brand" ? "#0EA5E9" :
    "var(--color-text-primary)";
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`p-4 rounded-xl text-left w-full ${onClick ? "hover:opacity-90 transition-opacity" : ""}`}
      style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderLeft: `3px solid ${accent}` }}
    >
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: accent }}>{value}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
    </Tag>
  );
}

function Pill<V extends string>({ label, v, cur, on }: { label: string; v: V; cur: V; on: (v: V) => void }) {
  const active = cur === v;
  return (
    <button
      onClick={() => on(v)}
      className="px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
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

function Th({ children, onClick, active, dir, className = "" }: { children?: React.ReactNode; onClick?: () => void; active?: boolean; dir?: "asc" | "desc"; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide ${onClick ? "cursor-pointer select-none hover:opacity-80" : ""} ${className}`}
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
      {active && <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}
