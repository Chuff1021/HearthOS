"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import PnlModal from "@/components/PnlModal";

type Customer = { id: string; displayName: string };
type Item = { Id: string; Name: string; FullyQualifiedName?: string; Sku?: string; UnitPrice?: number };
type Estimate = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  ExpirationDate?: string;
  PrivateNote?: string;
  BillEmail?: { Address?: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  ShipAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
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
type DraftLine = { description: string; qty: number; unitPrice: number; total: number; source?: string; itemId?: string; itemName?: string; partNumber?: string };
type EstimateLineDraft = { description: string; qty: number; unitPrice: number; amount: number; itemId?: string; itemName?: string; partNumber?: string };

function buildEstimateScheduleTitle(estimate: Estimate) {
  const firstLine = (estimate.Line || [])
    .map((line) => (line.Description || line.SalesItemLineDetail?.ItemRef?.name || "").trim())
    .find(Boolean);
  if (firstLine) {
    return `${estimate.CustomerRef?.name || "Customer"} - ${firstLine}`;
  }

  return `${estimate.CustomerRef?.name || "Customer"} - Estimate ${estimate.DocNumber || estimate.Id}`;
}

export default function EstimatesPage() {
  const searchParams = useSearchParams();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiMatchInfo, setAiMatchInfo] = useState<{ matchedProduct: string; basedOnInvoices: number; notes?: string; sourceInvoices?: Array<{ docNumber: string; customer: string; date: string; total: number; type: string }> } | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [convertingEstimateId, setConvertingEstimateId] = useState<string | null>(null);
  const [convertedMap, setConvertedMap] = useState<Record<string, string>>({});
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [savingEstimateEdits, setSavingEstimateEdits] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailEstimateId, setEmailEstimateId] = useState<string | null>(null);
  const [pnlOpen, setPnlOpen] = useState<{ id: string; label: string } | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEstimateEmail, setSendingEstimateEmail] = useState(false);
  const [estimateEditForm, setEstimateEditForm] = useState({
    expirationDate: "",
    privateNote: "",
    lines: [] as EstimateLineDraft[],
  });
  const selectedEstimateId = searchParams.get("id");
  const selectedCustomerFilterId = searchParams.get("customer");

  function getItemPartNumber(item: Item | undefined) {
    return item?.Sku || item?.FullyQualifiedName || item?.Name || "";
  }

  function mapEstimateLines(estimate: Estimate): EstimateLineDraft[] {
    return (estimate.Line || []).map((line) => ({
      description: line.Description || line.SalesItemLineDetail?.ItemRef?.name || "",
      qty: Number(line.SalesItemLineDetail?.Qty || 1),
      unitPrice: Number(line.SalesItemLineDetail?.UnitPrice || line.Amount || 0),
      amount: Number(line.Amount || 0),
      itemId: line.SalesItemLineDetail?.ItemRef?.value,
      itemName: line.SalesItemLineDetail?.ItemRef?.name,
      partNumber: line.SalesItemLineDetail?.ItemRef?.name,
    }));
  }

  function buildEstimateDocument(estimate: Estimate) {
    const lines = (estimate.Line || []).map((line) => ({
      description: line.Description || line.SalesItemLineDetail?.ItemRef?.name || "Estimate line",
      partNumber: line.SalesItemLineDetail?.ItemRef?.name || "",
      qty: Number(line.SalesItemLineDetail?.Qty || 1),
      unitPrice: Number(line.SalesItemLineDetail?.UnitPrice || line.Amount || 0),
      amount: Number(line.Amount || 0),
    }));

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${estimate.DocNumber || estimate.Id}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #111827; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
      .eyebrow { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
      h1 { margin: 6px 0 0; font-size: 30px; }
      .meta { color: #4b5563; font-size: 14px; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
      th:last-child, td:last-child { text-align: right; }
      .totals { width: 320px; margin-left: auto; margin-top: 24px; }
      .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
      .total { font-weight: 700; font-size: 18px; border-top: 2px solid #111827; margin-top: 8px; padding-top: 10px; }
      .note { margin-top: 28px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; }
      @media print { body { margin: 24px; } }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="eyebrow">Estimate</div>
        <h1>${estimate.DocNumber || estimate.Id}</h1>
      </div>
      <div class="meta">
        <div><strong>Customer:</strong> ${estimate.CustomerRef?.name || "Customer"}</div>
        <div><strong>Date:</strong> ${estimate.TxnDate || "—"}</div>
        <div><strong>Expires:</strong> ${estimate.ExpirationDate || "—"}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map((line) => `
          <tr>
            <td>${line.description}${line.partNumber ? `<div style="color:#6b7280;font-size:12px;margin-top:4px;">Part: ${line.partNumber}</div>` : ""}</td>
            <td>${line.qty}</td>
            <td>$${line.unitPrice.toFixed(2)}</td>
            <td>$${line.amount.toFixed(2)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="totals">
      <div class="total"><span>Total</span><span>$${Number(estimate.TotalAmt || 0).toFixed(2)}</span></div>
    </div>
    ${estimate.PrivateNote ? `<div class="note"><strong>Notes</strong><div style="margin-top:8px;">${estimate.PrivateNote}</div></div>` : ""}
  </body>
</html>`;
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      // Read from the local DB (same pattern as /inventory). Avoids hitting
      // the QuickBooks API on every page load. Use "Sync from QuickBooks" to
      // refresh from QB on demand.
      const [estRes, itemRes] = await Promise.all([
        fetch("/api/estimates", { cache: "no-store" }),
        fetch("/api/items/local", { cache: "no-store" }),
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

  const [syncing, setSyncing] = useState(false);
  async function syncFromQuickBooks() {
    setSyncing(true);
    setError(null);
    try {
      const res = await Promise.all([
        fetch("/api/quickbooks/sync/estimates", { method: "POST" }),
        fetch("/api/quickbooks/sync/items", { method: "POST" }),
      ]);
      for (const r of res) {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Sync failed (${r.status})`);
        }
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadAll();
    // Silently rebuild catalog if it's empty or missing model names
    fetch("/api/estimator/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
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
        const res = await fetch(`/api/customer-lookup?q=${encodeURIComponent(q)}`);
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
  const filteredEstimates = useMemo(() => {
    return estimates.filter((estimate) => !selectedCustomerFilterId || estimate.CustomerRef?.value === selectedCustomerFilterId);
  }, [estimates, selectedCustomerFilterId]);
  const selectedEstimateLines = selectedEstimate?.Line || [];

  useEffect(() => {
    if (selectedEstimateId) {
      const matchedEstimate = estimates.find((estimate) => estimate.Id === selectedEstimateId);
      if (matchedEstimate) {
        setSelectedEstimate(matchedEstimate);
        return;
      }
    }

    if (selectedCustomerFilterId && !selectedEstimateId) {
      const firstCustomerEstimate = estimates.find((estimate) => estimate.CustomerRef?.value === selectedCustomerFilterId);
      if (firstCustomerEstimate) {
        setSelectedEstimate(firstCustomerEstimate);
        return;
      }
    }

    if (selectedEstimate) {
      const refreshedEstimate = estimates.find((estimate) => estimate.Id === selectedEstimate.Id);
      if (refreshedEstimate && refreshedEstimate !== selectedEstimate) {
        setSelectedEstimate(refreshedEstimate);
        return;
      }
    }

    if (!selectedEstimateId && !selectedCustomerFilterId && estimates.length && !selectedEstimate) {
      setSelectedEstimate(estimates[0]);
    }
  }, [estimates, selectedEstimateId, selectedCustomerFilterId, selectedEstimate]);

  function printEstimate(e: Estimate) {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(buildEstimateDocument(e));
    w.document.close();
    w.focus();
    w.print();
  }

  function downloadEstimate(e: Estimate) {
    const blob = new Blob([buildEstimateDocument(e)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${e.DocNumber || e.Id}-estimate.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openEmailDialog(e: Estimate) {
    setEmailEstimateId(e.Id);
    setEmailTo(e.BillEmail?.Address || "");
    setEmailDialogOpen(true);
  }

  async function emailEstimate() {
    if (!emailEstimateId) return;
    setSendingEstimateEmail(true);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", id: emailEstimateId, email: emailTo.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to email estimate");
      setEmailDialogOpen(false);
      setEmailEstimateId(null);
      setEmailTo("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to email estimate");
    } finally {
      setSendingEstimateEmail(false);
    }
  }

  function beginEditEstimate(e: Estimate) {
    setSelectedEstimate(e);
    setEditingEstimateId(e.Id);
    setEstimateEditForm({
      expirationDate: e.ExpirationDate || "",
      privateNote: e.PrivateNote || "",
      lines: mapEstimateLines(e),
    });
  }

  function updateEstimateLine(idx: number, patch: Partial<EstimateLineDraft>) {
    setEstimateEditForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, lineIdx) => {
        if (lineIdx !== idx) return line;
        const merged = { ...line, ...patch };
        return {
          ...merged,
          qty: Number(merged.qty || 0),
          unitPrice: Number(merged.unitPrice || 0),
          amount: Number(merged.qty || 0) * Number(merged.unitPrice || 0),
        };
      }),
    }));
  }

  function addEstimateLine() {
    setEstimateEditForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { description: "", qty: 1, unitPrice: 0, amount: 0, itemId: "", partNumber: "" }],
    }));
  }

  function removeEstimateLine(idx: number) {
    setEstimateEditForm((prev) => ({
      ...prev,
      lines: prev.lines.length <= 1 ? prev.lines : prev.lines.filter((_, lineIdx) => lineIdx !== idx),
    }));
  }

  async function saveEstimateEdits() {
    if (!selectedEstimate) return;
    setSavingEstimateEdits(true);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: selectedEstimate.Id,
          updates: {
            ExpirationDate: estimateEditForm.expirationDate || undefined,
            PrivateNote: estimateEditForm.privateNote || undefined,
            Line: estimateEditForm.lines.map((line, idx) => ({
              Id: String(idx + 1),
              Amount: Number(line.amount || 0),
              DetailType: "SalesItemLineDetail",
              Description: line.partNumber ? `${line.description || ""}\nPart: ${line.partNumber}`.trim() : line.description || undefined,
              SalesItemLineDetail: {
                ItemRef: line.itemId ? { value: line.itemId, name: line.itemName } : undefined,
                Qty: Number(line.qty || 0),
                UnitPrice: Number(line.unitPrice || 0),
              },
            })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update estimate");
      setEditingEstimateId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update estimate");
    } finally {
      setSavingEstimateEdits(false);
    }
  }

  async function generateFromAI() {
    if (!prompt.trim()) return;
    setError(null);
    setAiMatchInfo(null);
    setAiGenerating(true);
    try {
      const res = await fetch("/api/estimator/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, customerName: selectedCustomerName || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI generation failed");
      if (data.lineItems && Array.isArray(data.lineItems) && data.lineItems.length > 0) {
        setDraftLines(data.lineItems.map((l: any) => ({
          description: l.partNumber ? `${l.description} (${l.partNumber})` : l.description,
          partNumber: l.partNumber,
          qty: Number(l.quantity || l.qty || 1),
          unitPrice: Number(l.unitPrice || 0),
          total: Number(l.total || 0),
          source: "historical" as const,
        })));
        if (data.matchedProduct) {
          setAiMatchInfo({
            matchedProduct: data.matchedProduct,
            basedOnInvoices: data.basedOnInvoices || 1,
            notes: data.notes,
            sourceInvoices: data.sourceInvoices || [],
          });
        }
        if (data.matchCount === 0) setError("No matching products found. Try using the model name (e.g. '42 Apex', '36 Elite').");
      } else {
        setError(data.notes || "No line items generated. Try being more specific with the model name.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate estimate");
    } finally {
      setAiGenerating(false);
    }
  }


  function assignItemPricing(idx: number, itemId: string) {
    const item = items.find((i) => i.Id === itemId);
    if (!item) return;
    setDraftLines((prev) => prev.map((l, i) => i === idx ? {
      ...l,
      itemId,
      itemName: item.Name,
      partNumber: getItemPartNumber(item),
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
        itemId: l.itemId,
        itemName: l.itemName,
        partNumber: l.partNumber,
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

      const invoiceLabel = data?.invoice?.invoiceNumber || data?.invoice?.id || "Created";
      setConvertedMap((prev) => ({ ...prev, [estimate.Id]: invoiceLabel }));

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert estimate");
    } finally {
      setConvertingEstimateId(null);
    }
  }

  function scheduleFromEstimate(estimate: Estimate) {
    const estimateAddress = [
      estimate.ShipAddr?.Line1 || estimate.BillAddr?.Line1,
      [
        estimate.ShipAddr?.City || estimate.BillAddr?.City,
        estimate.ShipAddr?.CountrySubDivisionCode || estimate.BillAddr?.CountrySubDivisionCode,
      ]
        .filter(Boolean)
        .join(", "),
      estimate.ShipAddr?.PostalCode || estimate.BillAddr?.PostalCode,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    const params = new URLSearchParams({
      create: "1",
      customerId: estimate.CustomerRef?.value || "",
      customerName: estimate.CustomerRef?.name || "",
      address: estimateAddress,
      title: buildEstimateScheduleTitle(estimate),
      amount: String(Number(estimate.TotalAmt || 0)),
      jobType: "installation",
      linkedEstimateId: estimate.Id,
      linkedDocumentNumber: estimate.DocNumber || estimate.Id,
    });
    window.location.href = `/schedule?${params.toString()}`;
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
          <div className={`max-w-[1800px] mx-auto grid grid-cols-1 ${selectedEstimate ? 'xl:grid-cols-6' : 'xl:grid-cols-4'} gap-5`}>
            <div className="xl:col-span-2 rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-3">Estimate Builder</h2>
              {error && <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.35)" }}>{error}</div>}

              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Example: build me a bid on a 42 Apex wood fireplace with timberline face and 25 feet of pipe" className="w-full px-3 py-2 rounded-lg resize-none" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              <div className="mt-3 flex gap-2 flex-wrap">
                <button onClick={generateFromAI} disabled={aiGenerating || !prompt.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 flex items-center gap-2" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)" }}>
                  {aiGenerating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                      Generating...
                    </>
                  ) : "Generate Estimate"}
                </button>
                <button onClick={() => setDraftLines((prev) => [...prev, { description: "", qty: 1, unitPrice: 0, total: 0, itemId: "", partNumber: "" }])} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  + Add Line
                </button>
              </div>

              {aiMatchInfo && (
                <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(37,99,235,0.2)" }}>
                  <div className="px-3 py-2 text-xs" style={{ background: "rgba(37,99,235,0.08)" }}>
                    <span className="font-semibold" style={{ color: "#2563EB" }}>Matched: {aiMatchInfo.matchedProduct}</span>
                    <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>· based on {aiMatchInfo.basedOnInvoices} past invoice{aiMatchInfo.basedOnInvoices !== 1 ? "s" : ""}</span>
                    {aiMatchInfo.notes && <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>· {aiMatchInfo.notes}</span>}
                  </div>
                  {aiMatchInfo.sourceInvoices && aiMatchInfo.sourceInvoices.length > 0 && (
                    <div className="px-3 py-2" style={{ background: "rgba(37,99,235,0.04)", borderTop: "1px solid rgba(37,99,235,0.15)" }}>
                      <div className="text-xs font-semibold mb-1.5" style={{ color: "#2563EB" }}>Invoices used to build this estimate</div>
                      <div className="grid gap-1">
                        {aiMatchInfo.sourceInvoices.map((inv, i) => (
                          <div key={i} className="grid text-xs" style={{ gridTemplateColumns: "80px 1fr 80px", gap: "8px", color: "var(--color-text-muted)" }}>
                            <span className="font-mono font-semibold" style={{ color: "var(--color-text)" }}>#{inv.docNumber}</span>
                            <span className="truncate">{inv.customer}</span>
                            <span className="text-right">{inv.date ? new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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

              {/* QuickBooks-style estimate table */}
              <div className="mt-5 rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                {/* Table header */}
                <div className="grid grid-cols-[1fr_60px_90px_90px_36px] gap-0 px-4 py-2.5" style={{ background: "#2CA01C", color: "#fff" }}>
                  <div className="text-xs font-bold uppercase">Product / Service</div>
                  <div className="text-xs font-bold uppercase text-right">Qty</div>
                  <div className="text-xs font-bold uppercase text-right">Rate</div>
                  <div className="text-xs font-bold uppercase text-right">Amount</div>
                  <div></div>
                </div>
                {/* Table rows */}
                {draftLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_60px_90px_90px_36px] gap-0 px-4 py-2 items-center" style={{ background: idx % 2 === 0 ? "var(--color-surface-1)" : "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
                    <div className="pr-3 min-w-0">
                      <input className="w-full text-sm font-medium outline-none rounded px-1" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} style={{ color: "#111827", background: "transparent" }} />
                      {line.partNumber && <div className="text-[10px] mt-0.5 px-1" style={{ color: "#6b7280" }}>Part #: {line.partNumber}</div>}
                    </div>
                    <input type="number" className="w-full text-sm text-right bg-transparent outline-none" value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value || 0) })} style={{ color: "var(--color-text-primary)" }} />
                    <input type="number" step="0.01" className="w-full text-sm text-right bg-transparent outline-none" value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value || 0) })} style={{ color: "var(--color-text-primary)" }} />
                    <div className="text-sm font-semibold text-right" style={{ color: "var(--color-text-primary)" }}>${line.total.toFixed(2)}</div>
                    <button onClick={() => setDraftLines((prev) => prev.length <= 1 ? prev : prev.filter((_, lineIdx) => lineIdx !== idx))} className="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Totals — right-aligned like QuickBooks */}
              <div className="mt-4 flex justify-end">
                <div className="w-64 space-y-2" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--color-text-muted)" }}>Subtotal</span>
                    <span style={{ color: "var(--color-text-primary)" }}>${draftTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--color-text-muted)" }}>Tax</span>
                    <span style={{ color: "var(--color-text-primary)" }}>Included in line items</span>
                  </div>
                  <div className="flex justify-between pt-2" style={{ borderTop: "2px solid var(--color-border)" }}>
                    <span className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>TOTAL</span>
                    <span className="text-base font-bold" style={{ color: "#2CA01C" }}>${draftTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button disabled={saving} onClick={saveEstimateToQuickBooks} className="mt-4 w-full py-2.5 rounded-lg text-white font-semibold" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving to QuickBooks..." : "Save Estimate to QuickBooks"}
              </button>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Estimates</h2>
                <button
                  onClick={syncFromQuickBooks}
                  disabled={syncing}
                  className="text-[11px] px-2 py-1 rounded transition-colors"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                    background: "var(--color-surface-2)",
                    opacity: syncing ? 0.6 : 1,
                  }}
                >
                  {syncing ? "Syncing…" : "Sync from QuickBooks"}
                </button>
              </div>
              {loading ? <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</p> : (
                <div className="space-y-2 max-h-[680px] overflow-auto pr-1">
                  {filteredEstimates.map((e) => (
                    <div
                      key={e.Id}
                      onClick={() => setSelectedEstimate(e)}
                      className="w-full text-left p-3 rounded-lg cursor-pointer"
                      style={{
                        background: "var(--color-surface-3)",
                        border: `1px solid ${selectedEstimate?.Id === e.Id ? "rgba(37,99,235,0.35)" : "var(--color-border)"}`,
                        boxShadow: selectedEstimate?.Id === e.Id ? "0 0 0 1px rgba(37,99,235,0.15) inset" : "none",
                      }}
                    >
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{e.DocNumber || `Estimate ${e.Id}`}</div>
                      <div className="text-sm font-semibold">{e.CustomerRef?.name || "Customer"}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{e.TxnDate || "—"}</div>
                      <div className="text-sm font-semibold mt-1">${Number(e.TotalAmt || 0).toFixed(2)}</div>
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        <button onClick={(event) => { event.stopPropagation(); openEmailDialog(e); }} className="py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>Email</button>
                        <button onClick={(event) => { event.stopPropagation(); printEstimate(e); }} className="py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>Print</button>
                        <button onClick={(event) => { event.stopPropagation(); downloadEstimate(e); }} className="py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>Download</button>
                        <button onClick={(event) => { event.stopPropagation(); beginEditEstimate(e); }} className="py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>Edit</button>
                        <button onClick={(event) => { event.stopPropagation(); setPnlOpen({ id: e.Id, label: e.DocNumber || e.Id }); }} className="py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(248,151,31,0.12)", color: "#9a5d12", border: "1px solid rgba(248,151,31,0.25)" }}>P&amp;L</button>
                        <button onClick={(event) => { event.stopPropagation(); scheduleFromEstimate(e); }} className="py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.25)" }}>Schedule</button>
                      </div>

                      {convertedMap[e.Id] ? (
                        <div className="mt-2 space-y-1">
                          <div className="w-full py-1.5 rounded-lg text-xs font-semibold text-center" style={{ background: "rgba(152,205,0,0.15)", color: "#98CD00", border: "1px solid rgba(152,205,0,0.35)" }}>
                            Converted ✓ {convertedMap[e.Id]}
                          </div>
                          <a
                            href={`/invoices`}
                            className="block w-full py-1.5 rounded-lg text-xs font-semibold text-center"
                            style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                          >
                            View Invoices
                          </a>
                        </div>
                      ) : (
                        <button
                          onClick={(event) => { event.stopPropagation(); convertEstimateToInvoice(e); }}
                          disabled={convertingEstimateId === e.Id}
                          className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold text-white"
                          style={{ background: "linear-gradient(135deg, #f8971f, #f8971f)", opacity: convertingEstimateId === e.Id ? 0.7 : 1 }}
                        >
                          {convertingEstimateId === e.Id ? "Converting..." : "Convert to Invoice"}
                        </button>
                      )}
                    </div>
                  ))}
                  {filteredEstimates.length === 0 && (
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No estimates found for this customer.</p>
                  )}
                </div>
              )}
            </div>

            <div className={`rounded-xl p-5 ${selectedEstimate ? 'xl:col-span-3' : ''}`} style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              {!selectedEstimate ? (
                <>
                  <h2 className="font-semibold mb-3">Estimate Details</h2>
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select an estimate to review its lines and totals.</p>
                </>
              ) : (
                <div className="space-y-5">
                  {/* Header strip: doc number + customer + dates + actions */}
                  <div className="flex items-start justify-between gap-3" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 16 }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm" style={{ color: "var(--color-text-muted)" }}>{selectedEstimate.DocNumber || `Estimate ${selectedEstimate.Id}`}</span>
                        {convertedMap[selectedEstimate.Id] && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}>Converted</span>
                        )}
                      </div>
                      <div className="text-lg font-semibold mt-0.5" style={{ color: "var(--color-text-primary)" }}>{selectedEstimate.CustomerRef?.name || "Customer"}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {selectedEstimate.TxnDate && <span>Issued: {selectedEstimate.TxnDate}</span>}
                        {selectedEstimate.ExpirationDate && <span>Expires: {selectedEstimate.ExpirationDate}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {editingEstimateId === selectedEstimate.Id ? (
                        <>
                          <button onClick={saveEstimateEdits} disabled={savingEstimateEdits} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#2563EB", opacity: savingEstimateEdits ? 0.7 : 1 }}>
                            {savingEstimateEdits ? "Saving..." : "Save"}
                          </button>
                          <button onClick={() => setEditingEstimateId(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setPnlOpen({ id: selectedEstimate.Id, label: selectedEstimate.DocNumber || selectedEstimate.Id })}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: "rgba(248,151,31,0.12)", color: "#9a5d12", border: "1px solid rgba(248,151,31,0.25)" }}
                          >
                            P&amp;L
                          </button>
                          <button onClick={() => beginEditEstimate(selectedEstimate)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    <button onClick={() => openEmailDialog(selectedEstimate)} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>Email</button>
                    <button onClick={() => printEstimate(selectedEstimate)} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>Print</button>
                    <button onClick={() => downloadEstimate(selectedEstimate)} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>Download</button>
                    <button onClick={() => scheduleFromEstimate(selectedEstimate)} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.25)" }}>Schedule</button>
                    {!convertedMap[selectedEstimate.Id] && (
                      <button onClick={() => convertEstimateToInvoice(selectedEstimate)} disabled={convertingEstimateId === selectedEstimate.Id} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)", opacity: convertingEstimateId === selectedEstimate.Id ? 0.7 : 1 }}>
                        {convertingEstimateId === selectedEstimate.Id ? "Converting…" : "Convert"}
                      </button>
                    )}
                  </div>

                  {editingEstimateId === selectedEstimate.Id && (
                    <div>
                      <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Expiration date</label>
                      <input
                        type="date"
                        value={estimateEditForm.expirationDate}
                        onChange={(event) => setEstimateEditForm((prev) => ({ ...prev, expirationDate: event.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    {(editingEstimateId === selectedEstimate.Id ? estimateEditForm.lines : selectedEstimateLines).map((line: any, idx) => (
                      <div key={`${selectedEstimate.Id}-${idx}`} className="rounded-lg p-3" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                        {editingEstimateId === selectedEstimate.Id ? (
                          <div className="space-y-2">
                            <select
                              value={estimateEditForm.lines[idx]?.itemId || ""}
                              onChange={(event) => {
                                const item = items.find((entry) => entry.Id === event.target.value);
                                updateEstimateLine(idx, {
                                  itemId: event.target.value || undefined,
                                  itemName: item?.Name,
                                  partNumber: getItemPartNumber(item),
                                  description: item?.Name || estimateEditForm.lines[idx]?.description || "",
                                  unitPrice: Number(item?.UnitPrice || estimateEditForm.lines[idx]?.unitPrice || 0),
                                });
                              }}
                              className="w-full px-3 py-2 rounded-lg text-sm"
                              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                            >
                                <option value="">Map item (optional)</option>
                                {items.map((item) => (
                                  <option key={item.Id} value={item.Id}>{item.Name} · {getItemPartNumber(item)}</option>
                                ))}
                              </select>
                            <input
                              value={estimateEditForm.lines[idx]?.description || ""}
                              onChange={(event) => updateEstimateLine(idx, { description: event.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm"
                              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                            />
                            <input
                              value={estimateEditForm.lines[idx]?.partNumber || ""}
                              onChange={(event) => updateEstimateLine(idx, { partNumber: event.target.value })}
                              placeholder="Part number"
                              className="w-full px-3 py-2 rounded-lg text-sm"
                              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                            />
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="number"
                                min={0}
                                value={estimateEditForm.lines[idx]?.qty || 0}
                                onChange={(event) => updateEstimateLine(idx, { qty: Number(event.target.value || 0) })}
                                className="px-3 py-2 rounded-lg text-sm"
                                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                              />
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={estimateEditForm.lines[idx]?.unitPrice || 0}
                                onChange={(event) => updateEstimateLine(idx, { unitPrice: Number(event.target.value || 0) })}
                                className="px-3 py-2 rounded-lg text-sm"
                                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                              />
                              <button onClick={() => removeEstimateLine(idx)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E" }}>
                                Remove
                              </button>
                            </div>
                            <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                              ${Number(estimateEditForm.lines[idx]?.amount || 0).toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                              {line.Description || line.SalesItemLineDetail?.ItemRef?.name || "Estimate line"}
                            </div>
                            {line.SalesItemLineDetail?.ItemRef?.name && (
                              <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                                Part: {line.SalesItemLineDetail.ItemRef.name}
                              </div>
                            )}
                            <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                              {Number(line.SalesItemLineDetail?.Qty || 1)} x ${Number(line.SalesItemLineDetail?.UnitPrice || line.Amount || 0).toFixed(2)}
                            </div>
                            <div className="text-sm font-semibold mt-2" style={{ color: "var(--color-text-primary)" }}>
                              ${Number(line.Amount || 0).toFixed(2)}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {(editingEstimateId === selectedEstimate.Id ? estimateEditForm.lines.length : selectedEstimateLines.length) === 0 && (
                      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No estimate lines found.</p>
                    )}
                    {editingEstimateId === selectedEstimate.Id && (
                      <button onClick={addEstimateLine} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                        Add Line
                      </button>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)" }}>NOTES</div>
                    {editingEstimateId === selectedEstimate.Id ? (
                      <textarea
                        rows={4}
                        value={estimateEditForm.privateNote}
                        onChange={(event) => setEstimateEditForm((prev) => ({ ...prev, privateNote: event.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                      />
                    ) : (
                      <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{selectedEstimate.PrivateNote || "No notes on this estimate."}</div>
                    )}
                  </div>

                  <div className="pt-3" style={{ borderTop: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total</span>
                      <span className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
                        ${Number(editingEstimateId === selectedEstimate.Id
                          ? estimateEditForm.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
                          : selectedEstimate.TotalAmt || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {emailDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEmailDialogOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>Email Estimate</h2>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              This sends the estimate through QuickBooks using the selected customer email or the address you enter here.
            </p>
            <input
              value={emailTo}
              onChange={(event) => setEmailTo(event.target.value)}
              placeholder="customer@email.com"
              className="mt-4 w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={emailEstimate}
                disabled={sendingEstimateEmail}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: "#2563EB", opacity: sendingEstimateEmail ? 0.7 : 1 }}
              >
                {sendingEstimateEmail ? "Sending..." : "Send from QuickBooks"}
              </button>
              <button
                onClick={() => setEmailDialogOpen(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pnlOpen && (
        <PnlModal type="estimate" id={pnlOpen.id} docLabel={pnlOpen.label} onClose={() => setPnlOpen(null)} />
      )}
    </div>
  );
}
