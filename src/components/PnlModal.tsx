"use client";

import { useEffect, useState } from "react";

type PnlResponse = {
  type: "invoice" | "estimate";
  header: {
    docId: string;
    docNumber: string | null;
    issueDate: string | null;
    status: string | null;
    total: number;
    balance: number;
    customerName: string | null;
  };
  lines: Array<{
    id: string;
    description: string | null;
    itemName: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
    cost: number;
    profit: number;
    bucket: "labor" | "product" | "tax";
    costSource: "bill" | "inventory" | null;
  }>;
  summary: {
    productRevenue: number;
    productCogs: number;
    productProfit: number;
    laborRevenue: number;
    taxPassthrough: number;
    totalRevenue: number;
    totalProfit: number;
    margin: number | null;
  };
  splits: {
    scottProductShare: number;
    scottLaborShare: number;
    scottTotal: number;
    ownerNet: number;
    rates: { product: number; labor: number };
  };
};

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (n: number) =>
  n < 0 ? `-$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmtMoney(n);
const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

const profitColor = (n: number) =>
  n < 0 ? "#FF204E" : n > 0 ? "#16A34A" : "var(--color-text-muted)";

type Props = {
  type: "invoice" | "estimate";
  id: string;
  docLabel?: string;
  onClose: () => void;
};

export default function PnlModal({ type, id, docLabel, onClose }: Props) {
  const [data, setData] = useState<PnlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/pnl/${type}/${encodeURIComponent(id)}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Failed to load P&L");
        if (!cancelled) setData(j);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [type, id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 flex items-start justify-between gap-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>P&amp;L</h2>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                {type}
              </span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {docLabel || data?.header?.docNumber || id}
              {data?.header?.customerName ? ` · ${data.header.customerName}` : ""}
              {data?.header?.issueDate ? ` · ${data.header.issueDate}` : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-sm" style={{ color: "var(--color-text-muted)" }}>✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading P&L…</div>
          ) : error ? (
            <div className="p-8 text-sm" style={{ color: "#EF4444" }}>{error}</div>
          ) : !data ? null : (
            <>
              {/* Summary tiles */}
              <div className="grid grid-cols-3 gap-3 p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <Tile label="Revenue" value={fmtMoney(data.summary.totalRevenue)} sub={`Products ${fmtMoney(data.summary.productRevenue)} · Labor ${fmtMoney(data.summary.laborRevenue)}`} />
                <Tile label="Profit" value={fmtSigned(data.summary.totalProfit)} valueColor={profitColor(data.summary.totalProfit)} sub={`Margin ${fmtPct(data.summary.margin)}`} />
                <Tile label="Scott's share" value={fmtMoney(data.splits.scottTotal)} valueColor="#9a5d12" sub={`Product 15% + Labor 20%`} />
              </div>

              {/* Line breakdown */}
              <div className="p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-secondary)" }}>Lines</h3>
                {data.lines.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No line items.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead style={{ color: "var(--color-text-muted)" }}>
                      <tr>
                        <th className="text-left py-1 pr-3">Item</th>
                        <th className="text-left py-1 px-1">Type</th>
                        <th className="text-right py-1 px-1">Qty</th>
                        <th className="text-right py-1 px-1">Sale</th>
                        <th className="text-right py-1 px-1">Cost</th>
                        <th className="text-right py-1 pl-1">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l) => {
                        const isTax = l.bucket === "tax";
                        return (
                          <tr key={l.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td className="py-1.5 pr-3 truncate max-w-[18rem]" style={{ color: "var(--color-text-primary)" }}>
                              {l.description || l.itemName || "—"}
                              {isTax && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>tax</span>
                              )}
                            </td>
                            <td className="py-1.5 px-1" style={{ color: "var(--color-text-muted)" }}>
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{
                                background: l.bucket === "labor" ? "rgba(59,130,246,0.12)" : l.bucket === "product" ? "rgba(248,151,31,0.12)" : "var(--color-surface-2)",
                                color: l.bucket === "labor" ? "#2563EB" : l.bucket === "product" ? "#9a5d12" : "var(--color-text-muted)",
                              }}>{l.bucket}</span>
                            </td>
                            <td className="py-1.5 px-1 text-right" style={{ color: "var(--color-text-secondary)" }}>{l.quantity}</td>
                            <td className="py-1.5 px-1 text-right" style={{ color: "var(--color-text-secondary)" }}>{fmtMoney(l.total)}</td>
                            <td className="py-1.5 px-1 text-right" style={{ color: "var(--color-text-secondary)" }}>
                              {isTax || l.bucket === "labor" ? "—" : (
                                <>
                                  {fmtMoney(l.cost)}
                                  {l.costSource === "bill" && <span className="ml-1 text-[9px]" style={{ color: "var(--color-text-muted)" }}>bill</span>}
                                </>
                              )}
                            </td>
                            <td className="py-1.5 pl-1 text-right font-medium" style={{ color: profitColor(l.profit) }}>{isTax ? "—" : fmtSigned(l.profit)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Splits breakdown */}
              <div className="p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-secondary)" }}>Splits</h3>
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-1.5" style={{ color: "var(--color-text-secondary)" }}>Product profit</td>
                      <td className="py-1.5 text-right">{fmtMoney(data.summary.productProfit)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pl-4 text-xs" style={{ color: "var(--color-text-muted)" }}>× 15% → Scott</td>
                      <td className="py-1.5 text-right text-xs" style={{ color: "#9a5d12" }}>{fmtMoney(data.splits.scottProductShare)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5" style={{ color: "var(--color-text-secondary)" }}>Labor revenue</td>
                      <td className="py-1.5 text-right">{fmtMoney(data.summary.laborRevenue)}</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-1.5 pl-4 text-xs" style={{ color: "var(--color-text-muted)" }}>× 20% → Scott</td>
                      <td className="py-1.5 text-right text-xs" style={{ color: "#9a5d12" }}>{fmtMoney(data.splits.scottLaborShare)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold" style={{ color: "var(--color-text-primary)" }}>Scott total</td>
                      <td className="py-2 text-right font-semibold" style={{ color: "#9a5d12" }}>{fmtMoney(data.splits.scottTotal)}</td>
                    </tr>
                    <tr style={{ borderTop: "2px solid var(--color-border)" }}>
                      <td className="py-2 font-semibold" style={{ color: "var(--color-text-primary)" }}>Owner net (after Scott)</td>
                      <td className="py-2 text-right font-bold text-lg" style={{ color: profitColor(data.splits.ownerNet) }}>{fmtSigned(data.splits.ownerNet)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="p-4 flex justify-end" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
      <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      <div className="text-lg font-bold mt-1" style={{ color: valueColor || "var(--color-text-primary)" }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{sub}</div>}
    </div>
  );
}
