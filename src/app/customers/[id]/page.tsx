"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DocumentDrawer, { type DocumentType } from "@/components/documents/DocumentDrawer";
import { colorFromName, initialsFromName } from "@/lib/avatar";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
type Txn = {
  type: "invoice" | "payment";
  id: string;
  number: string | null;
  date: string | null;
  status: string | null;
  total: number;
  balance: number;
  paymentMethod?: string | null;
};

type DetailResponse = {
  customer: {
    id: string;
    qbCustomerId: string | null;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    phoneAlt: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    source: string | null;
    isActive: boolean;
    notes: string | null;
    tags: any;
  };
  summary: {
    invoiceCount: number;
    openInvoiceCount: number;
    invoiceOpenBalance: number;
    invoiceTotalBilled: number;
    paymentCount: number;
    totalReceived: number;
    lastActivity: string | null;
  };
  transactions: Txn[];
};

type Tab = "transactions" | "invoices" | "payments" | "profile";

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
export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("transactions");
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    fetch(`/api/customers/${id}`)
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
            <div className="flex items-center gap-2 text-sm">
              <Link href="/customers" className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
                ← Customers
              </Link>
            </div>

            {error && (
              <div className="rounded-xl p-5 text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid #FF204E", color: "#FF204E" }}>
                {error}
              </div>
            )}

            {!data && !error && (
              <div className="rounded-xl p-12 text-center text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                Loading customer…
              </div>
            )}

            {data && (
              <>
                <CustomerHero customer={data.customer} summary={data.summary} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Open balance" value={fmtMoney(data.summary.invoiceOpenBalance)} hint={`${data.summary.openInvoiceCount} open invoices`} tone={data.summary.invoiceOpenBalance > 0 ? "warn" : undefined} />
                  <Stat label="Lifetime revenue" value={fmtMoney(data.summary.invoiceTotalBilled)} hint={`${data.summary.invoiceCount} invoices`} />
                  <Stat label="Payments received" value={fmtMoney(data.summary.totalReceived)} hint={`${data.summary.paymentCount} payments`} tone="good" />
                  <Stat label="Last activity" value={relTime(data.summary.lastActivity)} hint={fmtDate(data.summary.lastActivity)} />
                </div>

                <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <div className="flex gap-0 px-4 pt-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <Tab v="transactions" cur={tab} on={setTab} count={data.transactions.length}>All transactions</Tab>
                    <Tab v="invoices" cur={tab} on={setTab} count={data.summary.invoiceCount}>Invoices</Tab>
                    <Tab v="payments" cur={tab} on={setTab} count={data.summary.paymentCount}>Payments</Tab>
                    <Tab v="profile" cur={tab} on={setTab}>Profile</Tab>
                  </div>

                  <div className="p-4">
                    {tab === "profile" ? (
                      <ProfileTab customer={data.customer} />
                    ) : (
                      <TxnTable
                        rows={
                          tab === "invoices" ? data.transactions.filter((t) => t.type === "invoice") :
                          tab === "payments" ? data.transactions.filter((t) => t.type === "payment") :
                          data.transactions
                        }
                        onRowClick={(t) => {
                          if (t.type === "invoice") setDocDrill({ type: "invoice", id: t.id });
                          // payments don't have their own drawer view yet
                        }}
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
        <DocumentDrawer type={docDrill.type} id={docDrill.id} onClose={() => setDocDrill(null)} />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Hero card
// ───────────────────────────────────────────────────────────────────────────
function CustomerHero({ customer, summary }: { customer: DetailResponse["customer"]; summary: DetailResponse["summary"] }) {
  return (
    <div className="rounded-xl p-6" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className="rounded-2xl flex items-center justify-center font-bold flex-shrink-0"
            style={{ background: colorFromName(customer.displayName), color: "white", width: 64, height: 64, fontSize: 24, letterSpacing: 1 }}
          >
            {initialsFromName(customer.displayName)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{customer.displayName}</h1>
              {customer.source && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                  {customer.source}
                </span>
              )}
              {!customer.isActive && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>Inactive</span>
              )}
            </div>
            {customer.companyName && customer.companyName !== customer.displayName && (
              <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{customer.companyName}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="hover:underline flex items-center gap-1.5">
                  <span style={{ color: "var(--color-text-muted)" }}>✉</span>{customer.email}
                </a>
              )}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="hover:underline flex items-center gap-1.5">
                  <span style={{ color: "var(--color-text-muted)" }}>☎</span>{customer.phone}
                </a>
              )}
              {customer.phoneAlt && (
                <a href={`tel:${customer.phoneAlt}`} className="hover:underline flex items-center gap-1.5">
                  <span style={{ color: "var(--color-text-muted)" }}>☎</span>{customer.phoneAlt}
                </a>
              )}
              {(() => {
                const lines = [
                  customer.addressLine1,
                  customer.addressLine2,
                  [customer.city, customer.state, customer.zip].filter(Boolean).join(", ").replace(/, (\w{2}|\d{5})$/, " $1"),
                ].filter((s) => s && String(s).trim());
                if (lines.length === 0) return null;
                const oneLine = lines.join(" · ");
                const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lines.join(", "))}`;
                return (
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1.5">
                    <span style={{ color: "var(--color-text-muted)" }}>📍</span>{oneLine}
                  </a>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Open balance</p>
          <p className="text-3xl font-bold mt-1" style={{ color: summary.invoiceOpenBalance > 0 ? "#F59E0B" : "var(--color-text-primary)" }}>
            {fmtMoney(summary.invoiceOpenBalance)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-6 pt-5" style={{ borderTop: "1px solid var(--color-border)" }}>
        <button disabled className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white" style={{ opacity: 0.6, cursor: "not-allowed" }} title="Coming soon">
          + New invoice
        </button>
        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", opacity: 0.6, cursor: "not-allowed" }} title="Coming soon">
          + New estimate
        </button>
        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", opacity: 0.6, cursor: "not-allowed" }} title="Coming soon">
          + Receive payment
        </button>
        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", opacity: 0.6, cursor: "not-allowed" }} title="Coming soon">
          Edit
        </button>
        {customer.email && (
          <a href={`mailto:${customer.email}`} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            Email
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "danger" | "good" | "brand" }) {
  const color = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : tone === "good" ? "#16A34A" : tone === "brand" ? "#0EA5E9" : "var(--color-text-primary)";
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
        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: active ? "#f8971f" : "var(--color-surface-2)", color: active ? "white" : "var(--color-text-muted)" }}>
          {count}
        </span>
      )}
    </button>
  );
}

function TxnTable({ rows, onRowClick }: { rows: Txn[]; onRowClick: (t: Txn) => void }) {
  if (rows.length === 0) return <p className="p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No transactions yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--color-surface-2)" }}>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Type</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Date</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Number</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Status</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Amount</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const overdue = t.type === "invoice" && isOverdue(t.date, t.balance);
            const statusColor = overdue ? "#FF204E" :
              t.type === "payment" ? "#16A34A" :
              t.balance > 0 ? "#F59E0B" :
              "var(--color-text-muted)";
            const statusText = overdue ? "Overdue" : (t.status || "—");
            const isClickable = t.type === "invoice";
            return (
              <tr
                key={`${t.type}-${t.id}`}
                onClick={() => isClickable && onRowClick(t)}
                className={isClickable ? "cursor-pointer transition-colors" : ""}
                style={{ borderTop: "1px solid var(--color-border)" }}
                onMouseEnter={isClickable ? (e) => (e.currentTarget.style.background = "var(--color-surface-2)") : undefined}
                onMouseLeave={isClickable ? (e) => (e.currentTarget.style.background = "") : undefined}
              >
                <td className="px-3 py-2.5">
                  <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full" style={{
                    background: t.type === "invoice" ? "rgba(245,158,11,0.15)" : "rgba(22,163,74,0.15)",
                    color: t.type === "invoice" ? "#F59E0B" : "#16A34A",
                  }}>
                    {t.type === "invoice" ? "Invoice" : "Payment"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(t.date)}</td>
                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                  {t.number || "—"}
                  {t.paymentMethod && <span className="ml-2 text-[10px] uppercase opacity-60">{t.paymentMethod}</span>}
                </td>
                <td className="px-3 py-2.5 text-xs uppercase font-medium" style={{ color: statusColor }}>{statusText}</td>
                <td className="px-3 py-2.5 text-right font-medium" style={{ color: t.type === "payment" ? "#16A34A" : "var(--color-text-primary)" }}>
                  {t.type === "payment" ? `+${fmtMoney(t.total)}` : fmtMoney(t.total)}
                </td>
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

function ProfileTab({ customer }: { customer: DetailResponse["customer"] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
      <Section title="Contact">
        <Field label="Email" value={customer.email} link={customer.email ? `mailto:${customer.email}` : undefined} />
        <Field label="Phone" value={customer.phone} link={customer.phone ? `tel:${customer.phone}` : undefined} />
        <Field label="Alt phone" value={customer.phoneAlt} />
        <Field label="Source" value={customer.source} />
      </Section>
      <Section title="Account">
        <Field label="QuickBooks ID" value={customer.qbCustomerId} />
        <Field label="Active" value={customer.isActive ? "Yes" : "No"} />
        <Field label="First name" value={customer.firstName} />
        <Field label="Last name" value={customer.lastName} />
      </Section>
      {customer.notes && (
        <Section title="Notes">
          <p className="text-sm whitespace-pre-wrap col-span-2" style={{ color: "var(--color-text-primary)" }}>{customer.notes}</p>
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
        <a href={link} className="text-sm mt-0.5 hover:underline block break-words" style={{ color: "var(--color-text-primary)" }}>{value}</a>
      ) : (
        <p className="text-sm mt-0.5 break-words" style={{ color: "var(--color-text-primary)" }}>{value || "—"}</p>
      )}
    </div>
  );
}
