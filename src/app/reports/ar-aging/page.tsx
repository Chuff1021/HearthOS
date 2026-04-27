"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DocumentDrawer, { type DocumentType } from "@/components/documents/DocumentDrawer";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
type Bucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d91_plus";
const BUCKET_ORDER: Bucket[] = ["current", "d1_30", "d31_60", "d61_90", "d91_plus"];
const BUCKET_LABEL: Record<Bucket, string> = {
  current: "Current",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d91_plus: "91+ days",
};

type CustGroup = {
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  buckets: Record<Bucket, number>;
  totalBalance: number;
  invoices: Array<{
    id: string;
    number: string | null;
    issueDate: string | null;
    dueDate: string | null;
    balance: number;
    totalAmount: number;
    daysOverdue: number;
    bucket: Bucket;
  }>;
};

type Response = {
  customers: CustGroup[];
  buckets: Record<Bucket, number>;
  grandTotal: number;
  overdueTotal: number;
  invoiceCount: number;
  customerCount: number;
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────
export default function ARAgingPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ onlyOverdue: onlyOverdue ? "true" : "false" });
    try {
      const r = await fetch(`/api/reports/ar-aging?${params}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [onlyOverdue]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-6 space-y-5">
            <div>
              <Link href="/reports" className="text-xs hover:underline" style={{ color: "var(--color-text-muted)" }}>← Reports</Link>
              <h1 className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>Accounts Receivable Aging</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Who owes you, by how long overdue. Click a customer to see every open invoice.
              </p>
            </div>

            {/* Bucket totals */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {BUCKET_ORDER.map((b) => {
                const v = data?.buckets[b] ?? 0;
                const tone = b === "current" ? "good" : b === "d91_plus" || b === "d61_90" ? "danger" : b === "d31_60" ? "warn" : "warn";
                return (
                  <BucketCard key={b} label={BUCKET_LABEL[b]} value={fmtMoney(v)} tone={tone} subtitle={
                    b === "current" ? "Not yet due" :
                    b === "d91_plus" ? "Critical — chase now" : ""
                  } />
                );
              })}
            </div>

            {/* Total summary line */}
            <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Total A/R</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{data ? fmtMoney(data.grandTotal) : "—"}</p>
                {data && (
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                    {data.invoiceCount} open invoices across {data.customerCount} customers · {fmtMoney(data.overdueTotal)} overdue
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
                Only show overdue
              </label>
            </div>

            {/* Customer breakdown */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--color-surface-2)" }}>
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Customer</th>
                      {BUCKET_ORDER.map((b) => (
                        <th key={b} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                          {BUCKET_LABEL[b]}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Total owed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !data && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</td></tr>
                    )}
                    {!loading && data?.customers.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No open A/R. 🎉</td></tr>
                    )}
                    {data?.customers.map((c) => {
                      const key = c.customerId || c.customerName;
                      const isOpen = expanded.has(key);
                      return (
                        <>
                          <tr
                            key={key}
                            onClick={() => toggle(key)}
                            className="cursor-pointer transition-colors"
                            style={{ borderTop: "1px solid var(--color-border)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                          >
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{isOpen ? "▼" : "▶"}</span>
                                <div className="min-w-0">
                                  <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                                    {c.customerId ? (
                                      <Link href={`/customers/${c.customerId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                                        {c.customerName}
                                      </Link>
                                    ) : c.customerName}
                                  </div>
                                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                    {c.invoices.length} invoice{c.invoices.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {BUCKET_ORDER.map((b) => {
                              const v = c.buckets[b];
                              const color =
                                v === 0 ? "var(--color-text-muted)" :
                                b === "current" ? "var(--color-text-secondary)" :
                                b === "d91_plus" || b === "d61_90" ? "#FF204E" :
                                "#F59E0B";
                              return (
                                <td key={b} className="px-3 py-3 text-right" style={{ color, fontWeight: v > 0 ? 500 : 400 }}>
                                  {v > 0 ? fmtMoney(v) : "—"}
                                </td>
                              );
                            })}
                            <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(c.totalBalance)}</td>
                          </tr>
                          {isOpen && c.invoices.map((inv) => (
                            <tr
                              key={inv.id}
                              onClick={(e) => { e.stopPropagation(); setDocDrill({ type: "invoice", id: inv.id }); }}
                              className="cursor-pointer"
                              style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}
                            >
                              <td className="px-3 py-2 pl-10 text-xs">
                                <div style={{ color: "var(--color-text-secondary)" }}>
                                  Invoice <span className="font-mono">#{inv.number}</span>
                                </div>
                                <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                                  Issued {fmtDate(inv.issueDate)} · Due {fmtDate(inv.dueDate)}
                                  {inv.daysOverdue > 0 && <span className="ml-2" style={{ color: "#FF204E" }}>({inv.daysOverdue}d overdue)</span>}
                                </div>
                              </td>
                              {BUCKET_ORDER.map((b) => (
                                <td key={b} className="px-3 py-2 text-right text-xs" style={{ color: inv.bucket === b ? "var(--color-text-primary)" : "transparent" }}>
                                  {inv.bucket === b ? fmtMoney(inv.balance) : ""}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(inv.balance)}</td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                    {data && data.customers.length > 0 && (
                      <tr style={{ borderTop: "2px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                        <td className="px-3 py-3 font-bold" style={{ color: "var(--color-text-primary)" }}>Total</td>
                        {BUCKET_ORDER.map((b) => (
                          <td key={b} className="px-3 py-3 text-right font-bold" style={{ color: "var(--color-text-primary)" }}>
                            {data.buckets[b] > 0 ? fmtMoney(data.buckets[b]) : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-right font-extrabold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(data.grandTotal)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Days overdue is calculated from the invoice due date (or issue date if no due date is set). 91+ is the chase-now bucket.
            </p>
          </div>
        </main>
      </div>

      {docDrill && (
        <DocumentDrawer type={docDrill.type} id={docDrill.id} onClose={() => setDocDrill(null)} />
      )}
    </div>
  );
}

function BucketCard({ label, value, tone, subtitle }: { label: string; value: string; tone: "good" | "warn" | "danger"; subtitle?: string }) {
  const accent = tone === "danger" ? "#FF204E" : tone === "warn" ? "#F59E0B" : "#16A34A";
  return (
    <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderTop: `3px solid ${accent}` }}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: accent }}>{value}</p>
      {subtitle && <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{subtitle}</p>}
    </div>
  );
}
