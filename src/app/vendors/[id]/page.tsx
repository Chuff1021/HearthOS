"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DocumentDrawer, { type DocumentType } from "@/components/documents/DocumentDrawer";
import { colorFromName, initialsFromName } from "@/lib/avatar";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
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
  vendor: {
    id: string;
    qbVendorId: string | null;
    displayName: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    phoneAlt: string | null;
    website: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    accountNumber: string | null;
    paymentTerms: string | null;
    is1099: boolean;
    isActive: boolean;
    notes: string | null;
    balance: number;
  };
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

type Tab = "transactions" | "bills" | "pos" | "profile";
type VendorDetail = DetailResponse["vendor"];

type BillForm = {
  billNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  privateNote: string;
};

type VendorEditForm = {
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  phoneAlt: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  accountNumber: string;
  paymentTerms: string;
  notes: string;
  is1099: boolean;
  isActive: boolean;
};

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

const today = () => new Date().toISOString().slice(0, 10);

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

const isOverdue = (date: string | null, balance: number) => {
  if (!date || balance <= 0) return false;
  return new Date(date).getTime() < Date.now();
};

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────
export default function VendorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("transactions");
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);
  const [deletingPoId, setDeletingPoId] = useState<string | null>(null);
  const [savingBill, setSavingBill] = useState(false);
  const [savingVendor, setSavingVendor] = useState(false);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [billForm, setBillForm] = useState<BillForm>(() => ({
    billNumber: "",
    issueDate: today(),
    dueDate: "",
    totalAmount: "",
    privateNote: "",
  }));
  const [vendorForm, setVendorForm] = useState<VendorEditForm | null>(null);

  const loadVendor = useCallback(async (clear = true) => {
    if (clear) setData(null);
    setError(null);
    try {
      const r = await fetch(`/api/vendors/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setData(j);
      return j as DetailResponse;
    } catch (e: any) {
      setError(e?.message || "Failed");
      return null;
    }
  }, [id]);

  useEffect(() => {
    loadVendor();
  }, [loadVendor]);

  function openEditDialog(vendor: VendorDetail) {
    setVendorForm({
      displayName: vendor.displayName || "",
      companyName: vendor.companyName || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      phoneAlt: vendor.phoneAlt || "",
      website: vendor.website || "",
      addressLine1: vendor.addressLine1 || "",
      addressLine2: vendor.addressLine2 || "",
      city: vendor.city || "",
      state: vendor.state || "",
      zip: vendor.zip || "",
      accountNumber: vendor.accountNumber || "",
      paymentTerms: vendor.paymentTerms || "",
      notes: vendor.notes || "",
      is1099: Boolean(vendor.is1099),
      isActive: vendor.isActive !== false,
    });
    setEditDialogOpen(true);
  }

  async function saveVendor() {
    if (!vendorForm) return;
    if (!vendorForm.displayName.trim()) return setError("Vendor name is required.");
    setSavingVendor(true);
    setError(null);
    try {
      const r = await fetch(`/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vendorForm),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to update vendor");
      setEditDialogOpen(false);
      await loadVendor(false);
    } catch (e: any) {
      setError(e?.message || "Failed to update vendor");
    } finally {
      setSavingVendor(false);
    }
  }

  async function createBill() {
    const amount = Number(billForm.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setError("Bill amount must be greater than zero.");
    setSavingBill(true);
    setError(null);
    try {
      const r = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: id,
          billNumber: billForm.billNumber.trim() || undefined,
          issueDate: billForm.issueDate || today(),
          dueDate: billForm.dueDate || undefined,
          totalAmount: amount,
          privateNote: billForm.privateNote.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to create bill");
      setBillDialogOpen(false);
      setBillForm({ billNumber: "", issueDate: today(), dueDate: "", totalAmount: "", privateNote: "" });
      setTab("bills");
      await loadVendor(false);
    } catch (e: any) {
      setError(e?.message || "Failed to create bill");
    } finally {
      setSavingBill(false);
    }
  }

  async function deletePurchaseOrder(po: Txn) {
    const label = po.number ? `PO #${po.number}` : "this PO";
    if (!window.confirm(`Delete ${label}? This removes the purchase order and its line items from Hearth OS.`)) return;
    setDeletingPoId(po.id);
    setError(null);
    try {
      const r = await fetch(`/api/purchase-orders/${encodeURIComponent(po.id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to delete purchase order");
      await loadVendor(false);
    } catch (e: any) {
      setError(e?.message || "Failed to delete purchase order");
    } finally {
      setDeletingPoId(null);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-6 space-y-5">
            {/* Breadcrumb / back */}
            <div className="flex items-center gap-2 text-sm">
              <Link href="/vendors" className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
                ← Vendors
              </Link>
            </div>

            {error && (
              <div className="rounded-xl p-5 text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid #FF204E", color: "#FF204E" }}>
                {error}
              </div>
            )}

            {!data && !error && (
              <div className="rounded-xl p-12 text-center text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                Loading vendor…
              </div>
            )}

            {data && (
              <>
                {/* Hero card */}
                <VendorHero
                  vendor={data.vendor}
                  summary={data.summary}
                  onNewBill={() => setBillDialogOpen(true)}
                  onNewPO={() => router.push(`/purchase-orders?vendorId=${encodeURIComponent(data.vendor.id)}`)}
                  onEdit={() => openEditDialog(data.vendor)}
                />

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Open balance" value={fmtMoney(data.summary.billOpenBalance)} hint={`${data.summary.openBillCount} open bills`} tone={data.summary.billOpenBalance > 0 ? "warn" : undefined} />
                  <Stat label="Total billed" value={fmtMoney(data.summary.billTotalBilled)} hint={`${data.summary.billCount} bills`} />
                  <Stat label="Open POs" value={data.summary.openPOCount.toString()} hint={fmtMoney(data.summary.poOpenValue)} tone={data.summary.openPOCount > 0 ? "brand" : undefined} />
                  <Stat label="Last activity" value={relTime(data.summary.lastActivity)} hint={fmtDate(data.summary.lastActivity)} />
                </div>

                {/* Tabs + content */}
                <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <div className="flex gap-0 px-4 pt-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <Tab v="transactions" cur={tab} on={setTab} count={data.transactions.length}>All transactions</Tab>
                    <Tab v="bills" cur={tab} on={setTab} count={data.summary.billCount}>Bills</Tab>
                    <Tab v="pos" cur={tab} on={setTab} count={data.summary.poCount}>Purchase Orders</Tab>
                    <Tab v="profile" cur={tab} on={setTab}>Profile</Tab>
                  </div>

                  <div className="p-4">
                    {tab === "profile" ? (
                      <ProfileTab vendor={data.vendor} />
                    ) : (
                      <TxnTable
                        rows={
                          tab === "bills" ? data.transactions.filter((t) => t.type === "bill") :
                          tab === "pos"   ? data.transactions.filter((t) => t.type === "po") :
                          data.transactions
                        }
                        deletingPoId={deletingPoId}
                        onDeletePO={deletePurchaseOrder}
                        onRowClick={(t) => setDocDrill({
                          type: t.type === "bill" ? "bill" : "purchase-order",
                          id: t.id,
                        })}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {docDrill && (
        <DocumentDrawer
          type={docDrill.type}
          id={docDrill.id}
          onClose={() => setDocDrill(null)}
        />
      )}

      {data && billDialogOpen && (
        <BillDialog
          vendor={data.vendor}
          form={billForm}
          saving={savingBill}
          onChange={(patch) => setBillForm((prev) => ({ ...prev, ...patch }))}
          onClose={() => !savingBill && setBillDialogOpen(false)}
          onSave={createBill}
        />
      )}

      {data && editDialogOpen && vendorForm && (
        <VendorEditDialog
          form={vendorForm}
          saving={savingVendor}
          onChange={(patch) => setVendorForm((prev) => prev ? ({ ...prev, ...patch }) : prev)}
          onClose={() => !savingVendor && setEditDialogOpen(false)}
          onSave={saveVendor}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Hero card
// ───────────────────────────────────────────────────────────────────────────
function VendorHero({
  vendor,
  summary,
  onNewBill,
  onNewPO,
  onEdit,
}: {
  vendor: DetailResponse["vendor"];
  summary: DetailResponse["summary"];
  onNewBill: () => void;
  onNewPO: () => void;
  onEdit: () => void;
}) {
  const bg = colorFromName(vendor.displayName);
  const initials = initialsFromName(vendor.displayName);
  const addrParts = [vendor.addressLine1, vendor.city, vendor.state, vendor.zip].filter(Boolean);

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          {/* Avatar */}
          <div
            className="rounded-2xl flex items-center justify-center font-bold flex-shrink-0"
            style={{ background: bg, color: "white", width: 64, height: 64, fontSize: 24, letterSpacing: 1 }}
          >
            {initials}
          </div>
          {/* Identity */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                {vendor.displayName}
              </h1>
              {vendor.is1099 && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "rgba(168,85,247,0.15)", color: "#A855F7" }}>
                  1099 vendor
                </span>
              )}
              {!vendor.isActive && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                  Inactive
                </span>
              )}
            </div>
            {vendor.companyName && vendor.companyName !== vendor.displayName && (
              <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{vendor.companyName}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {vendor.email && (
                <a href={`mailto:${vendor.email}`} className="hover:underline flex items-center gap-1.5">
                  <span style={{ color: "var(--color-text-muted)" }}>✉</span>
                  {vendor.email}
                </a>
              )}
              {vendor.phone && (
                <a href={`tel:${vendor.phone}`} className="hover:underline flex items-center gap-1.5">
                  <span style={{ color: "var(--color-text-muted)" }}>☎</span>
                  {vendor.phone}
                </a>
              )}
              {vendor.website && (
                <a href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1.5">
                  <span style={{ color: "var(--color-text-muted)" }}>🌐</span>
                  {vendor.website}
                </a>
              )}
              {addrParts.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span style={{ color: "var(--color-text-muted)" }}>📍</span>
                  {addrParts.join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: balance owed */}
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Balance owed</p>
          <p className="text-3xl font-bold mt-1" style={{ color: summary.billOpenBalance > 0 ? "#F59E0B" : "var(--color-text-primary)" }}>
            {fmtMoney(summary.billOpenBalance)}
          </p>
          {vendor.paymentTerms && (
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Terms: {vendor.paymentTerms}</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mt-6 pt-5" style={{ borderTop: "1px solid var(--color-border)" }}>
        <button onClick={onNewBill} className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white">
          + New bill
        </button>
        <button onClick={onNewPO} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
          + New PO
        </button>
        <button onClick={onEdit} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
          Edit
        </button>
        {vendor.email && (
          <a href={`mailto:${vendor.email}`} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            Email
          </a>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Stats / tabs / table
// ───────────────────────────────────────────────────────────────────────────
function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "danger" | "brand" }) {
  const color = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : tone === "brand" ? "#0EA5E9" : "var(--color-text-primary)";
  return (
    <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
    </div>
  );
}

function Tab({ v, cur, on, count, children }: { v: Tab; cur: Tab; on: (v: Tab) => void; count?: number; children: React.ReactNode }) {
  const active = cur === v;
  return (
    <button
      onClick={() => on(v)}
      className="px-4 py-2.5 text-sm font-medium relative transition-colors"
      style={{
        color: active ? "var(--color-text-primary)" : "var(--color-text-muted)",
        borderBottom: active ? "2px solid #f8971f" : "2px solid transparent",
        marginBottom: "-1px",
      }}
    >
      {children}
      {typeof count === "number" && count > 0 && (
        <span
          className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold"
          style={{
            background: active ? "#f8971f" : "var(--color-surface-2)",
            color: active ? "white" : "var(--color-text-muted)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function TxnTable({
  rows,
  onRowClick,
  onDeletePO,
  deletingPoId,
}: {
  rows: Txn[];
  onRowClick: (t: Txn) => void;
  onDeletePO: (t: Txn) => void;
  deletingPoId: string | null;
}) {
  if (rows.length === 0) {
    return <p className="p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No transactions yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--color-surface-2)" }}>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Type</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Date</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Number</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Status</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Total</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Balance</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const overdue = t.type === "bill" && isOverdue(t.date, t.balance);
            const statusColor = overdue ? "#FF204E" :
              t.balance > 0 || t.status === "open" ? "#F59E0B" :
              "var(--color-text-muted)";
            const statusText = overdue ? "Overdue" : (t.status || "—");
            return (
              <tr
                key={`${t.type}-${t.id}`}
                onClick={() => onRowClick(t)}
                className="cursor-pointer transition-colors"
                style={{ borderTop: "1px solid var(--color-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td className="px-3 py-2.5">
                  <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: t.type === "bill" ? "rgba(245,158,11,0.15)" : "rgba(14,165,233,0.15)",
                      color: t.type === "bill" ? "#F59E0B" : "#0EA5E9",
                    }}>
                    {t.type === "bill" ? "Bill" : "PO"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(t.date)}</td>
                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>{t.number ? `#${t.number}` : "—"}</td>
                <td className="px-3 py-2.5 text-xs uppercase font-medium" style={{ color: statusColor }}>{statusText}</td>
                <td className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(t.total)}</td>
                <td className="px-3 py-2.5 text-right font-medium" style={{ color: t.balance > 0 ? "#F59E0B" : "var(--color-text-muted)" }}>
                  {t.balance > 0 ? fmtMoney(t.balance) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {t.type === "po" ? (
                    <button
                      type="button"
                      disabled={deletingPoId === t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePO(t);
                      }}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold disabled:opacity-60"
                      style={{ background: "rgba(255,32,78,0.10)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.25)" }}
                    >
                      {deletingPoId === t.id ? "Deleting..." : "Delete PO"}
                    </button>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-lg text-lg" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BillDialog({
  vendor,
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  vendor: VendorDetail;
  form: BillForm;
  saving: boolean;
  onChange: (patch: Partial<BillForm>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <DialogShell title="New bill" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Vendor: <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{vendor.displayName}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Bill no." value={form.billNumber} onChange={(value) => onChange({ billNumber: value })} placeholder="Optional" />
          <Input label="Amount" value={form.totalAmount} onChange={(value) => onChange({ totalAmount: value })} placeholder="0.00" inputMode="decimal" />
          <Input label="Bill date" type="date" value={form.issueDate} onChange={(value) => onChange({ issueDate: value })} />
          <Input label="Due date" type="date" value={form.dueDate} onChange={(value) => onChange({ dueDate: value })} />
        </div>
        <TextArea label="Memo" value={form.privateNote} onChange={(value) => onChange({ privateNote: value })} rows={4} />
      </div>
      <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
        <button disabled={saving} onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Cancel</button>
        <button disabled={saving} onClick={onSave} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#F97316", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Save bill"}
        </button>
      </div>
    </DialogShell>
  );
}

function VendorEditDialog({
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: VendorEditForm;
  saving: boolean;
  onChange: (patch: Partial<VendorEditForm>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <DialogShell title="Edit vendor" onClose={onClose}>
      <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Display name" value={form.displayName} onChange={(value) => onChange({ displayName: value })} />
          <Input label="Company" value={form.companyName} onChange={(value) => onChange({ companyName: value })} />
          <Input label="Email" value={form.email} onChange={(value) => onChange({ email: value })} />
          <Input label="Phone" value={form.phone} onChange={(value) => onChange({ phone: value })} />
          <Input label="Alt phone" value={form.phoneAlt} onChange={(value) => onChange({ phoneAlt: value })} />
          <Input label="Website" value={form.website} onChange={(value) => onChange({ website: value })} />
          <Input label="Street" value={form.addressLine1} onChange={(value) => onChange({ addressLine1: value })} />
          <Input label="Street 2" value={form.addressLine2} onChange={(value) => onChange({ addressLine2: value })} />
          <Input label="City" value={form.city} onChange={(value) => onChange({ city: value })} />
          <Input label="State" value={form.state} onChange={(value) => onChange({ state: value })} />
          <Input label="ZIP" value={form.zip} onChange={(value) => onChange({ zip: value })} />
          <Input label="Account #" value={form.accountNumber} onChange={(value) => onChange({ accountNumber: value })} />
          <Input label="Payment terms" value={form.paymentTerms} onChange={(value) => onChange({ paymentTerms: value })} />
        </div>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <input type="checkbox" checked={form.is1099} onChange={(e) => onChange({ is1099: e.target.checked })} />
            1099 vendor
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
            Active
          </label>
        </div>
        <TextArea label="Notes" value={form.notes} onChange={(value) => onChange({ notes: value })} rows={4} />
      </div>
      <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
        <button disabled={saving} onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Cancel</button>
        <button disabled={saving} onClick={onSave} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#2563EB", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </DialogShell>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; inputMode?: "decimal" | "numeric" | "text" }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <input
        type={type}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm"
        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
      />
    </label>
  );
}

function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg text-sm resize-none"
        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
      />
    </label>
  );
}

function ProfileTab({ vendor }: { vendor: DetailResponse["vendor"] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
      <Section title="Contact">
        <Field label="Email" value={vendor.email} link={vendor.email ? `mailto:${vendor.email}` : undefined} />
        <Field label="Phone" value={vendor.phone} link={vendor.phone ? `tel:${vendor.phone}` : undefined} />
        <Field label="Alternate phone" value={vendor.phoneAlt} />
        <Field label="Website" value={vendor.website} link={vendor.website ? (vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`) : undefined} />
      </Section>
      <Section title="Address">
        <Field label="Street" value={vendor.addressLine1} />
        {vendor.addressLine2 && <Field label="Street 2" value={vendor.addressLine2} />}
        <Field label="City" value={vendor.city} />
        <Field label="State" value={vendor.state} />
        <Field label="ZIP" value={vendor.zip} />
      </Section>
      <Section title="Account">
        <Field label="Account #" value={vendor.accountNumber} />
        <Field label="Payment terms" value={vendor.paymentTerms} />
        <Field label="1099 vendor" value={vendor.is1099 ? "Yes" : "No"} />
        <Field label="Active" value={vendor.isActive ? "Yes" : "No"} />
        <Field label="QuickBooks ID" value={vendor.qbVendorId} />
      </Section>
      {vendor.notes && (
        <Section title="Notes">
          <p className="text-sm whitespace-pre-wrap col-span-2" style={{ color: "var(--color-text-primary)" }}>{vendor.notes}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-secondary)" }}>{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value, link }: { label: string; value: string | null | undefined; link?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      {link && value ? (
        <a href={link} target={link.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-sm mt-0.5 hover:underline block break-words" style={{ color: "var(--color-text-primary)" }}>
          {value}
        </a>
      ) : (
        <p className="text-sm mt-0.5 break-words" style={{ color: "var(--color-text-primary)" }}>{value || "—"}</p>
      )}
    </div>
  );
}
