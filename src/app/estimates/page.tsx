"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Customer = { id: string; displayName: string };
type Item = { Id: string; Name: string; UnitPrice?: number };
type Estimate = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  ExpirationDate?: string;
  CustomerRef?: { value?: string; name?: string };
  Line?: Array<{
    Amount?: number;
    Description?: string;
    SalesItemLineDetail?: {
      ItemRef?: { value?: string; name?: string };
      Qty?: number;
      UnitPrice?: number;
    };
  }>;
  TotalAmt?: number;
};
type DraftLine = { description: string; qty: number; unitPrice: number; total: number; source?: string };

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [convertingEstimateId, setConvertingEstimateId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [estRes, itemRes] = await Promise.all([
        fetch("/api/quickbooks/estimates"),
        fetch("/api/quickbooks/items?sync=true"),
      ]);
      const estData = await estRes.json();
      const itemData = await itemRes.json();
      if (!estRes.ok) throw new Error(estData.error || "Failed estimates load");
      if (!itemRes.ok) throw new Error(itemData.error || "Failed items load");
      setEstimates(estData.estimates || []);
      setItems(itemData.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load estimates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quickbooks/customers?q=${encodeURIComponent(q)}&live=true`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "lookup failed");
        setCustomerResults((data.customers || []).map((c: any) => ({ id: c.id, displayName: c.displayName })));
      } catch {
        if (!cancelled) setCustomerResults([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customerQuery]);

  const draftTotal = useMemo(() => draftLines.reduce((s, l) => s + l.total, 0), [draftLines]);

  async function generateFromAI() {
    if (!prompt.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/estimator/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI generation failed");
      setDraftLines((data.draftEstimate?.lines || []).map((l: any) => ({
        description: l.description,
        qty: Number(l.qty || 1),
        unitPrice: Number(l.unitPrice || 0),
        total: Number(l.total || 0),
        source: l.source,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate draft estimate");
    }
  }

  function assignItemPricing(idx: number, itemId: string) {
    const item = items.find((i) => i.Id === itemId);
    if (!item) return;
    setDraftLines((prev) => prev.map((l, i) => i === idx ? {
      ...l,
      description: l.description || item.Name,
      unitPrice: Number(item.UnitPrice || l.unitPrice || 0),
      total: Number(l.qty || 1) * Number(item.UnitPrice || l.unitPrice || 0),
    } : l));
  }

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setDraftLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const merged = { ...l, ...patch };
      return { ...merged, total: Number(merged.qty || 0) * Number(merged.unitPrice || 0) };
    }));
  }

  async function saveEstimateToQuickBooks() {
    if (!selectedCustomerId) return setError("Select a QuickBooks customer first.");
    if (draftLines.length === 0) return setError("Generate or add at least one line item.");

    setSaving(true);
    setError(null);
    try {
      const lines = draftLines.map((l) => ({
        description: l.description,
        qty: Number(l.qty || 0),
        unitPrice: Number(l.unitPrice || 0),
        amount: Number(l.qty || 0) * Number(l.unitPrice || 0),
      }));

      const res = await fetch("/api/quickbooks/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          note: prompt || undefined,
          lines,
          expirationDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save estimate to QuickBooks");

      await loadAll();
      setPrompt("");
      setDraftLines([]);
      setCustomerQuery("");
      setCustomerResults([]);
      setSelectedCustomerId("");
      setSelectedCustomerName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save estimate");
    } finally {
      setSaving(false);
    }
  }

  async function convertEstimateToInvoice(estimate: Estimate) {
    if (!estimate.CustomerRef?.value) {
      setError("Cannot convert: estimate is missing QuickBooks customer reference.");
      return;
    }

    const lines = (estimate.Line || [])
      .map((l) => ({
        Amount: Number(l.Amount || 0),
        DetailType: "SalesItemLineDetail" as const,
        Description: l.Description || l.SalesItemLineDetail?.ItemRef?.name || "Line Item",
        SalesItemLineDetail: {
          ItemRef: l.SalesItemLineDetail?.ItemRef?.value
            ? { value: l.SalesItemLineDetail.ItemRef.value, name: l.SalesItemLineDetail.ItemRef.name }
            : undefined,
          Qty: Number(l.SalesItemLineDetail?.Qty || 1),
          UnitPrice: Number(l.SalesItemLineDetail?.UnitPrice || l.Amount || 0),
        },
      }))
      .filter((l) => l.Amount > 0);

    if (lines.length === 0) {
      setError("Cannot convert: estimate has no invoiceable lines.");
      return;
    }

    setConvertingEstimateId(estimate.Id);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          CustomerRef: estimate.CustomerRef,
          TxnDate: new Date().toISOString().split("T")[0],
          PrivateNote: `Converted from Estimate ${estimate.DocNumber || estimate.Id}`,
          Line: lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to convert estimate to invoice");

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert estimate");
    } finally {
      setConvertingEstimateId(null);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Estimates</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>AI draft builder with QuickBooks save</p>
          </div>
          <button onClick={loadAll} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>Refresh</button>
        </div>

        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-3">AI Estimator</h2>
              {error && <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.35)" }}>{error}</div>}

              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Example: build me a bid on a 42 Apex wood fireplace with timberline face and 25 feet of pipe" className="w-full px-3 py-2 rounded-lg resize-none" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              <button onClick={generateFromAI} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}>Generate Draft</button>

              <div className="mt-5">
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>QuickBooks Customer</label>
                <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Search QB customer" className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                {customerResults.length > 0 && (
                  <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    {customerResults.slice(0, 6).map((c) => (
                      <button key={c.id} onClick={() => { setSelectedCustomerId(c.id); setSelectedCustomerName(c.displayName); setCustomerQuery(c.displayName); setCustomerResults([]); }} className="w-full text-left px-3 py-2 text-sm" style={{ borderBottom: "1px solid var(--color-border)" }}>
                        {c.displayName}
                      </button>
                    ))}
                  </div>
                )}
                {selectedCustomerId && <p className="text-xs mt-1" style={{ color: "#98CD00" }}>Selected: {selectedCustomerName}</p>}
              </div>

              <div className="mt-5 space-y-2">
                {draftLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select className="col-span-3 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} onChange={(e) => assignItemPricing(idx, e.target.value)}>
                      <option value="">Map Item (optional)</option>
                      {items.map((it) => <option key={it.Id} value={it.Id}>{it.Name}</option>)}
                    </select>
                    <input className="col-span-5 px-2 py-2 rounded-lg text-sm" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                    <input type="number" className="col-span-1 px-2 py-2 rounded-lg text-sm" value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value || 0) })} style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                    <input type="number" step="0.01" className="col-span-2 px-2 py-2 rounded-lg text-sm" value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value || 0) })} style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                    <div className="col-span-1 text-sm font-semibold flex items-center justify-end">${line.total.toFixed(0)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>Draft total</div>
                <div className="text-lg font-bold">${draftTotal.toFixed(2)}</div>
              </div>

              <button disabled={saving} onClick={saveEstimateToQuickBooks} className="mt-4 w-full py-2.5 rounded-lg text-white font-semibold" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving to QuickBooks..." : "Save Estimate to QuickBooks"}
              </button>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-3">QuickBooks Estimates</h2>
              {loading ? <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</p> : (
                <div className="space-y-2 max-h-[680px] overflow-auto pr-1">
                  {estimates.map((e) => (
                    <div key={e.Id} className="p-3 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{e.DocNumber || `Estimate ${e.Id}`}</div>
                      <div className="text-sm font-semibold">{e.CustomerRef?.name || "Customer"}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{e.TxnDate || "—"}</div>
                      <div className="text-sm font-semibold mt-1">${Number(e.TotalAmt || 0).toFixed(2)}</div>
                      <button
                        onClick={() => convertEstimateToInvoice(e)}
                        disabled={convertingEstimateId === e.Id}
                        className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold text-white"
                        style={{ background: "linear-gradient(135deg, #FF4400, #FF4400)", opacity: convertingEstimateId === e.Id ? 0.7 : 1 }}
                      >
                        {convertingEstimateId === e.Id ? "Converting..." : "Convert to Invoice"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
