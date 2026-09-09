"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, Plus, RefreshCw, Search } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import CreateCustomerDialog from "@/components/customers/CreateCustomerDialog";
import OperationsStyles from "@/components/scheduling/OperationsStyles";
import { colorFromName, initialsFromName } from "@/lib/avatar";
import { syncQuickBooksEntity } from "@/lib/quickbooks/browser-sync";

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
  phoneAlt: string | null;
  address: { line1: string; line2: string; city: string; state: string; zip: string };
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
const PAGE_SIZE = 50;

function filterFromQuery(value: string | null): FilterKey {
  return value === "active" || value === "inactive" || value === "all" || value === "with_balance" ? value : "active";
}

function addressLabel(address: CustomerRow["address"]) {
  return [address?.line1, address?.line2, [address?.city, address?.state, address?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

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
        letterSpacing: 0,
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
  const urlFilter = useSearchParams().get("filter");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [filter, setFilter] = useState<FilterKey>(filterFromQuery(urlFilter));
  const [sort, setSort] = useState<SortKey>("balance");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    setFilter(filterFromQuery(urlFilter));
  }, [urlFilter]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ q: debounced, filter, sort, dir });
    void (async () => {
      try {
        const r = await fetch(`/api/customers/center?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!r.ok) throw new Error("Customer request failed");
        const next: ListResponse = await r.json();
        if (!Array.isArray(next?.items) || !next.totals || !next.moneyBar) throw new Error("Invalid customer response");
        if (!controller.signal.aborted) {
          setData(next);
          setVisibleCount(PAGE_SIZE);
        }
      } catch {
        if (!controller.signal.aborted) setLoadError("Could not load customers.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debounced, filter, sort, dir, refresh]);

  const syncCustomers = async () => {
    setSyncing(true);
    setSyncError(false);
    setSyncMessage("Starting customer sync...");
    try {
      const result = await syncQuickBooksEntity("customers", (progress) => {
        setSyncMessage(`Importing customers: ${progress.fetched.toLocaleString()}`);
      });
      setSyncMessage(`${result.persisted.toLocaleString()} customers synced`);
      setRefresh((value) => value + 1);
    } catch (error) {
      setSyncError(true);
      setSyncMessage(error instanceof Error ? error.message : "Customer sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const sortFor = (col: SortKey) => () => {
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir(col === "name" ? "asc" : "desc"); }
  };
  const visibleCustomers = data?.items.slice(0, visibleCount) ?? [];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="ops-production flex-1 overflow-y-auto" style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
          <OperationsStyles />
          <div className="max-w-[1600px] mx-auto p-3 sm:px-5 sm:pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Customers</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CreateCustomerDialog onCreated={() => setRefresh((value) => value + 1)} />
                <button
                  onClick={syncCustomers}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                >
                  <RefreshCw size={16} className={syncing ? "animate-spin" : ""} aria-hidden="true" />
                  {syncing ? "Syncing customers" : "Sync from QuickBooks"}
                </button>
              </div>
            </div>

            {syncMessage && (
              <div
                role={syncError ? "alert" : "status"}
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  color: syncError ? "#B42318" : "#067647",
                  background: syncError ? "#FEF3F2" : "#ECFDF3",
                  border: `1px solid ${syncError ? "#FECDCA" : "#ABEFC6"}`,
                }}
              >
                {syncMessage}
              </div>
            )}

            {/* Money bar */}
            <div className="ops-metrics grid grid-cols-2 lg:grid-cols-4 border-y" style={{ borderColor: "var(--color-border)" }}>
              <MoneyTile
                label="Open A/R"
                value={fmtMoney(data?.moneyBar.totalDue)}
                hint={data ? `${data.moneyBar.openInvoiceCount} open invoices` : undefined}
                tone={(data?.moneyBar.totalDue ?? 0) > 0 ? "warn" : undefined}
                onClick={() => setFilter("with_balance")}
              />
              <MoneyTile
                label="Overdue"
                value={fmtMoney(data?.moneyBar.overdueAmount)}
                hint={data ? `${data.moneyBar.overdueCount} invoices past due` : undefined}
                tone={(data?.moneyBar.overdueCount ?? 0) > 0 ? "danger" : "good"}
              />
              <MoneyTile
                label="Revenue YTD"
                value={fmtMoney(data?.moneyBar.revenueYTD)}
                hint={data ? `${data.moneyBar.ytdInvoiceCount} invoices this year` : undefined}
                tone="good"
              />
              <MoneyTile
                label="Customers"
                value={data ? data.totals.customers.toLocaleString() : "—"}
                hint={data ? `${data.totals.openInvoices} open invoices in view` : undefined}
                tone="brand"
              />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-0 basis-72">
                <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Name, address, phone, email, or QB ID"
                  aria-label="Search customers by name, company, address, phone, email, or QuickBooks ID"
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
              <label className="lg:hidden flex items-center gap-2 text-xs">
                Sort
                <select aria-label="Sort customers" value={`${sort}:${dir}`} onChange={(event) => {
                  const [nextSort, nextDir] = event.target.value.split(":") as [SortKey, "asc" | "desc"];
                  setSort(nextSort); setDir(nextDir);
                }} className="rounded border p-2" style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}>
                  <option value="name:asc">Name A-Z</option><option value="name:desc">Name Z-A</option>
                  <option value="balance:desc">Balance highest</option><option value="balance:asc">Balance lowest</option>
                  <option value="revenue:desc">Revenue highest</option><option value="revenue:asc">Revenue lowest</option>
                  <option value="activity:desc">Activity newest</option><option value="activity:asc">Activity oldest</option>
                </select>
              </label>
            </div>

            <div className="min-h-8 text-sm flex flex-wrap items-center gap-2" role={loadError ? "alert" : "status"}>
              {loadError ? <>
                <span style={{ color: "var(--color-danger)" }}>{loadError} {data ? "Showing last loaded results." : "Try again."}</span>
                <button onClick={() => setRefresh((value) => value + 1)} className="inline-flex items-center gap-1 rounded border px-2 py-1 font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                  <RefreshCw size={14} aria-hidden="true" /> Retry
                </button>
              </> : loading ? (data ? "Updating customers. Showing last loaded results." : "Loading customers…") :
                `${data?.items.length ?? 0} ${data?.items.length === 1 ? "customer" : "customers"}${debounced ? ` matching “${debounced}”` : ""}`}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:hidden" aria-busy={loading}>
              {visibleCustomers.map((c) => (
                <article key={c.id} className="min-w-0 rounded-lg border p-3 space-y-2" style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}>
                  <Link href={`/customers/${encodeURIComponent(c.id)}`} className="flex items-center gap-2 font-semibold text-sm hover:underline">
                    <span className="min-w-0 flex-1 break-words">{c.displayName}</span><ArrowRight size={16} className="shrink-0" aria-hidden="true" />
                  </Link>
                  {!c.isActive && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Inactive</p>}
                  {c.companyName && c.companyName !== c.displayName && <p className="text-xs break-words">{c.companyName}</p>}
                  <div className="space-y-1 text-xs break-words" style={{ color: "var(--color-text-secondary)" }}>
                    {c.email && <p className="break-all"><a href={`mailto:${encodeURIComponent(c.email)}`} className="inline-block py-1 underline underline-offset-2">{c.email}</a></p>}
                    {c.phone && <p><a href={`tel:${c.phone}`} className="inline-block py-1 underline underline-offset-2">{c.phone}</a></p>}
                    {c.phoneAlt && c.phoneAlt !== c.phone && <p><a href={`tel:${c.phoneAlt}`} className="inline-block py-1 underline underline-offset-2">{c.phoneAlt}</a></p>}
                    <p>{addressLabel(c.address) || "No address"}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 border-t pt-2 text-xs" style={{ borderColor: "var(--color-border)" }}>
                    <div className="min-w-0"><dt>A/R balance</dt><dd className="font-semibold break-words">{fmtMoney(c.balance)}</dd></div>
                    <div className="min-w-0"><dt>Total revenue</dt><dd className="break-words">{fmtMoney(c.totalRevenue)}</dd></div>
                    <div><dt>Open invoices</dt><dd>{c.openInvoiceCount}</dd></div>
                    <div><dt>Last activity</dt><dd>{relTime(c.lastActivity)}</dd></div>
                  </dl>
                </article>
              ))}
              {!loading && !loadError && data?.items.length === 0 && <p className="text-sm">No customers match.</p>}
            </div>

            {/* Customer table */}
            <div className="ops-directory-table hidden lg:block overflow-hidden" aria-busy={loading} style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px]">
                  <thead style={{ background: "var(--color-surface-2)" }}>
                    <tr>
                      <Th onClick={sortFor("name")} active={sort === "name"} dir={dir}>Customer</Th>
                      <Th>Contact</Th>
                      <Th>Address</Th>
                      <Th className="text-center">Open</Th>
                      <Th onClick={sortFor("revenue")} active={sort === "revenue"} dir={dir} className="text-right">Total revenue</Th>
                      <Th onClick={sortFor("balance")} active={sort === "balance"} dir={dir} className="text-right">A/R balance</Th>
                      <Th onClick={sortFor("activity")} active={sort === "activity"} dir={dir} className="text-right">Last activity</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !data && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading customers…</td></tr>
                    )}
                    {!loading && !loadError && data?.items.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No customers match.</td></tr>
                    )}
                    {visibleCustomers.map((c) => (
                      <tr
                        key={c.id}
                        className="transition-colors"
                        style={{ borderTop: "1px solid var(--color-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={c.displayName} />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                                <Link href={`/customers/${encodeURIComponent(c.id)}`} className="inline-flex items-center gap-2 max-w-64 break-words hover:underline focus-visible:outline-orange-700">
                                  {c.displayName}<ArrowRight size={14} className="shrink-0" aria-hidden="true" />
                                </Link>
                                {!c.isActive && <span className="text-[9px] uppercase tracking-wide opacity-60">inactive</span>}
                              </div>
                              {c.companyName && c.companyName !== c.displayName && (
                                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{c.companyName}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {c.email && <div className="break-all max-w-[220px]">{c.email}</div>}
                          {c.phone && <div style={{ color: "var(--color-text-muted)" }}>{c.phone}</div>}
                          {c.phoneAlt && c.phoneAlt !== c.phone && <div>{c.phoneAlt}</div>}
                          {!c.email && !c.phone && !c.phoneAlt && <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-64 break-words" style={{ color: "var(--color-text-secondary)" }}>
                          {addressLabel(c.address) || "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {c.openInvoiceCount > 0 ? (
                            <span className="text-sm font-medium" style={{ color: "var(--color-warning)" }}>{c.openInvoiceCount}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm" style={{ color: "var(--color-text-primary)" }}>
                          {c.totalRevenue > 0 ? fmtMoney(c.totalRevenue) : <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.balance > 0 ? (
                            <span className="text-sm font-semibold" style={{ color: "var(--color-warning)" }}>{fmtMoney(c.balance)}</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>$0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {relTime(c.lastActivity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {data && <div className="flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <p>Showing <strong>{visibleCustomers.length.toLocaleString()}</strong> of <strong>{data.items.length.toLocaleString()}</strong> customers · {fmtMoney(data.totals.balance)} A/R · {fmtMoney(data.totals.revenue)} lifetime revenue</p>
              {visibleCount < data.items.length && <button onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="inline-flex items-center gap-1 rounded border px-3 py-2 font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                <Plus size={14} aria-hidden="true" /> Show more
              </button>}
            </div>}
          </div>
        </main>
      </div>
    </div>
  );
}

function MoneyTile({ label, value, hint, tone, onClick }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "danger" | "brand"; onClick?: () => void }) {
  const accent =
    tone === "danger" ? "var(--color-danger)" :
    tone === "warn" ? "var(--color-warning)" :
    tone === "good" ? "var(--color-success)" :
    tone === "brand" ? "var(--color-text-primary)" :
    "var(--color-text-primary)";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`ops-metric text-left w-full min-w-0 ${onClick ? "hover:opacity-80 transition-opacity" : ""}`}
    >
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-xl font-bold mt-1 break-words tabular-nums" style={{ color: accent }}>{value}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
    </Tag>
  );
}

function Pill<V extends string>({ label, v, cur, on }: { label: string; v: V; cur: V; on: (v: V) => void }) {
  const active = cur === v;
  return (
    <button
      onClick={() => on(v)}
      aria-pressed={active}
      className="ops-filter px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors"
    >
      {label}
    </button>
  );
}

function Th({ children, onClick, active, dir, className = "" }: { children?: React.ReactNode; onClick?: () => void; active?: boolean; dir?: "asc" | "desc"; className?: string }) {
  return (
    <th
      scope="col"
      aria-sort={onClick ? (active ? dir === "asc" ? "ascending" : "descending" : "none") : undefined}
      className={`px-4 py-3 text-left text-xs font-semibold ${className}`}
      style={{ color: "var(--color-text-muted)" }}
    >
      {onClick ? <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-orange-800">
        {children}{active && (dir === "asc" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
      </button> : children}
    </th>
  );
}
