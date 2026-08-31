"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Vendor = {
  Id: string;
  LocalId?: string;
  QbVendorId?: string;
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
type PurchaseOrderDetail = {
  purchaseOrder: {
    id: string;
    qbPurchaseOrderId?: string | null;
    poNumber?: string | null;
    status?: string | null;
    issueDate?: string | null;
    expectedDate?: string | null;
    receivedDate?: string | null;
    subtotal?: string | number | null;
    taxAmount?: string | number | null;
    totalAmount?: string | number | null;
    shipAddress?: string | null;
    vendorMessage?: string | null;
    privateNote?: string | null;
    emailStatus?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  vendor: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  lineItems: Array<{
    id: string;
    qbItemId?: string | null;
    description?: string | null;
    quantity?: string | number | null;
    unitCost?: string | number | null;
    total?: string | number | null;
    receivedQty?: string | number | null;
    order?: number | null;
  }>;
};
type ShipToResult = {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
};
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

function formatDateDisplay(value: string | undefined) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function formatDateTimeDisplay(value: string | undefined | null) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateDisplay(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatStatus(value: string | undefined | null) {
  if (!value) return "Open";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAddress(addr: Vendor["BillAddr"] | undefined) {
  if (!addr) return "";
  return [
    addr.Line1,
    addr.Line2,
    [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");
}

function formatShipToAddress(addr: ShipToResult["address"] | undefined) {
  if (!addr) return "";
  return [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.zip].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");
}

function mapShipToCustomer(customer: any): ShipToResult {
  return {
    id: customer.id || customer.Id,
    displayName: customer.displayName || customer.DisplayName || customer.name || customer.companyName || "",
    email: customer.email || customer.PrimaryEmailAddr?.Address,
    phone: customer.phone || customer.primaryPhone || customer.PrimaryPhone?.FreeFormNumber,
    address: customer.address || (customer.BillAddr ? {
      line1: customer.BillAddr.Line1,
      line2: customer.BillAddr.Line2,
      city: customer.BillAddr.City,
      state: customer.BillAddr.CountrySubDivisionCode,
      zip: customer.BillAddr.PostalCode,
    } : undefined),
  };
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

function defaultPoNumber(estimate: Estimate | null) {
  return estimate?.DocNumber || estimate?.Id || "";
}

export default function PurchaseOrdersPage() {
  const searchParams = useSearchParams();
  const estimateId = searchParams.get("estimateId");
  const initialVendorId = searchParams.get("vendorId");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PO[]>([]);
  const [sourceEstimate, setSourceEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingPoId, setDeletingPoId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [selectedPoDetail, setSelectedPoDetail] = useState<PurchaseOrderDetail | null>(null);
  const [selectedPoLoading, setSelectedPoLoading] = useState(false);
  const [selectedPoError, setSelectedPoError] = useState<string | null>(null);
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
  const [shipToSearchOpen, setShipToSearchOpen] = useState(false);
  const [shipToCustomers, setShipToCustomers] = useState<ShipToResult[]>([]);
  const [shipToResults, setShipToResults] = useState<ShipToResult[]>([]);
  const [shipToSearching, setShipToSearching] = useState(false);
  const shipToSearchSeq = useRef(0);
  const [shippingAddress, setShippingAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [txnDate, setTxnDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [shipVia, setShipVia] = useState("");
  const [tags, setTags] = useState("");
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);
  const [activeItemSearchIndex, setActiveItemSearchIndex] = useState<number | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ type: "info" | "success" | "error"; message: string } | null>(null);
  const [sendMeCopy, setSendMeCopy] = useState(true);
  const [sendSubject, setSendSubject] = useState("Purchase Order from AARON'S FIREPLACE CO, LLC");
  const [sendBody, setSendBody] = useState("Dear Vendor,\n\nPlease find our purchase order attached to this email.\n\nThank you.\n\nThanks for your business!\nAARON'S FIREPLACE CO, LLC");

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

  function getShipToSearchResults(query: string, customerList = shipToCustomers) {
    const normalizedQuery = normalizeLookup(query);
    const queryTokens = tokenizeLookup(query);
    const searchableCustomers = customerList.filter((customer) => customer.displayName || customer.email || customer.phone || formatShipToAddress(customer.address));

    if (normalizedQuery.length < 2 || queryTokens.length === 0) return [];

    return searchableCustomers
      .map((customer) => {
        const address = formatShipToAddress(customer.address);
        const rawFields = [
          customer.displayName,
          customer.email,
          customer.phone,
          customer.address?.line1,
          customer.address?.line2,
          customer.address?.city,
          customer.address?.state,
          customer.address?.zip,
          address,
        ].filter(Boolean) as string[];
        const normalizedFields = rawFields.map(normalizeLookup);
        const customerTokens = tokenizeLookup(rawFields.join(" "));
        const contiguousMatch = normalizedFields.some((value) => value.includes(normalizedQuery));
        const allTokensMatch = queryTokens.every((queryToken) => (
          normalizedFields.some((value) => value.includes(queryToken)) ||
          customerTokens.some((customerToken) => customerToken.includes(queryToken))
        ));

        if (!contiguousMatch && !allTokensMatch) return null;

        let score = 0;
        if (normalizeLookup(customer.displayName) === normalizedQuery) score += 140;
        if (normalizeLookup(customer.displayName).startsWith(normalizedQuery)) score += 95;
        if (contiguousMatch) score += 60;

        for (const queryToken of queryTokens) {
          if (customerTokens.includes(queryToken)) score += 32;
          else if (customerTokens.some((customerToken) => customerToken.startsWith(queryToken))) score += 22;
          else if (normalizedFields.some((value) => value.includes(queryToken))) score += 12;
        }

        score -= Math.min((customer.displayName || "").length, 80) / 100;
        return { customer, score };
      })
      .filter((result): result is { customer: ShipToResult; score: number } => Boolean(result))
      .sort((a, b) => b.score - a.score || a.customer.displayName.localeCompare(b.customer.displayName))
      .map((result) => result.customer)
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
    const vendor = vendorList.find((v) => v.Id === id || v.LocalId === id || v.QbVendorId === id);
    setVendorId(vendor?.Id || id);
    setVendorQuery(vendor?.DisplayName || "");
    setVendorEmail(vendor?.PrimaryEmailAddr?.Address || "");
    setMailingAddress(formatAddress(vendor?.BillAddr));
    setVendorSearchOpen(false);
  }

  async function searchShipTo(query: string) {
    const trimmed = query.trim();
    const searchId = ++shipToSearchSeq.current;
    if (trimmed.length < 2) {
      setShipToResults([]);
      setShipToSearching(false);
      return;
    }

    const localResults = getShipToSearchResults(trimmed);
    setShipToResults(localResults);
    if (localResults.length > 0) {
      setShipToSearching(false);
      return;
    }

    setShipToSearching(shipToCustomers.length === 0);
    try {
      const res = await fetch(`/api/customer-lookup?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to search customers");
      if (searchId !== shipToSearchSeq.current) return;
      const fallbackResults = (data.customers || []).slice(0, 10);
      setShipToResults(fallbackResults);
      if (fallbackResults.length) {
        setShipToCustomers((prev) => {
          const byId = new Map(prev.map((customer) => [customer.id, customer]));
          for (const customer of fallbackResults) byId.set(customer.id, customer);
          return Array.from(byId.values());
        });
      }
    } catch {
      if (searchId === shipToSearchSeq.current) setShipToResults([]);
    } finally {
      if (searchId === shipToSearchSeq.current) setShipToSearching(false);
    }
  }

  function selectShipToCustomer(customer: ShipToResult) {
    setShipTo(customer.displayName);
    setShippingAddress(formatShipToAddress(customer.address));
    setShipToSearchOpen(false);
    setShipToResults([]);
    setCreatedMessage(null);
  }

  async function loadAll(nextEstimateId = estimateId) {
    setLoading(true);
    setError(null);
    try {
      const requests: Promise<Response>[] = [
        fetch("/api/vendors?filter=all"),
        fetch("/api/inventory?filter=all&limit=500"),
        fetch("/api/purchase-orders"),
        fetch("/api/quickbooks/customers"),
      ];
      if (nextEstimateId) requests.push(fetch(`/api/estimates?id=${encodeURIComponent(nextEstimateId)}`));

      const [vRes, iRes, pRes, cRes, eRes] = await Promise.all(requests);
      const vData = await vRes.json();
      const iData = await iRes.json();
      const pData = await pRes.json();
      const cData = await cRes.json();
      const eData = eRes ? await eRes.json() : null;

      if (!vRes.ok) throw new Error(vData.error || "Failed vendors load");
      if (!iRes.ok) throw new Error(iData.error || "Failed items load");
      if (!pRes.ok) throw new Error(pData.error || "Failed purchase orders load");
      if (eRes && !eRes.ok) throw new Error(eData?.error || "Failed estimate load");

      const nextVendors = (vData.items || vData.vendors || []).map((vendor: any) => ({
        Id: vendor.id || vendor.LocalId || vendor.qbVendorId || vendor.Id,
        LocalId: vendor.id || vendor.LocalId,
        QbVendorId: vendor.qbVendorId || vendor.QbVendorId || vendor.Id,
        DisplayName: vendor.displayName || vendor.DisplayName || "",
        CompanyName: vendor.companyName || vendor.CompanyName || undefined,
        PrimaryEmailAddr: vendor.email ? { Address: vendor.email } : vendor.PrimaryEmailAddr,
        BillAddr: vendor.addressLine1 || vendor.city || vendor.state || vendor.zip
          ? {
              Line1: vendor.addressLine1 || undefined,
              Line2: vendor.addressLine2 || undefined,
              City: vendor.city || undefined,
              CountrySubDivisionCode: vendor.state || undefined,
              PostalCode: vendor.zip || undefined,
            }
          : vendor.BillAddr,
      }));
      setVendors(nextVendors);
      setItems((iData.items || []).map((item: any) => ({
        Id: item.qbItemId || item.id || item.Id,
        Name: item.name || item.Name || "",
        Type: item.type || item.Type,
        FullyQualifiedName: item.fullyQualifiedName || item.FullyQualifiedName || item.name || item.Name,
        Sku: item.sku || item.Sku,
        UnitPrice: Number(item.unitPrice ?? item.UnitPrice ?? item.cost ?? 0),
      })));
      setPurchaseOrders(pData.purchaseOrders || []);
      if (cRes.ok && Array.isArray(cData.customers)) {
        setShipToCustomers(cData.customers.map(mapShipToCustomer).filter((customer: ShipToResult) => customer.id && customer.displayName));
      }

      if (eData?.estimate) {
        const estimate = eData.estimate as Estimate;
        const shouldHydrateEstimate = sourceEstimate?.Id !== estimate.Id;
        setSourceEstimate(estimate);
        if (shouldHydrateEstimate) {
          setMemo(`Copied from Estimate ${estimate.DocNumber || estimate.Id}`);
          setPoNumber(defaultPoNumber(estimate));
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
        if (initialVendorId) {
          selectVendor(initialVendorId, nextVendors);
        } else if (!vendorId && nextVendors.length) {
          selectVendor(nextVendors[0].Id, nextVendors);
        }
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

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/quickbooks/customers?live=true", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.customers)) return;
        setShipToCustomers(data.customers.map(mapShipToCustomer).filter((customer: ShipToResult) => customer.id && customer.displayName));
      } catch {}
    }, 500);

    return () => window.clearTimeout(timeout);
  }, []);

  const selectedVendor = vendors.find((vendor) => vendor.Id === vendorId);
  const vendorResults = getVendorSearchResults(vendorQuery);
  const previewPoNumber = poNumber.trim() || defaultPoNumber(sourceEstimate) || "New";

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

  function openSendDialog() {
    if (!vendorId) return setError("Please select a vendor.");
    if (!vendorEmail.trim()) return setError("Vendor email is required to save and send.");
    if (!poNumber.trim() && sourceEstimate) setPoNumber(defaultPoNumber(sourceEstimate));
    const vendorGreeting = selectedVendor?.DisplayName || vendorQuery || "Vendor";
    setSendSubject("Purchase Order from AARON'S FIREPLACE CO, LLC");
    setSendBody(`Dear ${vendorGreeting},\n\nPlease find our purchase order attached to this email.\n\nThank you.\n\nThanks for your business!\nAARON'S FIREPLACE CO, LLC`);
    setSendStatus(null);
    setSendDialogOpen(true);
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
    if (send) setSendStatus({ type: "info", message: "Creating purchase order and sending email..." });
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          poNumber: poNumber.trim() || defaultPoNumber(sourceEstimate) || undefined,
          vendorName: selectedVendor?.DisplayName || vendorQuery || undefined,
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
          emailSubject: sendSubject,
          emailBody: sendBody,
          sendMeCopy,
          send,
          lines: normalized,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create purchase order");

      setCreatedMessage(`${data.sent ? "Created and sent" : data.emailError ? "Created but email failed" : "Created"} Purchase Order ${data.purchaseOrder?.DocNumber || data.purchaseOrder?.Id || ""}${data.emailError ? `: ${data.emailError}` : ""}`.trim());
      setPoNumber(data.purchaseOrder?.DocNumber || poNumber);
      setPurchaseOrderStatus(data.purchaseOrder?.POStatus || "Open");
      if (send) {
        if (data.emailError) {
          setSendStatus({ type: "error", message: `Purchase order was saved, but the email did not send: ${data.emailError}` });
        } else if (data.sent) {
          setSendStatus({ type: "success", message: `Sent to ${vendorEmail.trim()} through Hearth OS email.` });
          setSendDialogOpen(false);
        } else {
          setSendStatus({ type: "error", message: "Purchase order was saved, but email is not configured." });
        }
      }
      if (data.sent && vendorEmail.trim()) {
        setLastDelivery(`Sent by email to ${vendorEmail.trim()} at ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "long" })}`);
      }
      const pRes = await fetch("/api/purchase-orders");
      const pData = await pRes.json();
      if (pRes.ok) setPurchaseOrders(pData.purchaseOrders || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create purchase order";
      setError(message);
      if (send) setSendStatus({ type: "error", message });
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

  async function deletePurchaseOrder(po: PO) {
    const label = po.DocNumber || `PO ${po.Id}`;
    if (!window.confirm(`Delete ${label}? This removes the purchase order and its line items from Hearth OS.`)) return;

    setDeletingPoId(po.Id);
    setError(null);
    setCreatedMessage(null);
    try {
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(po.Id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete purchase order");
      setPurchaseOrders((prev) => prev.filter((entry) => entry.Id !== po.Id));
      if (selectedPoId === po.Id) {
        setSelectedPoId(null);
        setSelectedPoDetail(null);
        setSelectedPoError(null);
      }
      setCreatedMessage(`Deleted ${label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete purchase order");
    } finally {
      setDeletingPoId(null);
    }
  }

  async function openPurchaseOrder(po: PO) {
    setSelectedPoId(po.Id);
    setSelectedPoDetail(null);
    setSelectedPoError(null);
    setSelectedPoLoading(true);
    try {
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(po.Id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load purchase order");
      setSelectedPoDetail(data);
    } catch (err) {
      setSelectedPoError(err instanceof Error ? err.message : "Failed to load purchase order");
    } finally {
      setSelectedPoLoading(false);
    }
  }

  function closePurchaseOrderDetail() {
    setSelectedPoId(null);
    setSelectedPoDetail(null);
    setSelectedPoError(null);
    setSelectedPoLoading(false);
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
              {sourceEstimate ? `Convert Estimate ${sourceEstimate.DocNumber || sourceEstimate.Id} into a vendor purchase order` : "Create and send purchase orders to vendors"}
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
                      <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Start typing to find a vendor.</p>
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
                    <div className="relative">
                      <input
                        value={shipTo}
                        onFocus={() => {
                          setShipToSearchOpen(true);
                          searchShipTo(shipTo);
                        }}
                        onBlur={() => window.setTimeout(() => setShipToSearchOpen(false), 120)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setShipTo(value);
                          setShipToSearchOpen(true);
                          setCreatedMessage(null);
                          searchShipTo(value);
                        }}
                        placeholder="Search customer or job"
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      {shipToSearchOpen && (shipTo.trim().length >= 2 || shipToResults.length > 0) && (
                        <div className="absolute z-40 mt-2 w-full max-h-80 overflow-auto rounded-lg shadow-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                          {shipToSearching ? (
                            <div className="px-3 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>Searching...</div>
                          ) : shipToResults.length > 0 ? (
                            shipToResults.map((customer) => (
                              <button
                                key={customer.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectShipToCustomer(customer)}
                                className="w-full px-3 py-2 text-left"
                                style={{ borderBottom: "1px solid var(--color-border)" }}
                              >
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{customer.displayName}</div>
                                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                  {[customer.email, formatShipToAddress(customer.address).replace(/\n/g, ", ")].filter(Boolean).join(" - ") || "No address on file"}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>No customers found</div>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Select a customer to fill the shipping address, or type a one-off ship-to name.</p>
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
                  <button disabled={saving || loading} onClick={openSendDialog} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#16A34A", opacity: saving ? 0.7 : 1 }}>
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
                    <div
                      key={po.Id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openPurchaseOrder(po)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openPurchaseOrder(po);
                        }
                      }}
                      className="p-3 rounded-lg cursor-pointer transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
                      style={{
                        background: selectedPoId === po.Id ? "rgba(255, 106, 0, 0.08)" : "var(--color-surface-3)",
                        border: selectedPoId === po.Id ? "1px solid rgba(255, 106, 0, 0.45)" : "1px solid var(--color-border)",
                        boxShadow: selectedPoId === po.Id ? "0 12px 32px rgba(255, 106, 0, 0.10)" : undefined,
                      }}
                      title={`Open ${po.DocNumber || `PO ${po.Id}`}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{po.DocNumber || `PO ${po.Id}`}</div>
                          <div className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{po.VendorRef?.name || "Vendor"}</div>
                          <div className="mt-2 text-xs font-semibold" style={{ color: "#F97316" }}>Open details</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(po.TotalAmt)}</div>
                          <button
                            type="button"
                            disabled={deletingPoId === po.Id}
                            onClick={(event) => {
                              event.stopPropagation();
                              deletePurchaseOrder(po);
                            }}
                            className="mt-2 px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-60"
                            style={{ background: "rgba(255,32,78,0.10)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.25)" }}
                          >
                            {deletingPoId === po.Id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{po.TxnDate || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </main>

        {selectedPoId && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/35" onClick={closePurchaseOrderDetail} />
            <section
              className="relative h-full w-full max-w-[720px] overflow-y-auto shadow-2xl"
              style={{ background: "var(--color-surface-1)", borderLeft: "1px solid var(--color-border)" }}
              aria-label="Purchase order details"
            >
              <div className="sticky top-0 z-10 px-5 py-4 flex items-start justify-between gap-4" style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Purchase Order Detail</div>
                  <h2 className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                    {selectedPoDetail?.purchaseOrder.poNumber || purchaseOrders.find((po) => po.Id === selectedPoId)?.DocNumber || "Purchase Order"}
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {selectedPoDetail?.vendor?.name || purchaseOrders.find((po) => po.Id === selectedPoId)?.VendorRef?.name || "Vendor"}
                  </p>
                </div>
                <button onClick={closePurchaseOrderDetail} className="w-9 h-9 rounded-lg text-lg" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>x</button>
              </div>

              <div className="p-5 space-y-5">
                {selectedPoLoading && (
                  <div className="p-4 rounded-xl text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                    Loading purchase order...
                  </div>
                )}

                {selectedPoError && (
                  <div className="p-4 rounded-xl text-sm" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.35)", color: "#FF204E" }}>
                    {selectedPoError}
                  </div>
                )}

                {selectedPoDetail && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                        <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Status</div>
                        <div className="mt-1 text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{formatStatus(selectedPoDetail.purchaseOrder.status)}</div>
                        <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{selectedPoDetail.purchaseOrder.emailStatus || "Email not sent"}</div>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                        <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Total</div>
                        <div className="mt-1 text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(Number(selectedPoDetail.purchaseOrder.totalAmount || 0))}</div>
                        <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{selectedPoDetail.lineItems.length} line items</div>
                      </div>
                    </div>

                    <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>PO Date</div>
                          <div className="mt-1" style={{ color: "var(--color-text-primary)" }}>{formatDateTimeDisplay(selectedPoDetail.purchaseOrder.issueDate)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Expected</div>
                          <div className="mt-1" style={{ color: "var(--color-text-primary)" }}>{formatDateTimeDisplay(selectedPoDetail.purchaseOrder.expectedDate)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Received</div>
                          <div className="mt-1" style={{ color: "var(--color-text-primary)" }}>{formatDateTimeDisplay(selectedPoDetail.purchaseOrder.receivedDate)}</div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Vendor Contact</div>
                          <div className="mt-1" style={{ color: "var(--color-text-primary)" }}>{selectedPoDetail.vendor?.email || "No email"}</div>
                          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{selectedPoDetail.vendor?.phone || "No phone"}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>QuickBooks ID</div>
                          <div className="mt-1 break-all" style={{ color: "var(--color-text-primary)" }}>{selectedPoDetail.purchaseOrder.qbPurchaseOrderId || "Local Hearth OS PO"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                      <div className="px-4 py-3 flex items-center justify-between" style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                        <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Line Items</h3>
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{selectedPoDetail.lineItems.length}</span>
                      </div>
                      {selectedPoDetail.lineItems.length === 0 ? (
                        <div className="p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>No line items found for this purchase order.</div>
                      ) : (
                        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                          {selectedPoDetail.lineItems.map((line, idx) => (
                            <div key={line.id || idx} className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{line.description || "Line item"}</div>
                                  <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                                    Qty {Number(line.quantity || 0).toLocaleString()} - Received {Number(line.receivedQty || 0).toLocaleString()} - Unit {formatMoney(Number(line.unitCost || 0))}
                                  </div>
                                  {line.qbItemId && <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Item ID: {line.qbItemId}</div>}
                                </div>
                                <div className="text-sm font-bold shrink-0" style={{ color: "var(--color-text-primary)" }}>{formatMoney(Number(line.total || 0))}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {(selectedPoDetail.purchaseOrder.shipAddress || selectedPoDetail.purchaseOrder.privateNote || selectedPoDetail.purchaseOrder.vendorMessage) && (
                      <div className="grid grid-cols-1 gap-3">
                        {selectedPoDetail.purchaseOrder.shipAddress && (
                          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                            <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Ship Address</div>
                            <div className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--color-text-primary)" }}>{selectedPoDetail.purchaseOrder.shipAddress}</div>
                          </div>
                        )}
                        {selectedPoDetail.purchaseOrder.privateNote && (
                          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                            <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Internal Note</div>
                            <div className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--color-text-primary)" }}>{selectedPoDetail.purchaseOrder.privateNote}</div>
                          </div>
                        )}
                        {selectedPoDetail.purchaseOrder.vendorMessage && (
                          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                            <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Vendor Message</div>
                            <div className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--color-text-primary)" }}>{selectedPoDetail.purchaseOrder.vendorMessage}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {sendDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/55" onClick={() => !saving && setSendDialogOpen(false)} />
            <div className="relative w-full max-w-[1500px] max-h-[88vh] rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Send email</h2>
                <button disabled={saving} onClick={() => setSendDialogOpen(false)} className="w-9 h-9 rounded-lg text-lg" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>x</button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_640px] gap-0 overflow-y-auto max-h-[calc(88vh-128px)]">
                <div className="p-5 space-y-4">
                  {sendStatus && (
                    <div
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{
                        background: sendStatus.type === "error" ? "rgba(255,32,78,0.12)" : sendStatus.type === "success" ? "rgba(22,163,74,0.12)" : "rgba(37,99,235,0.10)",
                        border: sendStatus.type === "error" ? "1px solid rgba(255,32,78,0.35)" : sendStatus.type === "success" ? "1px solid rgba(22,163,74,0.25)" : "1px solid rgba(37,99,235,0.22)",
                        color: sendStatus.type === "error" ? "#FF204E" : sendStatus.type === "success" ? "#15803D" : "#2563EB",
                      }}
                    >
                      {sendStatus.message}
                    </div>
                  )}
                  <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 items-center">
                    <label className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>To</label>
                    <input value={vendorEmail} onChange={(event) => setVendorEmail(event.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                  <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 items-center">
                    <label className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>Cc/Bcc</label>
                    <input value={ccBcc} onChange={(event) => setCcBcc(event.target.value)} placeholder="Optional" className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                  <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 items-center">
                    <label className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>Subject</label>
                    <input value={sendSubject} onChange={(event) => setSendSubject(event.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  </div>
                  <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3">
                    <div></div>
                    <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Purchase order PDF</div>
                  </div>
                  <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 items-center">
                    <div></div>
                    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      <input type="checkbox" checked={sendMeCopy} onChange={(event) => setSendMeCopy(event.target.checked)} />
                      Send me a copy
                    </label>
                  </div>
                  <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3">
                    <label className="text-sm font-semibold pt-2" style={{ color: "var(--color-text-muted)" }}>Email body</label>
                    <textarea
                      value={sendBody}
                      onChange={(event) => setSendBody(event.target.value)}
                      rows={10}
                      className="px-3 py-2 rounded-lg text-sm resize-none"
                      style={{ background: "var(--color-surface-3)", border: "1px solid #16A34A", color: "var(--color-text-primary)" }}
                    />
                  </div>
                </div>

                <div className="p-5" style={{ background: "#777" }}>
                  <div className="mx-auto bg-white text-black shadow-2xl" style={{ width: "560px", minHeight: "720px", padding: "34px 34px 54px" }}>
                    <div className="font-bold text-sm">AARON&apos;S FIREPLACE CO, LLC</div>
                    <div className="mt-2 text-xs leading-5">
                      <div>611 E HARRISON ST</div>
                      <div>REPUBLIC, MO&nbsp;&nbsp;65738</div>
                      <div>+14177329775</div>
                      <div>aaronsfireplaceco@yahoo.com</div>
                    </div>

                    <div className="mt-12 text-xl" style={{ color: "#666" }}>Purchase Order</div>
                    <div className="mt-5 grid grid-cols-[1fr_1fr_120px] gap-8 text-xs">
                      <div>
                        <div className="uppercase" style={{ color: "#8a8f98" }}>Vendor</div>
                        <div className="mt-1 font-medium">{selectedVendor?.DisplayName || vendorQuery}</div>
                        <div className="whitespace-pre-line">{mailingAddress}</div>
                      </div>
                      <div>
                        <div className="uppercase" style={{ color: "#8a8f98" }}>Ship To</div>
                        <div className="mt-1 font-medium">{shipTo}</div>
                        <div className="whitespace-pre-line">{shippingAddress}</div>
                      </div>
                      <div className="grid grid-cols-[42px_1fr] gap-x-2 content-start">
                        <div className="uppercase" style={{ color: "#8a8f98" }}>P.O.</div>
                        <div className="font-medium">{previewPoNumber}</div>
                        <div className="uppercase mt-1" style={{ color: "#8a8f98" }}>Date</div>
                        <div className="mt-1 font-medium">{formatDateDisplay(txnDate)}</div>
                      </div>
                    </div>

                    <div className="mt-8 grid grid-cols-[minmax(0,1fr)_55px_70px_80px] gap-2 px-2 py-2 text-xs uppercase" style={{ background: "#dedede", color: "#666" }}>
                      <div>Product</div>
                      <div className="text-right">Qty</div>
                      <div className="text-right">Rate</div>
                      <div className="text-right">Amount</div>
                    </div>
                    <div className="text-xs">
                      {lines.filter((line) => line.itemId || line.description).map((line, idx) => (
                        <div key={idx} className="grid grid-cols-[minmax(0,1fr)_55px_70px_80px] gap-2 py-2">
                          <div>{buildDescriptionWithPart(cleanLineDescription(line.description, line.partNumber), line.partNumber)}</div>
                          <div className="text-right">{Number(line.qty || 0)}</div>
                          <div className="text-right">{Number(line.unitPrice || 0).toFixed(2)}</div>
                          <div className="text-right">{(Number(line.qty || 0) * Number(line.unitPrice || 0)).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 border-t border-dashed pt-5 grid grid-cols-[1fr_160px] gap-5 text-sm">
                      <div style={{ color: "#8a8f98" }}>{sourceEstimate?.DocNumber ? `${sourceEstimate.DocNumber}:` : ""}</div>
                      <div className="space-y-3">
                        <div className="flex justify-between"><span style={{ color: "#8a8f98" }}>SUBTOTAL</span><span>{totals.subtotal.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span style={{ color: "#8a8f98" }}>TOTAL</span><span>${totals.subtotal.toFixed(2)}</span></div>
                      </div>
                    </div>
                    <div className="mt-16 grid grid-cols-[90px_1fr] gap-y-8 text-xs" style={{ color: "#8a8f98" }}>
                      <div>Approved By</div><div className="border-b"></div>
                      <div>Date</div><div className="border-b"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--color-border)" }}>
                <button disabled={saving} onClick={() => setSendDialogOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Cancel</button>
                <div className="flex gap-2">
                  <button disabled={saving} onClick={() => window.print()} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>Print</button>
                  <button disabled={saving} onClick={() => createPO(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#16A34A", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Sending..." : "Send and close"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
