"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DocumentDrawer, { type DocumentType } from "@/components/documents/DocumentDrawer";

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
};

type Txn = {
  type: "bill" | "po";
  id: string;
  number: string | null;
  date: string | null;
  status: string | null;
  total: number;
  balance: number;
};

type DetailResponse = {
  vendor: VendorRow & { notes: string | null };
  summary: {
    billCount: number;
    openBillCount: number;
    billOpenBalance: number;
    billTotalBilled: number;
    poCount: number;
    openPOCount: number;
    poOpenValue: number;
    lastActivity: string | null;
  };
  transactions: Txn[];
};

type FilterKey = "active" | "all" | "with_balance" | "1099" | "inactive";
type SortKey = "name" | "balance" | "activity";
type Tab = "transactions" | "bills" | "pos" | "profile";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────
export default function VendorsPage() {
  return (
    <Suspense fallback={null}>
      <VendorsPageInner />
    </Suspense>
  );
}

function VendorsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const [list, setList] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("vendorId") || null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ q: debounced, filter, sort, dir });
    try {
      const r = await fetch(`/api/vendors?${params}`);
      const j = await r.json();
      if (r.ok) setList(j);
    } finally {
      setLoading(false);
    }
  }, [debounced, filter, sort, dir]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Auto-select first vendor on load if URL had no vendorId
  useEffect(() => {
    if (!selectedId && list && list.items.length > 0) {
      setSelectedId(list.items[0].id);
    }
  }, [list, selectedId]);

  // Keep URL in sync with selection (without scrolling)
  useEffect(() => {
    if (!selectedId) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("vendorId") !== selectedId) {
      params.set("vendorId", selectedId);
      router.replace(`/vendors?${params.toString()}`, { scroll: false });
    }
  }, [selectedId, router, searchParams]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-hidden flex flex-col">
          {/* Top toolbar */}
          <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-1)" }}>
            <div>
              <h1 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Vendors</h1>
              {list && (
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {list.totals.vendors.toLocaleString()} vendors · {fmtMoney(list.totals.balance)} owed · {list.totals.openBills} open bills · {list.totals.openPOs} open POs
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={async () => {
                  await fetch("/api/quickbooks/sync/vendors", { method: "POST" });
                  fetchList();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
              >
                Sync from QuickBooks
              </button>
              <button onClick={fetchList} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                Refresh
              </button>
            </div>
          </div>

          {/* Two-pane layout */}
          <div className="flex-1 flex overflow-hidden">
            {/* Vendor list */}
            <div className="w-full md:w-[360px] flex flex-col" style={{ borderRight: "1px solid var(--color-border)", background: "var(--color-surface-1)" }}>
              <div className="p-3 space-y-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <input
                  type="text"
                  placeholder="Search vendors…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm focus:ring-2 focus:ring-orange-500"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                />
                <div className="flex gap-1 overflow-x-auto pb-1">
                  <Pill label="Active" v="active" cur={filter} on={setFilter} />
                  <Pill label="Owed $" v="with_balance" cur={filter} on={setFilter} />
                  <Pill label="1099" v="1099" cur={filter} on={setFilter} />
                  <Pill label="All" v="all" cur={filter} on={setFilter} />
                  <Pill label="Inactive" v="inactive" cur={filter} on={setFilter} />
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span style={{ color: "var(--color-text-muted)" }}>Sort:</span>
                  <SortBtn label="Name" v="name" cur={sort} on={setSort} dir={dir} setDir={setDir} />
                  <SortBtn label="Balance" v="balance" cur={sort} on={setSort} dir={dir} setDir={setDir} />
                  <SortBtn label="Activity" v="activity" cur={sort} on={setSort} dir={dir} setDir={setDir} />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading && <p className="p-4 text-xs" style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
                {!loading && list?.items.length === 0 && (
                  <p className="p-4 text-xs" style={{ color: "var(--color-text-muted)" }}>No vendors match.</p>
                )}
                {list?.items.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(v.id)}
                    className="w-full text-left px-3 py-2.5 transition-colors"
                    style={{
                      background: selectedId === v.id ? "var(--color-surface-2)" : "transparent",
                      borderBottom: "1px solid var(--color-border)",
                      borderLeft: selectedId === v.id ? "3px solid #FF4400" : "3px solid transparent",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                          {v.displayName}
                          {v.is1099 && <span className="ml-1 text-[9px] uppercase tracking-wide opacity-60">1099</span>}
                        </div>
                        <div className="text-[11px] mt-0.5 flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
                          {v.openBillCount > 0 && <span>{v.openBillCount} open bill{v.openBillCount === 1 ? "" : "s"}</span>}
                          {v.openPOCount > 0 && <span>{v.openPOCount} open PO{v.openPOCount === 1 ? "" : "s"}</span>}
                          {v.openBillCount === 0 && v.openPOCount === 0 && <span>{relTime(v.lastActivity)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {v.balance > 0 ? (
                          <div className="text-sm font-semibold" style={{ color: "#F59E0B" }}>{fmtMoney(v.balance)}</div>
                        ) : (
                          <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>$0</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Vendor detail */}
            <div className="flex-1 hidden md:block overflow-y-auto" style={{ background: "var(--color-bg)" }}>
              {selectedId ? <VendorDetail vendorId={selectedId} /> : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select a vendor to see their bills, POs, and balance.</p>
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
// Vendor detail pane
// ───────────────────────────────────────────────────────────────────────────
function VendorDetail({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [tab, setTab] = useState<Tab>("transactions");
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/vendors/${vendorId}`)
      .then((r) => r.json())
      .then((j) => setData(j));
  }, [vendorId]);

  if (!data) {
    return <p className="p-6 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>;
  }
  if (!data.vendor) return null;

  const v = data.vendor;
  const txns = data.transactions;
  const bills = txns.filter((t) => t.type === "bill");
  const pos = txns.filter((t) => t.type === "po");

  const visible = tab === "bills" ? bills : tab === "pos" ? pos : tab === "transactions" ? txns : [];

  return (
    <div>
      {/* Vendor header */}
      <div className="p-5" style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
              {v.displayName}
              {v.is1099 && <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>1099</span>}
              {!v.isActive && <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">inactive</span>}
            </h2>
            {v.companyName && v.companyName !== v.displayName && (
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>{v.companyName}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {v.email && <span>📧 {v.email}</span>}
              {v.phone && <span>📞 {v.phone}</span>}
              {v.addressLine1 && <span>📍 {v.addressLine1}{v.city ? `, ${v.city}` : ""}{v.state ? `, ${v.state}` : ""} {v.zip || ""}</span>}
              {v.accountNumber && <span>Account #{v.accountNumber}</span>}
              {v.paymentTerms && <span>Terms: {v.paymentTerms}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Balance owed</p>
            <p className="text-3xl font-bold" style={{ color: data.summary.billOpenBalance > 0 ? "#F59E0B" : "var(--color-text-primary)" }}>
              {fmtMoney(data.summary.billOpenBalance)}
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <MiniStat label="Open bills" value={data.summary.openBillCount.toString()} hint={fmtMoney(data.summary.billOpenBalance)} tone={data.summary.openBillCount > 0 ? "warn" : undefined} />
          <MiniStat label="Total billed" value={fmtMoney(data.summary.billTotalBilled)} hint={`${data.summary.billCount} bills`} />
          <MiniStat label="Open POs" value={data.summary.openPOCount.toString()} hint={fmtMoney(data.summary.poOpenValue)} tone={data.summary.openPOCount > 0 ? "good" : undefined} />
          <MiniStat label="Last activity" value={relTime(data.summary.lastActivity)} hint={fmtDate(data.summary.lastActivity)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 flex gap-1 sticky top-0 z-10" style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-border)" }}>
        <Tab v="transactions" cur={tab} on={setTab} count={txns.length}>Transactions</Tab>
        <Tab v="bills" cur={tab} on={setTab} count={bills.length}>Bills</Tab>
        <Tab v="pos" cur={tab} on={setTab} count={pos.length}>Purchase Orders</Tab>
        <Tab v="profile" cur={tab} on={setTab}>Profile</Tab>
      </div>

      {/* Tab content */}
      <div className="p-5">
        {tab === "profile" ? (
          <ProfileTab vendor={v} />
        ) : visible.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No {tab === "bills" ? "bills" : tab === "pos" ? "purchase orders" : "transactions"} for this vendor.
          </p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--color-surface-2)" }}>
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Type</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Date</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Number</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Status</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Total</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const isOpen = t.balance > 0 || (t.type === "po" && t.status === "open");
                  return (
                    <tr
                      key={`${t.type}-${t.id}`}
                      onClick={() => setDocDrill({ type: t.type === "bill" ? "bill" : "purchase-order", id: t.id })}
                      className="cursor-pointer"
                      style={{ borderTop: "1px solid var(--color-border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td className="px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{
                          background: t.type === "bill" ? "rgba(245,158,11,0.15)" : "rgba(255,68,0,0.15)",
                          color: t.type === "bill" ? "#F59E0B" : "#FF4400",
                        }}>
                          {t.type === "bill" ? "Bill" : "PO"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(t.date)}</td>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>{t.number || "—"}</td>
                      <td className="px-3 py-2 text-xs uppercase" style={{ color: isOpen ? "#F59E0B" : "var(--color-text-muted)" }}>
                        {t.status || "—"}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(t.total)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: t.balance > 0 ? "#F59E0B" : "var(--color-text-muted)" }}>
                        {t.balance > 0 ? fmtMoney(t.balance) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────
function Pill<V extends string>({ label, v, cur, on }: { label: string; v: V; cur: V; on: (v: V) => void }) {
  const active = cur === v;
  return (
    <button
      onClick={() => on(v)}
      className="px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap"
      style={{
        background: active ? "#FF4400" : "var(--color-surface-2)",
        color: active ? "white" : "var(--color-text-secondary)",
        border: "1px solid var(--color-border)",
      }}
    >
      {label}
    </button>
  );
}

function SortBtn<V extends string>({ label, v, cur, on, dir, setDir }: { label: string; v: V; cur: V; on: (v: V) => void; dir: "asc" | "desc"; setDir: (d: "asc" | "desc") => void }) {
  const active = cur === v;
  return (
    <button
      onClick={() => {
        if (active) setDir(dir === "asc" ? "desc" : "asc");
        else { on(v); setDir(v === "name" ? "asc" : "desc"); }
      }}
      className="px-1.5 py-0.5 rounded"
      style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-muted)", fontWeight: active ? 600 : 400 }}
    >
      {label}{active && (dir === "asc" ? " ▲" : " ▼")}
    </button>
  );
}

function Tab({ v, cur, on, count, children }: { v: Tab; cur: Tab; on: (v: Tab) => void; count?: number; children: React.ReactNode }) {
  const active = cur === v;
  return (
    <button
      onClick={() => on(v)}
      className="px-4 py-2 rounded-t-lg text-sm font-medium relative"
      style={{
        color: active ? "var(--color-text-primary)" : "var(--color-text-muted)",
        borderBottom: active ? "2px solid #FF4400" : "2px solid transparent",
        marginBottom: "-1px",
      }}
    >
      {children}
      {typeof count === "number" && (
        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
          {count}
        </span>
      )}
    </button>
  );
}

function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" }) {
  const color = tone === "warn" ? "#F59E0B" : tone === "good" ? "#16A34A" : "var(--color-text-primary)";
  return (
    <div className="p-3 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
    </div>
  );
}

function ProfileTab({ vendor }: { vendor: VendorRow & { notes?: string | null } }) {
  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
      <Section title="Contact">
        <Field label="Email" value={vendor.email} />
        <Field label="Phone" value={vendor.phone} />
      </Section>
      <Section title="Address">
        <Field label="Street" value={vendor.addressLine1} />
        <Field label="City" value={vendor.city} />
        <Field label="State" value={vendor.state} />
        <Field label="ZIP" value={vendor.zip} />
      </Section>
      <Section title="Account">
        <Field label="Account #" value={vendor.accountNumber} />
        <Field label="Payment terms" value={vendor.paymentTerms} />
        <Field label="1099" value={vendor.is1099 ? "Yes" : "No"} />
        <Field label="Active" value={vendor.isActive ? "Yes" : "No"} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-text-secondary)" }}>{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-sm mt-0.5" style={{ color: "var(--color-text-primary)" }}>{value || "—"}</p>
    </div>
  );
}
