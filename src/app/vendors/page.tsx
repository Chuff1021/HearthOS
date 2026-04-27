"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
type VendorRow = {
  id: string;
  qbVendorId: string | null;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  is1099: boolean;
  isActive: boolean;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  accountNumber: string | null;
  paymentTerms: string | null;
  balance: number;
  billCount: number;
  openBillCount: number;
  poCount: number;
  openPOCount: number;
  lastActivity: string | null;
};

type ListResponse = {
  items: VendorRow[];
  totals: { vendors: number; balance: number; openBills: number; openPOs: number };
  moneyBar: {
    totalOwed: number;
    openBillCount: number;
    overdueAmount: number;
    overdueCount: number;
    openPOValue: number;
    openPOCount: number;
    ytdSpend: number;
    ytdBillCount: number;
  };
};

type FilterKey = "active" | "all" | "with_balance" | "1099" | "inactive";
type SortKey = "name" | "balance" | "activity";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtMoneyShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

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

// Avatar helpers moved to @/lib/avatar so customer + vendor pages share them.
import { colorFromName, initialsFromName } from "@/lib/avatar";

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const bg = colorFromName(name);
  const initials = initialsFromName(name);
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold flex-shrink-0"
      style={{
        background: bg,
        color: "white",
        width: size,
        height: size,
        fontSize: size * 0.4,
        letterSpacing: 0.5,
      }}
    >
      {initials}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────
export default function VendorsPage() {
  return (
    <Suspense fallback={null}>
      <VendorsListInner />
    </Suspense>
  );
}

function VendorsListInner() {
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
      const r = await fetch(`/api/vendors?${params}`);
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
            {/* Page header */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Vendors</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Manage suppliers, track bills and POs, see who you owe.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await fetch("/api/quickbooks/sync/vendors", { method: "POST" });
                    fetchList();
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                >
                  Sync from QuickBooks
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                  title="Coming soon"
                  disabled
                  style={{ opacity: 0.6, cursor: "not-allowed" }}
                >
                  + New vendor
                </button>
              </div>
            </div>

            {/* Money bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MoneyTile
                label="Total to pay"
                value={fmtMoney(data?.moneyBar.totalOwed ?? 0)}
                hint={`${data?.moneyBar.openBillCount ?? 0} open bills`}
                tone={(data?.moneyBar.totalOwed ?? 0) > 0 ? "warn" : undefined}
                onClick={() => setFilter("with_balance")}
              />
              <MoneyTile
                label="Overdue"
                value={fmtMoney(data?.moneyBar.overdueAmount ?? 0)}
                hint={`${data?.moneyBar.overdueCount ?? 0} bills past due`}
                tone={(data?.moneyBar.overdueCount ?? 0) > 0 ? "danger" : "good"}
              />
              <MoneyTile
                label="Open POs"
                value={fmtMoney(data?.moneyBar.openPOValue ?? 0)}
                hint={`${data?.moneyBar.openPOCount ?? 0} not yet received`}
                tone="brand"
              />
              <MoneyTile
                label="Spent YTD"
                value={fmtMoney(data?.moneyBar.ytdSpend ?? 0)}
                hint={`${data?.moneyBar.ytdBillCount ?? 0} bills this year`}
              />
            </div>

            {/* Toolbar: search + filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[280px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--color-text-muted)" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search vendors by name, company, or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                />
              </div>
              <Pill label="Active" v="active" cur={filter} on={setFilter} />
              <Pill label="Owed money" v="with_balance" cur={filter} on={setFilter} />
              <Pill label="1099" v="1099" cur={filter} on={setFilter} />
              <Pill label="All" v="all" cur={filter} on={setFilter} />
              <Pill label="Inactive" v="inactive" cur={filter} on={setFilter} />
            </div>

            {/* Vendor table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead style={{ background: "var(--color-surface-2)" }}>
                    <tr>
                      <Th onClick={sortFor("name")} active={sort === "name"} dir={dir}>Vendor</Th>
                      <Th>Contact</Th>
                      <Th className="text-center">Open bills</Th>
                      <Th className="text-center">Open POs</Th>
                      <Th onClick={sortFor("balance")} active={sort === "balance"} dir={dir} className="text-right">Balance owed</Th>
                      <Th onClick={sortFor("activity")} active={sort === "activity"} dir={dir} className="text-right">Last activity</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !data && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading vendors…</td></tr>
                    )}
                    {!loading && data?.items.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No vendors match.</td></tr>
                    )}
                    {data?.items.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() => router.push(`/vendors/${v.id}`)}
                        className="cursor-pointer transition-colors"
                        style={{ borderTop: "1px solid var(--color-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={v.displayName} />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                                <span className="truncate">{v.displayName}</span>
                                {v.is1099 && <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.15)", color: "#A855F7" }}>1099</span>}
                                {!v.isActive && <span className="text-[9px] uppercase tracking-wide opacity-60">inactive</span>}
                              </div>
                              {v.companyName && v.companyName !== v.displayName && (
                                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{v.companyName}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {v.email && <div className="truncate max-w-[200px]">{v.email}</div>}
                          {v.phone && <div style={{ color: "var(--color-text-muted)" }}>{v.phone}</div>}
                          {!v.email && !v.phone && <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {v.openBillCount > 0 ? (
                            <span className="text-sm font-medium" style={{ color: "#F59E0B" }}>{v.openBillCount}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {v.openPOCount > 0 ? (
                            <span className="text-sm font-medium" style={{ color: "#0EA5E9" }}>{v.openPOCount}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {v.balance > 0 ? (
                            <span className="text-sm font-semibold" style={{ color: "#F59E0B" }}>{fmtMoney(v.balance)}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>$0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {relTime(v.lastActivity)}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-muted)" }}>
                          <span className="inline-block transition-transform">→</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && (
                <div className="px-4 py-2.5 text-xs" style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                  Showing <strong>{data.items.length.toLocaleString()}</strong> vendors · {fmtMoney(data.totals.balance)} total balance · {data.totals.openBills} open bills · {data.totals.openPOs} open POs
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────
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
      style={{
        background: "var(--color-surface-1)",
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${accent}`,
      }}
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
