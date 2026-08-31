"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type EstimateLine = {
  product: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type AcceptEstimate = {
  id: string;
  estimateNumber: string;
  status?: string;
  issueDate?: string;
  expirationDate?: string;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  organizationName: string;
  contractText: string;
  lines: EstimateLine[];
};

const fmtMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AcceptEstimatePage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const token = searchParams.get("token") || "";
  const [estimate, setEstimate] = useState<AcceptEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadEstimate() {
      if (!id && !token) {
        setStatus({ type: "error", message: "Missing estimate link." });
        setLoading(false);
        return;
      }
      try {
        const query = token ? `token=${encodeURIComponent(token)}` : `id=${encodeURIComponent(id)}`;
        const res = await fetch(`/api/estimates/accept?${query}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load estimate");
        if (cancelled) return;
        setEstimate(data.estimate);
        setSignerName(data.estimate.customerName || "");
        setSignerEmail(data.estimate.customerEmail || "");
      } catch (err) {
        if (!cancelled) setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to load estimate" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadEstimate();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  async function acceptEstimate() {
    if (!estimate) return;
    setStatus(null);
    try {
      setSubmitting(true);
      const res = await fetch("/api/estimates/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: estimate.id,
          token: token || undefined,
          signerName,
          signerEmail,
          agreed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept estimate");
      setStatus({ type: "success", message: data.message || "Estimate accepted. We will contact you to schedule the work." });
      setEstimate((prev) => prev ? { ...prev, status: "accepted" } : prev);
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to accept estimate" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>{estimate?.organizationName || "HearthOS"}</div>
          <h1 className="mt-1 text-3xl font-bold">Accept Estimate</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Review the estimate and service agreement before accepting.
          </p>
        </div>

        {loading && (
          <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            Loading estimate...
          </div>
        )}

        {status && (
          <div
            className="mb-4 rounded-lg px-4 py-3 text-sm"
            style={{
              background: status.type === "error" ? "rgba(220,38,38,0.08)" : "rgba(22,163,74,0.10)",
              border: status.type === "error" ? "1px solid rgba(220,38,38,0.25)" : "1px solid rgba(22,163,74,0.25)",
              color: status.type === "error" ? "#DC2626" : "#15803D",
            }}
          >
            {status.message}
          </div>
        )}

        {estimate && (
          <section className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="p-5 flex items-start justify-between gap-4 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Estimate</div>
                <div className="mt-1 text-2xl font-bold">{estimate.estimateNumber}</div>
                <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>{estimate.customerName}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Total</div>
                <div className="mt-1 text-3xl font-bold" style={{ color: "#f8971f" }}>{fmtMoney(estimate.totalAmount)}</div>
                {estimate.status === "accepted" && <div className="mt-1 text-sm font-semibold" style={{ color: "#16A34A" }}>Accepted</div>}
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border)" }}>
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                    <tr>
                      <th className="px-3 py-2 text-left">Product/Service</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.lines.map((line, idx) => (
                      <tr key={`${line.product}-${idx}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td className="px-3 py-2 font-medium">{line.product}</td>
                        <td className="px-3 py-2 text-right">{line.quantity}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(line.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(line.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-2">Service Agreement</h2>
                <div className="rounded-lg p-4 text-sm whitespace-pre-wrap leading-6" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                  {estimate.contractText}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Accepted by</span>
                  <input
                    value={signerName}
                    onChange={(event) => setSignerName(event.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Email</span>
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={(event) => setSignerEmail(event.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1" />
                <span>I accept this estimate, agree to the service agreement, and understand AARON&apos;S FIREPLACE CO, LLC will contact me to schedule the work.</span>
              </label>

              <button
                onClick={acceptEstimate}
                disabled={submitting || estimate.status === "accepted"}
                className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#16A34A" }}
              >
                {estimate.status === "accepted" ? "Estimate Accepted" : submitting ? "Accepting..." : "Accept Estimate"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
