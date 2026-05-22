"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Vendor = {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  BillAddr?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
};
type Item = { Id: string; Name: string; Type?: string; FullyQualifiedName?: string; Sku?: string; UnitPrice?: number };
type PO = { Id: string; DocNumber?: string; TxnDate?: string; VendorRef?: { name?: string }; TotalAmt?: number };
type EstimateLine = {
  Amount?: number;
  Description?: string;
  DetailType?: string;
  SalesItemLineDetail?: {
    ItemRef?: { value?: string; name?: string; sku?: string };
    Qty?: number;
    UnitPrice?: number;
  };
};
type Estimate = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  CustomerRef?: { value?: string; name?: string };
  Line?: EstimateLine[];
  TotalAmt?: number;
};
type POLine = {
  itemId: string;
  itemName: string;
  itemQuery: string;
  partNumber: string;
  description: string;
  qty: number;
  unitPrice: number;
};

const emptyLine = (): POLine => ({
  itemId: "",
  itemName: "",
  itemQuery: "",
  partNumber: "",
  description: "",
  qty: 1,
  unitPrice: 0,
});

const today = () => new Date().toISOString().split("T")[0];

function formatMoney(value: number | undefined) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatAddress(addr: Vendor["BillAddr"] | undefined) {
  if (!addr) return "";
  return [
    addr.Line1,
    addr.Line2,
    [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");
}

function normalizeLookup(value: string | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenizeLookup(value: string | undefined) {
  return Array.from(new Set((value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .flatMap((token) => {
      const variants = [token];
      if (token.endsWith("es") && token.length > 4) variants.push(token.slice(0, -2));
      if (token.endsWith("s") && token.length > 3) variants.push(token.slice(0, -1));
      return variants;
    })));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPartNumber(description: string | undefined) {
  const text = (description || "").trim();
  const partLine = text.match(/\n\s*Part:\s*([^\n]+)/i);
  if (partLine?.[1]) return partLine[1].trim();
  const prefix = text.match(/^([A-Z0-9][A-Z0-9:._/-]{2,})\s+-\s+/i);
  return prefix?.[1]?.trim() || "";
}

function cleanLineDescription(description: string | undefined, partNumber: string | undefined) {
  let cleaned = (description || "").replace(/\n\s*Part:\s*.+$/i, "").trim();
  const part = (partNumber || "").trim();
  if (!part) return cleaned;
  return cleaned
    .replace(new RegExp(`\\s*\\(${escapeRegExp(part)}\\)\\s*$`, "i"), "")
    .replace(new RegExp(`^${escapeRegExp(part)}\\s*-\\s*`, "i"), "")
    .trim();
}

function buildDescriptionWithPart(description: string | undefined, partNumber: string | undefined) {
  const descriptionText = (description || "").trim();
  const part = (partNumber || "").trim();
  if (!part) return descriptionText;
  if (normalizeLookup(descriptionText).includes(normalizeLookup(part))) return descriptionText;
  return descriptionText ? `${part} - ${descriptionText}` : part;
}

export default function PurchaseOrdersPage() {
  const searchParams = useSearchParams();
  const estimateId = searchParams.get("estimateId");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PO[]>([]);
  const [sourceEstimate, setSourceEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorSearchOpen, setVendorSearchOpen] = useState(false);
  const [vendorEmail, setVendorEmail] = useState("");
  const [ccBcc, setCcBcc] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [purchaseOrderStatus, setPurchaseOrderStatus] = useState("Open");
  const [lastDelivery, setLastDelivery] = useState("");
  const [mailingAddress, setMailingAddress] = useState("");
  const [shipTo, setShipTo] = useState("Hearth OS");
  const [shippingAddress, setShippingAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [txnDate, setTxnDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [shipVia, setShipVia] = useState("");
  const [tags, setTags] = useState("");
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);
  const [activeItemSearchIndex, setActiveItemSearchIndex] = useState<number | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");

  function getItemPartNumber(item: Item | undefined) {
    return item?.Sku || item?.FullyQualifiedName || item?.Name || "";
  }

  function getItemSearchResults(query: string) {
    const normalizedQuery = normalizeLookup(query);
    const queryTokens = tokenizeLookup(query);
    if (normalizedQuery.length < 2 || queryTokens.length === 0) return [];

    return items
      .map((item) => {
        const rawFields = [item.Sku, item.Name, item.FullyQualifiedName].filter(Boolean) as string[];
        const normalizedFields = rawFields.map(normalizeLookup);
        const itemTokens = tokenizeLookup(rawFields.join(" "));
        const contiguousMatch = normalizedFields.some((value) => value.includes(normalizedQuery));
        const allTokensMatch = queryTokens.every((queryToken) => (
          normalizedFields.some((value) => value.includes(queryToken)) ||
          itemTokens.some((itemToken) => itemToken.includes(queryToken))
        ));

        if (!contiguousMatch && !allTokensMatch) return null;

        let score = 0;
        if (normalizeLookup(item.Sku) === normalizedQuery) score += 120;
        if (normalizeLookup(item.Name) === normalizedQuery) score += 110;
        if (normalizeLookup(item.Sku).startsWith(normalizedQuery)) score += 80;
        if (normalizeLookup(item.Name).startsWith(normalizedQuery)) score += 70;
        if (contiguousMatch) score += 55;

        for (const queryToken of queryTokens) {
          if (itemTokens.includes(queryToken)) score += 30;
          else if (itemTokens.some((itemToken) => itemToken.startsWith(queryToken))) score += 20;
          else if (normalizedFields.some((value) => value.includes(queryToken))) score += 12;
        }

        score -= Math.min((item.Name || "").length, 80) / 100;
        return { item, score };
      })
      .filter((result): result is { item: Item; score: number } => Boolean(result))
      .sort((a, b) => b.score - a.score || a.item.Name.localeCompare(b.item.Name))
      .map((result) => result.item)
      .slice(0, 8);
  }

  function getVendorSearchResults(query: string) {
    const normalizedQuery = normalizeLookup(query);
    const queryTokens = tokenizeLookup(query);
    const searchableVendors = vendors.filter((vendor) => vendor.DisplayName || vendor.CompanyName || vendor.PrimaryEmailAddr?.Address);

    if (normalizedQuery.length < 2 || queryTokens.length === 0) {
      return searchableVendors
        .slice()
        .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName))
        .slice(0, 10);
    }

    return searchableVendors
      .map((vendor) => {
        const rawFields = [
          vendor.DisplayName,
          vendor.CompanyName,
          vendor.PrimaryEmailAddr?.Address,
        ].filter(Boolean) as string[];
        const normalizedFields = rawFields.map(normalizeLookup);
        const vendorTokens = tokenizeLookup(rawFields.join(" "));
        const contiguousMatch = normalizedFields.some((value) => value.includes(normalizedQuery));
        const allTokensMatch = queryTokens.every((queryToken) => (
          normalizedFields.some((value) => value.includes(queryToken)) ||
          vendorTokens.some((vendorToken) => vendorToken.includes(queryToken))
        ));

        if (!contiguousMatch && !allTokensMatch) return null;

        let score = 0;
        if (normalizeLookup(vendor.DisplayName) === normalizedQuery) score += 120;
        if (normalizeLookup(vendor.CompanyName) === normalizedQuery) score += 110;
        if (normalizeLookup(vendor.DisplayName).startsWith(normalizedQuery)) score += 80;
        if (normalizeLookup(vendor.CompanyName).startsWith(normalizedQuery)) score += 70;
        if (contiguousMatch) score += 50;

        for (const queryToken of queryTokens) {
          if (vendorTokens.includes(queryToken)) score += 30;
          else if (vendorTokens.some((vendorToken) => vendorToken.startsWith(queryToken))) score += 20;
          else if (normalizedFields.some((value) => value.includes(queryToken))) score += 12;
        }

        score -= Math.min((vendor.DisplayName || "").length, 80) / 100;
        return { vendor, score };
      })
      .filter((result): result is { vendor: Vendor; score: number } => Boolean(result))
      .sort((a, b) => b.score - a.score || a.vendor.DisplayName.localeCompare(b.vendor.DisplayName))
      .map((result) => result.vendor)
      .slice(0, 10);
  }

  function estimateToPoLines(estimate: Estimate): POLine[] {
    const mapped = (estimate.Line || [])
      .filter((line) => line.SalesItemLineDetail)
      .map((line) => {
        const detail = line.SalesItemLineDetail;
        const itemRef = detail?.ItemRef;
        const partNumber = extractPartNumber(line.Description) || itemRef?.sku || itemRef?.name || "";
        const baseDescription = cleanLineDescription(line.Description || itemRef?.name || "Estimate line", partNumber);
        const description = buildDescriptionWithPart(baseDescription, partNumber);
        const qty = Number(detail?.Qty || 1);
        const unitPrice = Number(detail?.UnitPrice || line.Amount || 0);
        return {
          itemId: itemRef?.value || "",
          itemName: itemRef?.name || partNumber,
          itemQuery: itemRef?.name || partNumber,
          partNumber,
          description,
          qty,
          unitPrice,
        };
      })
      .filter((line) => line.qty > 0 && line.unitPrice >= 0);

    return mapped.length ? mapped : [emptyLine()];
  }

  function selectVendor(id: string, vendorList = vendors) {
    const vendor = vendorList.find((v) => v.Id === id);
    setVendorId(id);
    setVendorQuery(vendor?.DisplayName || "");
    setVendorEmail(vendor?.PrimaryEmailAddr?.Address || "");
    setMailingAddress(formatAddress(vendor?.BillAddr));
    setVendorSearchOpen(false);
  }

  async function loadAll(nextEstimateId = estimateId) {
    setLoading(true);
    setError(null);
    try {
      const requests: Promise<Response>[] = [
        fetch("/api/quickbooks/vendors"),
        fetch("/api/quickbooks/items?sync=true"),
        fetch("/api/quickbooks/purchase-orders"),
      ];
      if (nextEstimateId) requests.push(fetch(`/api/estimates?id=${encodeURIComponent(nextEstimateId)}`));

      const [vRes, iRes, pRes, eRes] = await Promise.all(requests);
      const vData = await vRes.json();
      const iData = await iRes.json();
      const pData = await pRes.json();
      const eData = eRes ? await eRes.json() : null;

      if (!vRes.ok) throw new Error(vData.error || "Failed vendors load");
      if (!iRes.ok) throw new Error(iData.error || "Failed items load");
      if (!pRes.ok) throw new Error(pData.error || "Failed purchase orders load");
      if (eRes && !eRes.ok) throw new Error(eData?.error || "Failed estimate load");

      const nextVendors = vData.vendors || [];
      setVendors(nextVendors);
      setItems(iData.items || []);
      setPurchaseOrders(pData.purchaseOrders || []);

      if (eData?.estimate) {
        const estimate = eData.estimate as Estimate;
        const shouldHydrateEstimate = sourceEstimate?.Id !== estimate.Id;
        setSourceEstimate(estimate);
        if (shouldHydrateEstimate) {
          setMemo(`Copied from Estimate ${estimate.DocNumber || estimate.Id}`);
          setLines(estimateToPoLines(estimate));
          setVendorId("");
          setVendorQuery("");
          setVendorEmail("");
          setMailingAddress("");
          setShipTo(estimate.CustomerRef?.name || "Hearth OS");
          setShippingAddress("");
          setPurchaseOrderStatus("Open");
          setLastDelivery("");
        }
      } else {
        setSourceEstimate(null);
        if (!vendorId && nextVendors.length) selectVendor(nextVendors[0].Id, nextVendors);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase order data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(estimateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  const selectedVendor = vendors.find((vendor) => vendor.Id === vendorId);
  const vendorResults = getVendorSearchResults(vendorQuery);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unitPrice || 0), 0);
    return { subtotal };
  }, [lines]);

  function updateLine(idx: number, patch: Partial<POLine>) {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
    setCreatedMessage(null);
  }

  function addLine(afterIndex?: number) {
    setLines((prev) => {
      const next = [...prev];
      next.splice(typeof afterIndex === "number" ? afterIndex + 1 : next.length, 0, emptyLine());
      return next;
    });
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function applyItemToLine(idx: number, item: Item) {
    const line = lines[idx];
    const partNumber = getItemPartNumber(item);
    const baseDescription = cleanLineDescription(line?.description, line?.partNumber) || item.Name;
    updateLine(idx, {
      itemId: item.Id,
      itemName: item.Name,
      itemQuery: item.Name,
      partNumber,
      description: buildDescriptionWithPart(baseDescription, partNumber),
      unitPrice: Number(line?.unitPrice || item.UnitPrice || 0),
    });
    setActiveItemSearchIndex(null);
  }

  async function createPO(send = false) {
    if (!vendorId) return setError("Please select a vendor.");
    if (send && !vendorEmail.trim()) return setError("Vendor email is required to save and send.");

    const normalized = lines
      .filter((line) => line.itemId || line.description)
      .map((line) => ({
        itemId: line.itemId || undefined,
        itemName: line.itemName || undefined,
        partNumber: line.partNumber || undefined,
        description: buildDescriptionWithPart(cleanLineDescription(line.description, line.partNumber), line.partNumber) || undefined,
        qty: Number(line.qty || 0),
        unitPrice: Number(line.unitPrice || 0),
        amount: Number(line.qty || 0) * Number(line.unitPrice || 0),
      }))
      .filter((line) => line.amount > 0);

    if (!normalized.length) return setError("Add at least one line with quantity and price.");

    setSaving(true);
    setError(null);
    setCreatedMessage(null);
    try {
      const res = await fetch("/api/quickbooks/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          poNumber: poNumber.trim() || undefined,
          memo: memo || undefined,
          txnDate,
          dueDate: dueDate || undefined,
          mailingAddress: mailingAddress.trim() || undefined,
          shipTo: shipTo.trim() || undefined,
          shippingAddress: shippingAddress.trim() || undefined,
          shipVia: shipVia || undefined,
          tags: tags.trim() || undefined,
          ccBcc: ccBcc.trim() || undefined,
          sourceEstimateId: sourceEstimate?.DocNumber || sourceEstimate?.Id || undefined,
          email: vendorEmail.trim() || undefined,
          send,
          lines: normalized,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create purchase order");

      setCreatedMessage(`${data.sent ? "Created and sent" : "Created"} Purchase Order ${data.purchaseOrder?.DocNumber || data.purchaseOrder?.Id || ""}`.trim());
      setPoNumber(data.purchaseOrder?.DocNumber || poNumber);
      setPurchaseOrderStatus(data.purchaseOrder?.POStatus || "Open");
      if (data.sent && vendorEmail.trim()) {
        setLastDelivery(`Sent by email to ${vendorEmail.trim()} at ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "long" })}`);
      }
      const pRes = await fetch("/api/quickbooks/purchase-orders");
      const pData = await pRes.json();
      if (pRes.ok) setPurchaseOrders(pData.purchaseOrders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  }

  async function copyPurchaseOrderLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1800);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel("Copy"), 1800);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <div className="px-6 py-4 flex items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Purchase Orders</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {sourceEstimate ? `Convert Estimate ${sourceEstimate.DocNumber || sourceEstimate.Id} into a vendor purchase order` : "Create and send purchase orders to QuickBooks vendors"}
            </p>
          </div>
          <button onClick={() => loadAll(estimateId)} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>Refresh</button>
        </div>

        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1900px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start pb-20">
            <section className="min-w-0 rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="px-5 py-4 flex flex-col xl:flex-row xl:items-start justify-between gap-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Purchase Order</div>
                  <h2 className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                    Purchase Order #{poNumber.trim() || "New"}
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {sourceEstimate?.CustomerRef?.name ? `Customer: ${sourceEstimate.CustomerRef.name}` : "Select a vendor, review the item details, then save or send."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={copyPurchaseOrderLink} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>{copyLabel}</button>
                    <button onClick={() => { window.location.href = "mailto:support@hearthos.local?subject=Purchase%20Order%20Feedback"; }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Give feedback</button>
                  </div>
                </div>
                <div className="xl:text-right">
                  <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Amount</div>
                  <div className="text-4xl font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(totals.subtotal)}</div>
                  <div className="mt-1 text-xs font-semibold" style={{ color: "#16A34A" }}>{purchaseOrderStatus.toUpperCase()}</div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {error && (
                  <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.35)", color: "#FF204E" }}>
                    {error}
                  </div>
                )}
                {createdMessage && (
                  <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(22,163,74,0.12)", border: "1px solid rgba(22,163,74,0.25)", color: "#15803D" }}>
                    {createdMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px_220px] gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Vendor</label>
                    <div className="relative">
                      <input
                        value={vendorQuery}
                        onFocus={() => setVendorSearchOpen(true)}
                        onBlur={() => window.setTimeout(() => setVendorSearchOpen(false), 120)}
                        onChange={(event) => {
                          setVendorQuery(event.target.value);
                          setVendorId("");
                          setVendorEmail("");
                          setMailingAddress("");
                          setVendorSearchOpen(true);
                          setCreatedMessage(null);
                        }}
                        placeholder="Search vendor by name, company, or email"
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      {vendorSearchOpen && (
                        <div className="absolute z-40 mt-2 w-full max-h-80 overflow-auto rounded-lg shadow-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                          {vendorResults.length > 0 ? (
                            vendorResults.map((vendor) => (
                              <button
                                key={vendor.Id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  selectVendor(vendor.Id);
                                  setCreatedMessage(null);
                                }}
                                className="w-full px-3 py-2 text-left"
                                style={{ borderBottom: "1px solid var(--color-border)" }}
                              >
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{vendor.DisplayName}</div>
                                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                  {[vendor.CompanyName, vendor.PrimaryEmailAddr?.Address].filter(Boolean).join(" - ") || "No company or email on file"}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>No vendors found</div>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedVendor ? (
                      <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {[selectedVendor.CompanyName, selectedVendor.PrimaryEmailAddr?.Address].filter(Boolean).join(" - ") || "Vendor selected"}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Start typing to find a QuickBooks vendor.</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-semibold block" style={{ color: "var(--color-text-muted)" }}>Email</label>
                      <button
                        onClick={() => setCcBcc((prev) => prev || " ")}
                        className="text-xs font-semibold"
                        style={{ color: "#2563EB" }}
                      >
                        Cc/Bcc{ccBcc.trim() ? "(1)" : ""}
                      </button>
                    </div>
                    <input
                      value={vendorEmail}
                      onChange={(event) => {
                        setVendorEmail(event.target.value);
                        setCreatedMessage(null);
                      }}
                      placeholder="vendor@email.com"
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Purchase Order status</label>
                    <div className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: "rgba(22,163,74,0.10)", border: "1px solid rgba(22,163,74,0.25)", color: "#15803D" }}>{purchaseOrderStatus}</div>
                  </div>
                </div>

                {ccBcc !== "" && (
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Cc/Bcc(1)</label>
                    <input
                      value={ccBcc}
                      onChange={(event) => setCcBcc(event.target.value)}
                      placeholder="Additional email recipients"
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    />
                  </div>
                )}

                <div className="rounded-xl p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>Last Delivery</div>
                  <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>{lastDelivery || "Not sent yet"}</div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Mailing address</label>
                    <textarea
                      value={mailingAddress}
                      onChange={(event) => setMailingAddress(event.target.value)}
                      rows={4}
                      placeholder="Vendor mailing address"
                      className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                      style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Ship to</label>
                    <input
                      value={shipTo}
                      onChange={(event) => setShipTo(event.target.value)}
                      placeholder="Recipient or location"
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Shipping address</label>
                    <textarea
                      value={shippingAddress}
                      onChange={(event) => setShippingAddress(event.target.value)}
                      rows={4}
                      placeholder="Ship-to address"
                      className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                      style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Purchase Order date</label>
                    <input type="date" value={txnDate} onChange={(event) => setTxnDate(event.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Ship Via</label>
                    <input value={shipVia} onChange={(event) => setShipVia(event.target.value)} placeholder="Delivery method" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Due date</label>
                    <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>PO no.</label>
                    <input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} placeholder="Auto" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Tags (?)</label>
                    <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Comma separated" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Memo</label>
                  <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Optional internal note" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Item Details</h3>
                    <button onClick={() => addLine()} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>+ Add line</button>
                  </div>

                  <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid var(--color-border)" }}>
                    <div className="min-w-[1040px]">
                      <div className="grid grid-cols-[46px_230px_minmax(360px,1fr)_76px_110px_120px_48px] gap-3 px-3 py-2 text-xs font-bold" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                        <div>#</div>
                        <div>Product/service</div>
                        <div>Description</div>
                        <div className="text-right">Qty</div>
                        <div className="text-right">Rate</div>
                        <div className="text-right">Amount</div>
                        <div></div>
                      </div>

                      {lines.map((line, idx) => {
                        const results = activeItemSearchIndex === idx ? getItemSearchResults(line.itemQuery || line.itemName) : [];
                        return (
                          <div key={idx} className="grid grid-cols-[46px_230px_minmax(360px,1fr)_76px_110px_120px_48px] gap-3 px-3 py-3 items-start text-sm" style={{ borderTop: "1px solid var(--color-border)" }}>
                            <div className="flex items-center gap-1 pt-2">
                              <span style={{ color: "var(--color-text-muted)" }}>{idx + 1}</span>
                              <button onClick={() => addLine(idx)} className="w-6 h-6 rounded-full text-sm font-bold" title="Add line below" style={{ border: "1px solid var(--color-border)", color: "#2563EB" }}>+</button>
                            </div>

                            <div className="relative">
                              <input
                                value={line.itemQuery}
                                onFocus={() => setActiveItemSearchIndex(idx)}
                                onChange={(event) => {
                                  updateLine(idx, { itemQuery: event.target.value, itemId: "", itemName: event.target.value });
                                  setActiveItemSearchIndex(idx);
                                }}
                                placeholder="Search product"
                                className="w-full px-2 py-2 rounded-lg text-sm"
                                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                              />
                              {results.length > 0 && (
                                <div className="absolute z-30 mt-2 w-[360px] max-h-72 overflow-auto rounded-lg shadow-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                                  {results.map((item) => (
                                    <button
                                      key={item.Id}
                                      type="button"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => applyItemToLine(idx, item)}
                                      className="w-full px-3 py-2 text-left"
                                      style={{ borderBottom: "1px solid var(--color-border)" }}
                                    >
                                      <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{item.Name}</div>
                                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{getItemPartNumber(item)}</div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <textarea
                              value={line.description}
                              onChange={(event) => updateLine(idx, { description: event.target.value })}
                              placeholder="Description shown on the purchase order"
                              rows={2}
                              className="w-full px-2 py-2 rounded-lg text-sm resize-none"
                              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                            />
                            <input type="number" min={1} value={line.qty} onChange={(event) => updateLine(idx, { qty: Number(event.target.value || 1) })} className="w-full px-2 py-2 rounded-lg text-sm text-right" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                            <input type="text" inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(idx, { unitPrice: Number(event.target.value || 0) })} className="w-full px-2 py-2 rounded-lg text-sm text-right" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                            <div className="pt-2 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(Number(line.qty || 0) * Number(line.unitPrice || 0))}</div>
                            <button onClick={() => removeLine(idx)} className="w-9 h-9 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.10)", color: "#FF204E" }}>x</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="w-full max-w-sm space-y-2 text-sm">
                    <div className="flex justify-between" style={{ color: "var(--color-text-muted)" }}>
                      <span>Subtotal</span>
                      <span>{formatMoney(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between pt-2 text-lg font-bold" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                      <span>Total</span>
                      <span>{formatMoney(totals.subtotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 px-5 py-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between" style={{ background: "var(--color-surface-1)", borderTop: "1px solid var(--color-border)" }}>
                <button onClick={() => { window.location.href = sourceEstimate ? `/estimates?id=${encodeURIComponent(sourceEstimate.Id)}` : "/estimates"; }} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Cancel</button>
                <div className="flex gap-2 justify-end">
                  <button disabled={saving || loading} onClick={() => createPO(false)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button disabled={saving || loading} onClick={() => createPO(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#16A34A", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Saving..." : "Save and send"}
                  </button>
                </div>
              </div>
            </section>

            <aside className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent POs</h2>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{purchaseOrders.length}</span>
              </div>
              {loading ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</p>
              ) : purchaseOrders.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No purchase orders found.</p>
              ) : (
                <div className="space-y-2 max-h-[720px] overflow-auto pr-1">
                  {purchaseOrders.slice(0, 30).map((po) => (
                    <div key={po.Id} className="p-3 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{po.DocNumber || `PO ${po.Id}`}</div>
                          <div className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{po.VendorRef?.name || "Vendor"}</div>
                        </div>
                        <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(po.TotalAmt)}</div>
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{po.TxnDate || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
