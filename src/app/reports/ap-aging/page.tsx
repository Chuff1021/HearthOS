"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DocumentDrawer, { type DocumentType } from "@/components/documents/DocumentDrawer";

type Bucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d91_plus";
const BUCKET_ORDER: Bucket[] = ["current", "d1_30", "d31_60", "d61_90", "d91_plus"];
const BUCKET_LABEL: Record<Bucket, string> = {
  current: "Current",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d91_plus: "91+ days",
};
const BUCKET_COLOR: Record<Bucket, string> = {
  current: "var(--color-text-muted)",
  d1_30: "#F59E0B",
  d31_60: "#F97316",
  d61_90: "#EF4444",
  d91_plus: "#DC2626",
};

type VendorGroup = {
  vendorId: string | null;
  vendorName: string;
  vendorEmail: string | null;
  vendorPhone: string | null;
  buckets: Record<Bucket, number>;
  totalBalance: number;
  bills: Array<{
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
  vendors: VendorGroup[];
  buckets: Record<Bucket, number>;
  grandTotal: number;
  overdueTotal: number;
  billCount: number;
  vendorCount: number;
};

const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function APAgingPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docDrill, setDocDrill] = useState<{ type: DocumentType; id: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ onlyOverdue: onlyOverdue ? "true" : "false" });
    try {
      const r = await fetch(`/api/reports/ap-aging?${params}`);
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
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <Link href="/reports" className="text-xs" style={{ color: "var(--color-text-muted)" }}>← Reports</Link>
                <h1 className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>Accounts Payable Aging</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>What you owe vendors, bucketed by days overdue.</p>
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
                Overdue only
              </label>
            </div>

            {data && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Tile label="Total owed" value={fmtMoney(data.grandTotal)} accent="var(--color-text-primary)" />
                <Tile label="Overdue" value={fmtMoney(data.overdueTotal)} accent="#DC2626" />
                {BUCKET_ORDER.map((b) => (
                  <Tile key={b} label={BUCKET_LABEL[b]} value={fmtMoney(data.buckets[b])} accent={BUCKET_COLOR[b]} />
                ))}
              </div>
            )}

            {loading ? (
              <div className="rounded-xl p-12 text-center text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Loading…</div>
            ) : !data || data.vendors.length === 0 ? (
              <div className="rounded-xl p-12 text-center text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>No open bills.</div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "var(--color-surface-2)" }}>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Vendor</th>
                        {BUCKET_ORDER.map((b) => (
                          <th key={b} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: BUCKET_COLOR[b] }}>{BUCKET_LABEL[b]}</th>
                        ))}
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.vendors.map((g) => {
                        const key = g.vendorId || g.vendorName;
                        const open = expanded.has(key);
                        return (
                          <>
                            <tr key={key} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => toggle(key)} style={{ borderTop: "1px solid var(--color-border)" }}>
                              <td className="px-4 py-3">
                                <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{g.vendorName}</div>
                                <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{g.bills.length} open bill{g.bills.length === 1 ? "" : "s"} · {open ? "▼" : "▶"} click to expand</div>
                              </td>
                              {BUCKET_ORDER.map((b) => (
                                <td key={b} className="px-4 py-3 text-right text-sm" style={{ color: g.buckets[b] > 0 ? BUCKET_COLOR[b] : "var(--color-text-muted)" }}>{g.buckets[b] > 0 ? fmtMoney(g.buckets[b]) : "—"}</td>
                              ))}
                              <td className="px-4 py-3 text-right font-bold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(g.totalBalance)}</td>
                            </tr>
                            {open && g.bills.map((b) => (
                              <tr key={b.id} style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
                                <td className="px-8 py-2 text-sm" colSpan={1}>
                                  <button onClick={(e) => { e.stopPropagation(); setDocDrill({ type: "bill", id: b.id }); }} className="hover:underline text-left" style={{ color: "var(--color-text-secondary)" }}>
                                    {b.number || `Bill ${b.id.slice(0, 8)}`}
                                  </button>
                                  <span className="ml-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                                    issued {fmtDate(b.issueDate)} · due {fmtDate(b.dueDate)}
                                    {b.daysOverdue > 0 && <span style={{ color: BUCKET_COLOR[b.bucket], marginLeft: 6 }}>· {b.daysOverdue}d overdue</span>}
                                  </span>
                                </td>
                                <td colSpan={5}></td>
                                <td className="px-4 py-2 text-right text-sm" style={{ color: BUCKET_COLOR[b.bucket] }}>{fmtMoney(b.balance)}</td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {docDrill && <DocumentDrawer type={docDrill.type} id={docDrill.id} onClose={() => setDocDrill(null)} />}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderLeft: `4px solid ${accent}` }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}
