"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Month = { month: string; in: number; out: number; net: number };
type Response = {
  months: Month[];
  totals: { in: number; out: number; net: number };
  window: { since: string; until: string; monthsBack: number };
};

const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtMonthLabel = (s: string) => {
  const [y, m] = s.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

export default function CashFlowPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthsBack, setMonthsBack] = useState<number>(12);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ monthsBack: String(monthsBack) });
    try {
      const r = await fetch(`/api/reports/cash-flow?${params}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [monthsBack]);

  useEffect(() => { load(); }, [load]);

  const maxBar = useMemo(() => {
    if (!data) return 1;
    let m = 0;
    for (const x of data.months) {
      if (x.in > m) m = x.in;
      if (x.out > m) m = x.out;
    }
    return m || 1;
  }, [data]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">
            <div>
              <Link href="/reports" className="text-xs" style={{ color: "var(--color-text-muted)" }}>← Reports</Link>
              <h1 className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>Cash Flow</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Money in (customer payments) vs money out (bills paid). Bills are dated by issue date.
              </p>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {[3, 6, 12, 24].map((n) => (
                <button key={n} onClick={() => setMonthsBack(n)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{
                  background: monthsBack === n ? "rgba(248,151,31,0.16)" : "var(--color-surface-1)",
                  color: monthsBack === n ? "#9a5d12" : "var(--color-text-muted)",
                  border: monthsBack === n ? "1px solid #f8971f" : "1px solid var(--color-border)",
                }}>Last {n} mo</button>
              ))}
            </div>

            {data && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Tile label="Money in" value={fmtMoney(data.totals.in)} accent="#16A34A" />
                <Tile label="Money out" value={fmtMoney(data.totals.out)} accent="#DC2626" />
                <Tile label="Net" value={fmtMoney(data.totals.net)} accent={data.totals.net < 0 ? "#DC2626" : "#16A34A"} />
              </div>
            )}

            {loading ? (
              <Empty text="Loading…" />
            ) : !data || data.months.length === 0 ? (
              <Empty text="No cash activity in this window." />
            ) : (
              <>
                {/* Chart */}
                <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Monthly</h2>
                    <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      <span className="inline-flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: "#16A34A", display: "inline-block" }} />In</span>
                      <span className="inline-flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: "#DC2626", display: "inline-block" }} />Out</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="flex items-end gap-2" style={{ minHeight: 220 }}>
                      {data.months.map((m) => {
                        const inH = (m.in / maxBar) * 200;
                        const outH = (m.out / maxBar) * 200;
                        return (
                          <div key={m.month} className="flex flex-col items-center gap-2 flex-1 min-w-[48px]">
                            <div className="flex items-end gap-1 h-[200px]">
                              <div title={`In: ${fmtMoney(m.in)}`} style={{ height: Math.max(2, inH), width: 18, background: "#16A34A", borderRadius: "2px 2px 0 0" }} />
                              <div title={`Out: ${fmtMoney(m.out)}`} style={{ height: Math.max(2, outH), width: 18, background: "#DC2626", borderRadius: "2px 2px 0 0" }} />
                            </div>
                            <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{fmtMonthLabel(m.month)}</div>
                            <div className="text-[11px] font-semibold" style={{ color: m.net < 0 ? "#DC2626" : "#16A34A" }}>
                              {m.net < 0 ? "-" : "+"}{fmtMoney(Math.abs(m.net))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "var(--color-surface-2)" }}>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Month</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Money in</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Money out</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.months.slice().reverse().map((m) => (
                        <tr key={m.month} style={{ borderTop: "1px solid var(--color-border)" }}>
                          <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-primary)" }}>{fmtMonthLabel(m.month)}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#16A34A" }}>{m.in > 0 ? fmtMoney(m.in) : "—"}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: "#DC2626" }}>{m.out > 0 ? fmtMoney(m.out) : "—"}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: m.net < 0 ? "#DC2626" : m.net > 0 ? "#16A34A" : "var(--color-text-muted)" }}>
                            {m.net < 0 ? "-" : ""}{fmtMoney(Math.abs(m.net))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
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

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl p-12 text-center text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>{text}</div>;
}
