"use client";

import { use, useEffect, useState } from "react";
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

  useEffect(() => {
    setData(null); setError(null);
    fetch(`/api/vendors/${id}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => ok ? setData(j) : setError(j.error || "Failed"))
      .catch((e) => setError(e?.message || "Failed"));
  }, [id]);

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
                <VendorHero vendor={data.vendor} summary={data.summary} />

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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Hero card
// ───────────────────────────────────────────────────────────────────────────
function VendorHero({ vendor, summary }: { vendor: DetailResponse["vendor"]; summary: DetailResponse["summary"] }) {
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
        <button disabled className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white" style={{ opacity: 0.6, cursor: "not-allowed" }} title="Coming soon">
          + New bill
        </button>
        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", opacity: 0.6, cursor: "not-allowed" }} title="Coming soon">
          + New PO
        </button>
        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", opacity: 0.6, cursor: "not-allowed" }} title="Coming soon">
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

function TxnTable({ rows, onRowClick }: { rows: Txn[]; onRowClick: (t: Txn) => void }) {
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
