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
      ItemRef?: { value?: string; name?: string; sku?: string };
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
  const [deletingEstimateId, setDeletingEstimateId] = useState<string | null>(null);
  const [convertedMap, setConvertedMap] = useState<Record<string, string>>({});
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [savingEstimateEdits, setSavingEstimateEdits] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailEstimateId, setEmailEstimateId] = useState<string | null>(null);
  const [pnlOpen, setPnlOpen] = useState<{ id: string; label: string } | null>(null);
  const [focusedEstimateItemLine, setFocusedEstimateItemLine] = useState<number | null>(null);
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

  function normalizeItemLookup(value: string | undefined) {
    return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cleanLineDescription(description: string | undefined, partNumber: string | undefined) {
    let cleaned = (description || "").replace(/\n\s*Part:\s*.+$/i, "").trim();
    const part = (partNumber || "").trim();
    if (part) {
      cleaned = cleaned
        .replace(new RegExp(`\\s*\\(${escapeRegExp(part)}\\)\\s*$`, "i"), "")
        .replace(new RegExp(`^${escapeRegExp(part)}\\s*-\\s*`, "i"), "")
        .trim();
    }
    return cleaned;
  }

  function getLineProductService(line: NonNullable<Estimate["Line"]>[number]) {
    const itemRef = line.SalesItemLineDetail?.ItemRef;
    return extractPartNumber(line.Description) || itemRef?.name || "";
  }

  function getLineSku(line: NonNullable<Estimate["Line"]>[number]) {
    const itemRef = line.SalesItemLineDetail?.ItemRef;
    return itemRef?.sku || itemRef?.name || extractPartNumber(line.Description) || "";
  }

  function extractPartNumber(description: string | undefined) {
    const text = (description || "").trim();
    const partLine = text.match(/\n\s*Part:\s*([^\n]+)/i);
    if (partLine?.[1]) return partLine[1].trim();
    const prefix = text.match(/^([A-Z0-9][A-Z0-9:._/-]{2,})\s+-\s+/i);
    return prefix?.[1]?.trim() || "";
  }

  function getLineDescription(line: NonNullable<Estimate["Line"]>[number]) {
    const part = getLineProductService(line);
    return cleanLineDescription(line.Description || line.SalesItemLineDetail?.ItemRef?.name || "Estimate line", part);
  }

  function resolveDraftLineItem(line: DraftLine) {
    const partKey = normalizeItemLookup(line.partNumber);
    const exactPartName = partKey ? items.find((item) => normalizeItemLookup(item.Name) === partKey) : undefined;
    if (exactPartName) return exactPartName;

    if (line.itemId) return items.find((item) => item.Id === line.itemId);

    const exactPartSku = partKey ? items.find((item) => normalizeItemLookup(item.Sku) === partKey) : undefined;
    if (exactPartSku) return exactPartSku;

    const nameKey = normalizeItemLookup(line.itemName || line.description);
    if (!partKey && !nameKey) return undefined;

    return items.find((item) => {
      const itemKeys = [
        item.Sku,
        item.Name,
        item.FullyQualifiedName,
      ].map(normalizeItemLookup);

      return (partKey && itemKeys.includes(partKey)) || (nameKey && itemKeys.includes(nameKey));
    });
  }

  function mapEstimateLines(estimate: Estimate): EstimateLineDraft[] {
    return (estimate.Line || []).map((line) => ({
      description: getLineDescription(line),
      qty: Number(line.SalesItemLineDetail?.Qty || 1),
      unitPrice: Number(line.SalesItemLineDetail?.UnitPrice || line.Amount || 0),
      amount: Number(line.Amount || 0),
      itemId: line.SalesItemLineDetail?.ItemRef?.value,
      itemName: line.SalesItemLineDetail?.ItemRef?.name,
      partNumber: getLineProductService(line),
    }));
  }

  function getItemSearchResults(query: string) {
    const normalizedQuery = normalizeItemLookup(query);
    if (normalizedQuery.length < 2) return [];

    return items
      .filter((item) => {
        const searchable = [
          item.Name,
          item.Sku,
          item.FullyQualifiedName,
        ].map(normalizeItemLookup);

        return searchable.some((value) => value.includes(normalizedQuery));
      })
      .slice(0, 8);
  }

  function buildEstimateDocument(estimate: Estimate) {
    const lines = (estimate.Line || []).map((line) => ({
      productService: getLineProductService(line),
      sku: getLineSku(line),
      description: getLineDescription(line),
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
          <th>Product/service</th>
          <th>SKU</th>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map((line) => `
          <tr>
            <td>${line.productService}</td>
            <td>${line.sku}</td>
            <td>${line.description}</td>
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
  const activeCustomerFilterId = selectedCustomerId || selectedCustomerFilterId || "";
  const activeCustomerFilterName = selectedCustomerName || customers.find((customer) => customer.id === selectedCustomerFilterId)?.displayName || "";
  const filteredEstimates = useMemo(() => {
    return estimates.filter((estimate) => !activeCustomerFilterId || estimate.CustomerRef?.value === activeCustomerFilterId);
  }, [estimates, activeCustomerFilterId]);
  const selectedEstimateLines = selectedEstimate?.Line || [];

  useEffect(() => {
    if (selectedEstimateId) {
      const matchedEstimate = estimates.find((estimate) => estimate.Id === selectedEstimateId);
      if (matchedEstimate) {
        setSelectedEstimate(matchedEstimate);
        return;
      }
    }

    if (activeCustomerFilterId && !selectedEstimateId) {
      const firstCustomerEstimate = estimates.find((estimate) => estimate.CustomerRef?.value === activeCustomerFilterId);
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

    if (!selectedEstimateId && !activeCustomerFilterId && estimates.length && !selectedEstimate) {
      setSelectedEstimate(estimates[0]);
    }
  }, [estimates, selectedEstimateId, activeCustomerFilterId, selectedEstimate]);

  useEffect(() => {
    if (!activeCustomerFilterId) return;
    if (selectedEstimate?.CustomerRef?.value === activeCustomerFilterId) return;
    setSelectedEstimate(filteredEstimates[0] || null);
  }, [activeCustomerFilterId, filteredEstimates, selectedEstimate]);

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
    setFocusedEstimateItemLine(null);
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

  function selectEstimateLineItem(idx: number, item: Item) {
    setEstimateEditForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, lineIdx) => {
        if (lineIdx !== idx) return line;
        const partNumber = getItemPartNumber(item);
        const unitPrice = Number(item.UnitPrice || line.unitPrice || 0);
        const description = !line.description || line.description === line.itemName || line.description === line.partNumber
          ? item.Name
          : line.description;

        return {
          ...line,
          itemId: item.Id,
          itemName: item.Name,
          partNumber,
          description,
          unitPrice,
          amount: Number(line.qty || 0) * unitPrice,
        };
      }),
    }));
    setFocusedEstimateItemLine(null);
  }

  function addEstimateLine() {
    setEstimateEditForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { description: "", qty: 1, unitPrice: 0, amount: 0, itemId: "", partNumber: "" }],
    }));
  }

  function insertEstimateLineAfter(idx: number) {
    setEstimateEditForm((prev) => ({
      ...prev,
      lines: [
        ...prev.lines.slice(0, idx + 1),
        { description: "", qty: 1, unitPrice: 0, amount: 0, itemId: "", partNumber: "" },
        ...prev.lines.slice(idx + 1),
      ],
    }));
    setFocusedEstimateItemLine(idx + 1);
  }

  function removeEstimateLine(idx: number) {
    setFocusedEstimateItemLine(null);
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
            Line: estimateEditForm.lines.map((line, idx) => {
              const partNumber = (line.partNumber || "").trim();
              const description = cleanLineDescription(line.description, partNumber);
              return {
                Id: String(idx + 1),
                Amount: Number(line.amount || 0),
                DetailType: "SalesItemLineDetail",
                Description: partNumber ? `${partNumber}${description ? ` - ${description}` : ""}` : description || undefined,
                SalesItemLineDetail: {
                  ItemRef: line.itemId ? { value: line.itemId, name: partNumber || line.itemName } : undefined,
                  Qty: Number(line.qty || 0),
                  UnitPrice: Number(line.unitPrice || 0),
                },
              };
            }),
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
          description: cleanLineDescription(l.description, l.partNumber),
          partNumber: l.partNumber,
          itemId: l.itemId,
          itemName: l.itemName,
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
      const lines = draftLines.map((l) => {
        const resolvedItem = resolveDraftLineItem(l);
        return {
          description: l.description,
          itemId: l.itemId || resolvedItem?.Id,
          itemName: l.itemName || resolvedItem?.Name,
          partNumber: l.partNumber,
          qty: Number(l.qty || 0),
          unitPrice: Number(l.unitPrice || 0),
          amount: Number(l.qty || 0) * Number(l.unitPrice || 0),
        };
      });

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

  async function deleteEstimate(estimate: Estimate) {
    if (!window.confirm(`Delete estimate ${estimate.DocNumber || estimate.Id}? This also deletes it from QuickBooks.`)) return;

    setDeletingEstimateId(estimate.Id);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: estimate.Id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete estimate");

      setEstimates((prev) => prev.filter((entry) => entry.Id !== estimate.Id));
      if (selectedEstimate?.Id === estimate.Id) setSelectedEstimate(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete estimate");
    } finally {
      setDeletingEstimateId(null);
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
          <div className="max-w-[1900px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
            <section className="min-w-0 space-y-5">
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <div className="px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <div>
                    <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>New Estimate</h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Build the draft, confirm the QuickBooks customer, then save.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[11px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Draft Total</div>
                      <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>${draftTotal.toFixed(2)}</div>
                    </div>
                    <button disabled={saving} onClick={saveEstimateToQuickBooks} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "#2563EB", opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Saving..." : "Save to QuickBooks"}
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {error && <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.35)" }}>{error}</div>}

                  <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4">
                    <div className="relative">
                      <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>QuickBooks Customer</label>
                      <input
                        value={customerQuery}
                        onChange={(e) => {
                          setCustomerQuery(e.target.value);
                          if (selectedCustomerId && e.target.value !== selectedCustomerName) {
                            setSelectedCustomerId("");
                            setSelectedCustomerName("");
                          }
                        }}
                        placeholder="Search customer"
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                      />
                      {customerResults.length > 0 && (
                        <div className="absolute z-20 mt-2 w-full rounded-lg overflow-hidden shadow-xl" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-1)" }}>
                          {customerResults.slice(0, 6).map((c) => (
                            <button key={c.id} onClick={() => { setSelectedCustomerId(c.id); setSelectedCustomerName(c.displayName); setCustomerQuery(c.displayName); setCustomerResults([]); }} className="w-full text-left px-3 py-2 text-sm" style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                              {c.displayName}
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedCustomerId && (
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-xs" style={{ color: "#16A34A" }}>Selected: {selectedCustomerName}</p>
                          <button
                            onClick={() => {
                              setSelectedCustomerId("");
                              setSelectedCustomerName("");
                              setCustomerQuery("");
                              setCustomerResults([]);
                            }}
                            className="text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Job / AI Prompt</label>
                      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Example: build me a bid on a 42 Apex wood fireplace with timberline face and 25 feet of pipe" className="w-full px-3 py-2 rounded-lg resize-none text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button onClick={generateFromAI} disabled={aiGenerating || !prompt.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 flex items-center gap-2" style={{ background: "#F8971F" }}>
                      {aiGenerating ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                          Generating...
                        </>
                      ) : "Generate Estimate"}
                    </button>
                    <button onClick={() => setDraftLines((prev) => [...prev, { description: "", qty: 1, unitPrice: 0, total: 0, itemId: "", partNumber: "" }])} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                      Add Line
                    </button>
                  </div>

                  {aiMatchInfo && (
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(37,99,235,0.18)" }}>
                      <div className="px-3 py-2 text-xs" style={{ background: "rgba(37,99,235,0.07)" }}>
                        <span className="font-semibold" style={{ color: "#2563EB" }}>Matched: {aiMatchInfo.matchedProduct}</span>
                        <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>based on {aiMatchInfo.basedOnInvoices} past invoice{aiMatchInfo.basedOnInvoices !== 1 ? "s" : ""}</span>
                        {aiMatchInfo.notes && <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>{aiMatchInfo.notes}</span>}
                      </div>
                      {aiMatchInfo.sourceInvoices && aiMatchInfo.sourceInvoices.length > 0 && (
                        <div className="px-3 py-2 grid grid-cols-1 md:grid-cols-2 gap-1.5" style={{ background: "rgba(37,99,235,0.03)", borderTop: "1px solid rgba(37,99,235,0.12)" }}>
                          {aiMatchInfo.sourceInvoices.slice(0, 6).map((inv, i) => (
                            <div key={i} className="grid text-xs" style={{ gridTemplateColumns: "74px 1fr 70px", gap: "8px", color: "var(--color-text-muted)" }}>
                              <span className="font-mono font-semibold" style={{ color: "var(--color-text-primary)" }}>#{inv.docNumber}</span>
                              <span className="truncate">{inv.customer}</span>
                              <span className="text-right">{inv.date ? new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid var(--color-border)" }}>
                    <div className="min-w-[1040px]">
                      <div className="grid grid-cols-[44px_190px_170px_minmax(320px,1fr)_64px_92px_104px_40px] gap-0 px-3 py-2.5" style={{ background: "#f5f6f8", color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border)" }}>
                        <div className="text-xs font-bold text-right">#</div>
                        <div className="text-xs font-bold">Product/service</div>
                        <div className="text-xs font-bold">QuickBooks item</div>
                        <div className="text-xs font-bold">Description</div>
                        <div className="text-xs font-bold text-right">Qty</div>
                        <div className="text-xs font-bold text-right">Rate</div>
                        <div className="text-xs font-bold text-right">Amount</div>
                        <div></div>
                      </div>
                      {draftLines.map((line, idx) => (
                        <div key={idx} className="grid grid-cols-[44px_190px_170px_minmax(320px,1fr)_64px_92px_104px_40px] gap-0 px-3 py-2.5 items-start" style={{ background: idx % 2 === 0 ? "var(--color-surface-1)" : "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
                          <div className="text-sm text-right pt-1.5" style={{ color: "var(--color-text-muted)" }}>{idx + 1}</div>
                          <input className="w-full text-sm outline-none rounded px-2 py-1.5 font-semibold" value={line.partNumber || ""} onChange={(e) => updateLine(idx, { partNumber: e.target.value })} placeholder="Part number" style={{ color: "var(--color-text-primary)", background: "transparent" }} />
                          <div className="text-sm px-2 py-1.5 truncate" title={line.itemName || line.partNumber || ""} style={{ color: "var(--color-text-muted)" }}>{line.itemName || line.partNumber || ""}</div>
                          <textarea className="w-full text-sm outline-none rounded px-2 py-1.5 resize-none" rows={2} value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} style={{ color: "var(--color-text-primary)", background: "transparent" }} />
                          <input type="number" className="w-full text-sm text-right bg-transparent outline-none px-1 py-1.5" value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value || 0) })} style={{ color: "var(--color-text-primary)" }} />
                          <input type="number" step="0.01" className="w-full text-sm text-right bg-transparent outline-none px-1 py-1.5" value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value || 0) })} style={{ color: "var(--color-text-primary)" }} />
                          <div className="text-sm font-semibold text-right px-1 py-1.5" style={{ color: "var(--color-text-primary)" }}>${line.total.toFixed(2)}</div>
                          <button onClick={() => setDraftLines((prev) => prev.length <= 1 ? prev : prev.filter((_, lineIdx) => lineIdx !== idx))} className="text-sm py-1.5" style={{ color: "var(--color-text-muted)" }} aria-label="Remove line">x</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="w-full sm:w-80 space-y-2" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
                      <div className="flex justify-between text-sm">
                        <span style={{ color: "var(--color-text-muted)" }}>Subtotal</span>
                        <span style={{ color: "var(--color-text-primary)" }}>${draftTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span style={{ color: "var(--color-text-muted)" }}>Tax</span>
                        <span style={{ color: "var(--color-text-primary)" }}>Included in line items</span>
                      </div>
                      <div className="flex justify-between pt-2" style={{ borderTop: "2px solid var(--color-border)" }}>
                        <span className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>Total</span>
                        <span className="text-base font-bold" style={{ color: "#2CA01C" }}>${draftTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                {!selectedEstimate ? (
                  <div className="p-5">
                    <h2 className="font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Estimate Details</h2>
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select an estimate from the list to review its lines, print it, email it, schedule it, or delete it.</p>
                  </div>
                ) : (
                  <div>
                    <div className="px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm" style={{ color: "var(--color-text-muted)" }}>{selectedEstimate.DocNumber || `Estimate ${selectedEstimate.Id}`}</span>
                          {convertedMap[selectedEstimate.Id] && (
                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}>Converted</span>
                          )}
                        </div>
                        <div className="text-xl font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>{selectedEstimate.CustomerRef?.name || "Customer"}</div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {selectedEstimate.TxnDate && <span>Issued {selectedEstimate.TxnDate}</span>}
                          {selectedEstimate.ExpirationDate && <span>Expires {selectedEstimate.ExpirationDate}</span>}
                          <span>{selectedEstimateLines.length} line{selectedEstimateLines.length === 1 ? "" : "s"}</span>
                        </div>
                      </div>
                      <div className="text-left lg:text-right">
                        <div className="text-[11px] font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Estimate Total</div>
                        <div className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                          ${Number(editingEstimateId === selectedEstimate.Id
                            ? estimateEditForm.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
                            : selectedEstimate.TotalAmt || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
                      {editingEstimateId === selectedEstimate.Id ? (
                        <>
                          <button onClick={saveEstimateEdits} disabled={savingEstimateEdits} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#2563EB", opacity: savingEstimateEdits ? 0.7 : 1 }}>
                            {savingEstimateEdits ? "Saving..." : "Save Changes"}
                          </button>
                          <button onClick={() => setEditingEstimateId(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                            Cancel
                          </button>
                          <button onClick={addEstimateLine} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                            Add Line
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEmailDialog(selectedEstimate)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Email</button>
                          <button onClick={() => printEstimate(selectedEstimate)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Print</button>
                          <button onClick={() => downloadEstimate(selectedEstimate)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Download</button>
                          <button onClick={() => beginEditEstimate(selectedEstimate)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Edit</button>
                          <button onClick={() => setPnlOpen({ id: selectedEstimate.Id, label: selectedEstimate.DocNumber || selectedEstimate.Id })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(248,151,31,0.12)", color: "#9a5d12", border: "1px solid rgba(248,151,31,0.25)" }}>P&amp;L</button>
                          <button onClick={() => scheduleFromEstimate(selectedEstimate)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.25)" }}>Schedule</button>
                          {convertedMap[selectedEstimate.Id] ? (
                            <a href="/invoices" className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)" }}>View Invoice</a>
                          ) : (
                            <button onClick={() => convertEstimateToInvoice(selectedEstimate)} disabled={convertingEstimateId === selectedEstimate.Id} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#16A34A", opacity: convertingEstimateId === selectedEstimate.Id ? 0.7 : 1 }}>
                              {convertingEstimateId === selectedEstimate.Id ? "Converting..." : "Convert"}
                            </button>
                          )}
                          <button onClick={() => deleteEstimate(selectedEstimate)} disabled={deletingEstimateId === selectedEstimate.Id} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.25)", opacity: deletingEstimateId === selectedEstimate.Id ? 0.7 : 1 }}>
                            {deletingEstimateId === selectedEstimate.Id ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      )}
                    </div>

                    {editingEstimateId === selectedEstimate.Id && (
                      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Expiration date</label>
                        <input
                          type="date"
                          value={estimateEditForm.expirationDate}
                          onChange={(event) => setEstimateEditForm((prev) => ({ ...prev, expirationDate: event.target.value }))}
                          className="mt-1 w-full max-w-xs px-3 py-2 rounded-lg text-sm"
                          style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                        />
                      </div>
                    )}

                    <div className="p-5">
                      <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid var(--color-border)" }}>
                        <div className="min-w-[1080px]">
                          {editingEstimateId === selectedEstimate.Id ? (
                            <div className="grid grid-cols-[44px_250px_minmax(360px,1fr)_76px_104px_104px_44px] gap-2 px-3 py-2.5 text-xs font-bold" style={{ background: "#f5f6f8", color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border)" }}>
                              <div></div>
                              <div>Product/service</div>
                              <div>Description</div>
                              <div className="text-right">Qty</div>
                              <div className="text-right">Rate</div>
                              <div className="text-right">Amount</div>
                              <div></div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-[44px_190px_170px_minmax(320px,1fr)_64px_92px_104px] gap-0 px-3 py-2.5 text-xs font-bold" style={{ background: "#f5f6f8", color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border)" }}>
                              <div className="text-right">#</div>
                              <div>Product/service</div>
                              <div>SKU</div>
                              <div>Description</div>
                              <div className="text-right">Qty</div>
                              <div className="text-right">Rate</div>
                              <div className="text-right">Amount</div>
                            </div>
                          )}
                          {(editingEstimateId === selectedEstimate.Id ? estimateEditForm.lines : selectedEstimateLines).map((line: any, idx) => (
                            <div key={`${selectedEstimate.Id}-${idx}`} style={{ background: idx % 2 === 0 ? "var(--color-surface-1)" : "var(--color-surface-2)", borderTop: idx === 0 && editingEstimateId !== selectedEstimate.Id ? "0" : "1px solid var(--color-border)" }}>
                              {editingEstimateId === selectedEstimate.Id ? (
                                <div className="grid grid-cols-[44px_250px_minmax(360px,1fr)_76px_104px_104px_44px] gap-2 p-3 items-start">
                                  <button
                                    type="button"
                                    onClick={() => insertEstimateLineAfter(idx)}
                                    className="h-9 w-9 rounded-lg text-lg leading-none font-semibold"
                                    title="Add line below"
                                    aria-label="Add line below"
                                    style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "#2563EB" }}
                                  >
                                    +
                                  </button>
                                  <div className="relative">
                                    <input
                                      value={estimateEditForm.lines[idx]?.partNumber || estimateEditForm.lines[idx]?.itemName || ""}
                                      onFocus={() => setFocusedEstimateItemLine(idx)}
                                      onBlur={() => window.setTimeout(() => setFocusedEstimateItemLine((current) => current === idx ? null : current), 120)}
                                      onChange={(event) => updateEstimateLine(idx, {
                                        itemId: undefined,
                                        itemName: undefined,
                                        partNumber: event.target.value,
                                      })}
                                      placeholder="Search product or part #"
                                      className="w-full px-2 py-2 rounded-lg text-sm font-semibold"
                                      style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                                    />
                                    {estimateEditForm.lines[idx]?.itemName && (
                                      <div className="mt-1 text-[11px] truncate" title={estimateEditForm.lines[idx]?.itemName} style={{ color: "var(--color-text-muted)" }}>
                                        {estimateEditForm.lines[idx]?.itemName}
                                      </div>
                                    )}
                                    {focusedEstimateItemLine === idx && (
                                      <div className="absolute z-30 mt-1 w-full rounded-lg shadow-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                                        {getItemSearchResults(estimateEditForm.lines[idx]?.partNumber || estimateEditForm.lines[idx]?.itemName || "").length > 0 ? (
                                          getItemSearchResults(estimateEditForm.lines[idx]?.partNumber || estimateEditForm.lines[idx]?.itemName || "").map((item) => (
                                            <button
                                              key={item.Id}
                                              type="button"
                                              onMouseDown={(event) => {
                                                event.preventDefault();
                                                selectEstimateLineItem(idx, item);
                                              }}
                                              className="w-full px-3 py-2 text-left"
                                              style={{ borderBottom: "1px solid var(--color-border)" }}
                                            >
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                  <div className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{getItemPartNumber(item)}</div>
                                                  <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{item.Name}</div>
                                                </div>
                                                <div className="text-xs font-semibold shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                                                  ${Number(item.UnitPrice || 0).toFixed(2)}
                                                </div>
                                              </div>
                                            </button>
                                          ))
                                        ) : (
                                          <div className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                                            {(estimateEditForm.lines[idx]?.partNumber || estimateEditForm.lines[idx]?.itemName || "").trim().length >= 2
                                              ? "No matching products"
                                              : "Type at least 2 characters to search"}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <input
                                    value={estimateEditForm.lines[idx]?.description || ""}
                                    onChange={(event) => updateEstimateLine(idx, { description: event.target.value })}
                                    className="w-full px-2 py-2 rounded-lg text-sm"
                                    style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    value={estimateEditForm.lines[idx]?.qty || 0}
                                    onChange={(event) => updateEstimateLine(idx, { qty: Number(event.target.value || 0) })}
                                    className="w-full px-2 py-2 rounded-lg text-sm text-right"
                                    style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                                  />
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={estimateEditForm.lines[idx]?.unitPrice || 0}
                                    onChange={(event) => updateEstimateLine(idx, { unitPrice: Number(event.target.value || 0) })}
                                    className="w-full px-2 py-2 rounded-lg text-sm text-right"
                                    style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                                  />
                                  <div className="text-sm font-semibold text-right py-2" style={{ color: "var(--color-text-primary)" }}>
                                    ${Number(estimateEditForm.lines[idx]?.amount || 0).toFixed(2)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeEstimateLine(idx)}
                                    className="h-9 w-9 rounded-lg text-sm font-semibold"
                                    aria-label="Remove line"
                                    style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.25)" }}
                                  >
                                    x
                                  </button>
                                </div>
                              ) : (
                                <div className="grid grid-cols-[44px_190px_170px_minmax(320px,1fr)_64px_92px_104px] gap-0 px-3 py-3 items-start">
                                  <div className="text-sm text-right" style={{ color: "var(--color-text-muted)" }}>{idx + 1}</div>
                                  <div className="text-sm font-semibold px-2" style={{ color: "var(--color-text-primary)" }}>{getLineProductService(line) || "Estimate line"}</div>
                                  <div className="text-sm px-2 truncate" title={getLineSku(line)} style={{ color: "var(--color-text-secondary)" }}>{getLineSku(line)}</div>
                                  <div className="text-sm px-2 whitespace-pre-wrap" style={{ color: "var(--color-text-primary)" }}>{getLineDescription(line)}</div>
                                  <div className="text-sm text-right" style={{ color: "var(--color-text-primary)" }}>{Number(line.SalesItemLineDetail?.Qty || 1)}</div>
                                  <div className="text-sm text-right" style={{ color: "var(--color-text-primary)" }}>${Number(line.SalesItemLineDetail?.UnitPrice || line.Amount || 0).toFixed(2)}</div>
                                  <div className="text-sm font-semibold text-right" style={{ color: "var(--color-text-primary)" }}>${Number(line.Amount || 0).toFixed(2)}</div>
                                </div>
                              )}
                            </div>
                          ))}
                          {(editingEstimateId === selectedEstimate.Id ? estimateEditForm.lines.length : selectedEstimateLines.length) === 0 && (
                            <div className="px-3 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>No estimate lines found.</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
                        <div>
                          <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)" }}>Notes</div>
                          {editingEstimateId === selectedEstimate.Id ? (
                            <textarea
                              rows={4}
                              value={estimateEditForm.privateNote}
                              onChange={(event) => setEstimateEditForm((prev) => ({ ...prev, privateNote: event.target.value }))}
                              className="w-full px-3 py-2 rounded-lg text-sm"
                              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                            />
                          ) : (
                            <div className="text-sm rounded-lg p-3 min-h-20" style={{ color: "var(--color-text-secondary)", background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>{selectedEstimate.PrivateNote || "No notes on this estimate."}</div>
                          )}
                        </div>
                        <div className="space-y-2" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
                          <div className="flex items-center justify-between text-sm">
                            <span style={{ color: "var(--color-text-muted)" }}>Subtotal</span>
                            <span style={{ color: "var(--color-text-primary)" }}>
                              ${Number(editingEstimateId === selectedEstimate.Id
                                ? estimateEditForm.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
                                : selectedEstimate.TotalAmt || 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span style={{ color: "var(--color-text-muted)" }}>Tax</span>
                            <span style={{ color: "var(--color-text-primary)" }}>Included in line items</span>
                          </div>
                          <div className="flex items-center justify-between pt-2" style={{ borderTop: "2px solid var(--color-border)" }}>
                            <span className="font-bold" style={{ color: "var(--color-text-primary)" }}>Total</span>
                            <span className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
                              ${Number(editingEstimateId === selectedEstimate.Id
                                ? estimateEditForm.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
                                : selectedEstimate.TotalAmt || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <aside className="rounded-xl p-4 xl:sticky xl:top-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Estimates</h2>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {activeCustomerFilterId
                      ? `${filteredEstimates.length} for ${activeCustomerFilterName || "selected customer"}`
                      : `${filteredEstimates.length} recent`}
                  </p>
                </div>
                <button
                  onClick={syncFromQuickBooks}
                  disabled={syncing}
                  className="text-[11px] px-2.5 py-1.5 rounded transition-colors"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                    background: "var(--color-surface-2)",
                    opacity: syncing ? 0.6 : 1,
                  }}
                >
                  {syncing ? "Syncing..." : "Sync"}
                </button>
              </div>
              {loading ? <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</p> : (
                <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-auto pr-1">
                  {filteredEstimates.map((e) => (
                    <button
                      key={e.Id}
                      onClick={() => setSelectedEstimate(e)}
                      className="w-full text-left p-3 rounded-lg transition-colors"
                      style={{
                        background: selectedEstimate?.Id === e.Id ? "rgba(37,99,235,0.08)" : "var(--color-surface-3)",
                        border: `1px solid ${selectedEstimate?.Id === e.Id ? "rgba(37,99,235,0.45)" : "var(--color-border)"}`,
                        boxShadow: selectedEstimate?.Id === e.Id ? "0 0 0 1px rgba(37,99,235,0.12) inset" : "none",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{e.DocNumber || `Estimate ${e.Id}`}</div>
                          <div className="text-sm font-semibold truncate mt-0.5" style={{ color: "var(--color-text-primary)" }}>{e.CustomerRef?.name || "Customer"}</div>
                        </div>
                        <div className="text-sm font-semibold shrink-0" style={{ color: "var(--color-text-primary)" }}>${Number(e.TotalAmt || 0).toFixed(2)}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{e.TxnDate || "No date"}</span>
                        {convertedMap[e.Id] && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}>Converted</span>
                        )}
                      </div>
                    </button>
                  ))}
                  {filteredEstimates.length === 0 && (
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {activeCustomerFilterId ? "No estimates found for this customer." : "No recent estimates found."}
                    </p>
                  )}
                </div>
              )}
            </aside>
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
