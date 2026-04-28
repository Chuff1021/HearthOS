"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import PnlModal from "@/components/PnlModal";

interface InvoiceLineItem {
  id: string;
  description: string;
  itemId?: string;
  itemName?: string;
  partNumber?: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  jobNumber?: string;
  jobTitle: string;
  issueDate: string;
  dueDate: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  balance: number;
  lineItems: InvoiceLineItem[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  id: string;
  displayName: string;
}

interface Item {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  Sku?: string;
  UnitPrice?: number;
}

function normalizeSearchValue(value: string | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearchQuery(query: string, ...fields: Array<string | undefined>) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  return fields.some((field) => {
    const normalizedField = normalizeSearchValue(field);
    if (!normalizedField) return false;
    if (normalizedField.includes(normalizedQuery)) return true;
    return queryTokens.every((token) => normalizedField.includes(token));
  });
}

function normalizeDateValue(value: string | undefined) {
  if (!value) return "";
  return value.split("T")[0];
}

function isWithinDateRange(value: string | undefined, from: string, to: string) {
  const normalizedValue = normalizeDateValue(value);
  if (!normalizedValue) return false;
  if (from && normalizedValue < from) return false;
  if (to && normalizedValue > to) return false;
  return true;
}

function recalcLineItem(item: InvoiceLineItem): InvoiceLineItem {
  const qty = Math.max(0, Number(item.qty || 0));
  const unitPrice = Math.max(0, Number(item.unitPrice || 0));
  return {
    ...item,
    qty,
    unitPrice,
    total: qty * unitPrice,
  };
}

function buildInvoiceScheduleTitle(invoice: Invoice) {
  const existingTitle = (invoice.jobTitle || "").trim();
  if (existingTitle && existingTitle.toLowerCase() !== "new job") {
    return existingTitle;
  }

  const firstLine = invoice.lineItems
    .map((line) => line.description.trim())
    .find(Boolean);
  if (firstLine) {
    return `${invoice.customerName} - ${firstLine}`;
  }

  return `${invoice.customerName} - Invoice ${invoice.invoiceNumber}`;
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
  sent: { bg: "rgba(29,78,216,0.12)", text: "#2563EB", border: "rgba(29,78,216,0.25)" },
  paid: { bg: "rgba(152,205,0,0.12)", text: "#98CD00", border: "rgba(152,205,0,0.25)" },
  overdue: { bg: "rgba(255,32,78,0.12)", text: "#FF204E", border: "rgba(255,32,78,0.25)" },
  void: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
};

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [metricFilter, setMetricFilter] = useState<"all" | "outstanding" | "overdue" | "paid" | "draft">("all");
  const [dateField, setDateField] = useState<"issueDate" | "dueDate">("issueDate");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [pnlOpen, setPnlOpen] = useState<{ id: string; label: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [squareSignals, setSquareSignals] = useState<Record<string, { status: string; amount: number; paymentDate: string }>>({});
  const [reconcilingSquare, setReconcilingSquare] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [sendingInvoiceEmail, setSendingInvoiceEmail] = useState(false);
  const selectedInvoiceId = searchParams.get("id");
  const selectedCustomerId = searchParams.get("customer");

  // Create form state
  const [createForm, setCreateForm] = useState({
    customerId: "",
    customerName: "",
    jobTitle: "",
    jobNumber: "",
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    taxRate: 8,
    notes: "",
    lineItems: [{ description: "", itemId: "", partNumber: "", qty: 1, unitPrice: 0 }],
  });

  function getItemPartNumber(item: Item | undefined) {
    return item?.Sku || item?.FullyQualifiedName || item?.Name || "";
  }

  function buildInvoiceDocument(invoice: Invoice) {
    const billTo = invoice.customerName || "Customer";
    const lines = invoice.lineItems.map((line) => ({
      description: line.description,
      partNumber: line.partNumber || line.itemName || "",
      qty: Number(line.qty || 0),
      unitPrice: Number(line.unitPrice || 0),
      total: Number(line.total || 0),
    }));

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${invoice.invoiceNumber}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 36px; color: #111827; }
      .header { display: flex; justify-content: space-between; margin-bottom: 28px; }
      .brand { font-size: 28px; font-weight: 700; }
      .doc { text-align: right; }
      .doc h1 { margin: 0; font-size: 30px; }
      .muted { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
      .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
      th { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }
      th:last-child, td:last-child { text-align: right; }
      .desc { font-weight: 600; }
      .part { color: #6b7280; font-size: 12px; margin-top: 4px; }
      .totals { width: 320px; margin-left: auto; margin-top: 20px; }
      .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
      .total { border-top: 2px solid #111827; margin-top: 8px; padding-top: 10px; font-size: 18px; font-weight: 700; }
      .note { margin-top: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="muted">Invoice</div>
        <div class="brand">HearthOS</div>
      </div>
      <div class="doc">
        <h1>Invoice</h1>
        <div># ${invoice.invoiceNumber}</div>
      </div>
    </div>
    <div class="meta">
      <div class="card">
        <div class="muted">Bill To</div>
        <div style="font-weight:700; margin-top:6px;">${billTo}</div>
        <div style="margin-top:6px;">${invoice.jobTitle || ""}</div>
      </div>
      <div class="card">
        <div><strong>Issue Date:</strong> ${invoice.issueDate}</div>
        <div style="margin-top:6px;"><strong>Due Date:</strong> ${invoice.dueDate}</div>
        <div style="margin-top:6px;"><strong>Status:</strong> ${invoice.status.toUpperCase()}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map((line) => `
          <tr>
            <td>
              <div class="desc">${line.description}</div>
              ${line.partNumber ? `<div class="part">Part: ${line.partNumber}</div>` : ""}
            </td>
            <td>${line.qty}</td>
            <td>$${line.unitPrice.toFixed(2)}</td>
            <td>$${line.total.toFixed(2)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>$${invoice.subtotal.toFixed(2)}</span></div>
      <div><span>Tax</span><span>$${invoice.taxAmount.toFixed(2)}</span></div>
      <div class="total"><span>Total</span><span>$${invoice.totalAmount.toFixed(2)}</span></div>
      <div><span>Balance Due</span><span>$${invoice.balance.toFixed(2)}</span></div>
    </div>
    ${invoice.notes ? `<div class="note"><strong>Notes</strong><div style="margin-top:8px;">${invoice.notes}</div></div>` : ""}
  </body>
</html>`;
  }

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try QuickBooks endpoint first
      const res = await fetch("/api/quickbooks/invoices?live=true", { cache: "no-store" });
      const data = await res.json();
      
      if (data.error) {
        // Fallback to local if QB not connected
        const localRes = await fetch("/api/invoices");
        const localData = await localRes.json();
        if (localData.error) {
          setError(localData.error);
        } else {
          setInvoices(localData.invoices || []);
        }
      } else {
        setInvoices(data.invoices || []);
      }
    } catch {
      // Fallback to local API on error
      try {
        const localRes = await fetch("/api/invoices");
        const localData = await localRes.json();
        setInvoices(localData.invoices || []);
      } catch {
        setError("Failed to load invoices");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      // Try QuickBooks first
      const res = await fetch("/api/quickbooks/customers?live=true");
      const data = await res.json();
      if (data.customers) {
        setCustomers(data.customers || []);
        return;
      }
      // Fallback to local
      const localRes = await fetch("/api/customers");
      const localData = await localRes.json();
      setCustomers(localData.customers || []);
    } catch {
      // Silently fail — customers are optional for display
    }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/quickbooks/items?sync=true");
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) {
        setItems(data.items || []);
      }
    } catch {
      // optional
    }
  }, []);

  const fetchSquareSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/square/transactions?limit=200', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.payments)) return;

      const byInvoice: Record<string, { status: string; amount: number; paymentDate: string }> = {};
      for (const p of data.payments as Array<{ invoiceNumber?: string; status?: string; amount?: number; paymentDate?: string }>) {
        const invoiceNumber = (p.invoiceNumber || '').trim();
        if (!invoiceNumber) continue;
        const prev = byInvoice[invoiceNumber];
        if (!prev || +new Date(p.paymentDate || 0) > +new Date(prev.paymentDate || 0)) {
          byInvoice[invoiceNumber] = {
            status: String(p.status || 'pending'),
            amount: Number(p.amount || 0),
            paymentDate: String(p.paymentDate || new Date().toISOString()),
          };
        }
      }
      setSquareSignals(byInvoice);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
    fetchItems();
    fetchSquareSignals();
    const t = setInterval(fetchSquareSignals, 30000);
    return () => clearInterval(t);
  }, [fetchInvoices, fetchCustomers, fetchItems, fetchSquareSignals]);

  useEffect(() => {
    async function reconcileSquarePayments() {
      const candidates = invoices.filter((inv) => {
        const s = squareSignals[inv.invoiceNumber];
        return !!s && s.status === 'completed' && inv.balance > 0 && s.amount >= inv.balance;
      });

      if (!candidates.length) return;
      setReconcilingSquare(true);
      try {
        for (const inv of candidates) {
          await fetch('/api/invoices', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: inv.id,
              status: 'paid',
              balance: 0,
              notes: `${inv.notes || ''}${inv.notes ? '\n' : ''}Auto-marked paid from Square (${new Date().toISOString()}).`,
            }),
          });
        }
        fetchInvoices();
      } finally {
        setReconcilingSquare(false);
      }
    }

    reconcileSquarePayments();
  }, [invoices, squareSignals, fetchInvoices]);

  const dateFilteredInvoices = invoices.filter((inv) =>
    isWithinDateRange(dateField === "issueDate" ? inv.issueDate : inv.dueDate, dateFrom, dateTo),
  );

  const filteredInvoices = dateFilteredInvoices.filter((inv) => {
    const matchesSearch = matchesSearchQuery(
      searchQuery,
      inv.invoiceNumber,
      inv.customerName,
      inv.jobTitle,
      inv.notes,
    );
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchesMetric =
      metricFilter === "all" ||
      (metricFilter === "outstanding" && inv.balance > 0) ||
      (metricFilter === "overdue" && inv.status === "overdue") ||
      (metricFilter === "paid" && inv.status === "paid") ||
      (metricFilter === "draft" && inv.status === "draft");
    return matchesSearch && matchesStatus && matchesMetric;
  });

  useEffect(() => {
    if (selectedInvoiceId) {
      const matchedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId);
      if (matchedInvoice) {
        setSelectedInvoice(matchedInvoice);
        return;
      }
    }

    if (selectedCustomerId && !selectedInvoiceId) {
      const firstCustomerInvoice = invoices.find((invoice) => invoice.customerId === selectedCustomerId);
      if (firstCustomerInvoice) {
        setSelectedInvoice(firstCustomerInvoice);
      }
    }

    if (!selectedInvoiceId && !selectedCustomerId && invoices.length && !selectedInvoice) {
      setSelectedInvoice(invoices[0]);
    }
  }, [invoices, selectedInvoiceId, selectedCustomerId, selectedInvoice]);

  useEffect(() => {
    if (!filteredInvoices.length) {
      setSelectedInvoice(null);
      return;
    }

    if (!selectedInvoice || !filteredInvoices.some((invoice) => invoice.id === selectedInvoice.id)) {
      setSelectedInvoice(filteredInvoices[0]);
    }
  }, [filteredInvoices, selectedInvoice]);

  useEffect(() => {
    if (!selectedInvoice) return;
    const refreshed = invoices.find((invoice) => invoice.id === selectedInvoice.id);
    if (refreshed) {
      setSelectedInvoice(refreshed);
    }
  }, [invoices, selectedInvoice?.id]);

  const totalOutstanding = dateFilteredInvoices.filter((i) => i.balance > 0).reduce((sum, i) => sum + i.balance, 0);
  const totalOverdue = dateFilteredInvoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.balance, 0);
  const paidTotal = dateFilteredInvoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.totalAmount, 0);
  const draftCount = dateFilteredInvoices.filter((i) => i.status === "draft").length;

  const toggleMetricFilter = (nextFilter: "all" | "outstanding" | "overdue" | "paid" | "draft") => {
    setMetricFilter((current) => current === nextFilter ? "all" : nextFilter);
  };

  const resetCreateForm = () => {
    setCreateForm({
      customerId: "",
      customerName: "",
      jobTitle: "",
      jobNumber: "",
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      taxRate: 8,
      notes: "",
      lineItems: [{ description: "", itemId: "", partNumber: "", qty: 1, unitPrice: 0 }],
    });
  };

  const addLineItem = () => {
    setCreateForm({
      ...createForm,
      lineItems: [...createForm.lineItems, { description: "", itemId: "", partNumber: "", qty: 1, unitPrice: 0 }],
    });
  };

  const removeLineItem = (idx: number) => {
    if (createForm.lineItems.length <= 1) return;
    setCreateForm({
      ...createForm,
      lineItems: createForm.lineItems.filter((_, i) => i !== idx),
    });
  };

  const updateLineItem = (idx: number, field: string, value: string | number) => {
    const items = [...createForm.lineItems];
    items[idx] = { ...items[idx], [field]: value };
    setCreateForm({ ...createForm, lineItems: items });
  };

  const applyItemToCreateLine = (idx: number, itemId: string) => {
    const item = items.find((entry) => entry.Id === itemId);
    const nextLine = {
      ...createForm.lineItems[idx],
      itemId,
      description: item?.Name || createForm.lineItems[idx].description,
      partNumber: getItemPartNumber(item),
      unitPrice: Number(item?.UnitPrice || createForm.lineItems[idx].unitPrice || 0),
    };
    const nextLines = [...createForm.lineItems];
    nextLines[idx] = nextLine;
    setCreateForm({ ...createForm, lineItems: nextLines });
  };

  const handleCreateInvoice = async () => {
    setSaving(true);
    try {
      const lineItems = createForm.lineItems.map((li) => ({
        description: li.description,
        itemId: li.itemId || undefined,
        itemName: items.find((entry) => entry.Id === li.itemId)?.Name,
        partNumber: li.partNumber || undefined,
        qty: li.qty,
        unitPrice: li.unitPrice,
        total: li.qty * li.unitPrice,
      }));

      // Try QuickBooks first
      const qbRes = await fetch("/api/quickbooks/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: createForm.customerId,
          customerName: createForm.customerName,
          jobTitle: createForm.jobTitle,
          jobNumber: createForm.jobNumber || undefined,
          issueDate: createForm.issueDate,
          dueDate: createForm.dueDate,
          taxRate: createForm.taxRate,
          notes: createForm.notes || undefined,
          lineItems,
        }),
      });

      const qbData = await qbRes.json();
      
      if (qbData.success) {
        // Success from QB
        setShowCreateModal(false);
        resetCreateForm();
        fetchInvoices();
        return;
      }
      
      // If QB fails with 401/not connected, fall through to local
      if (qbRes.status !== 401 && !qbData.error?.includes('Not connected')) {
        setError(qbData.error || "Failed to create invoice in QuickBooks");
        setSaving(false);
        return;
      }

      // Fallback to local API
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: createForm.customerId,
          customerName: createForm.customerName,
          jobTitle: createForm.jobTitle,
          jobNumber: createForm.jobNumber || undefined,
          issueDate: createForm.issueDate,
          dueDate: createForm.dueDate,
          taxRate: createForm.taxRate,
          notes: createForm.notes || undefined,
          lineItems,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        resetCreateForm();
        fetchInvoices();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create invoice");
      }
    } catch {
      setError("Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/invoices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          ...(status === "paid" ? { balance: 0 } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data.invoice);
        fetchInvoices();
      }
    } catch {
      setError("Failed to update invoice");
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    try {
      const res = await fetch(`/api/invoices?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedInvoice(null);
        fetchInvoices();
      }
    } catch {
      setError("Failed to delete invoice");
    }
  };

  const openInvoiceEmailDialog = (invoice: Invoice) => {
    setEmailInvoiceId(invoice.id);
    setEmailTo("");
    setEmailDialogOpen(true);
  };

  const handleEmailInvoice = async () => {
    if (!emailInvoiceId) return;
    setSendingInvoiceEmail(true);
    try {
      const res = await fetch("/api/quickbooks/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", id: emailInvoiceId, email: emailTo.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to email invoice");
      setEmailDialogOpen(false);
      setEmailInvoiceId(null);
      setEmailTo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to email invoice");
    } finally {
      setSendingInvoiceEmail(false);
    }
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(buildInvoiceDocument(invoice));
    w.document.close();
    w.focus();
    w.print();
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    const blob = new Blob([buildInvoiceDocument(invoice)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePayNow = (invoice: Invoice) => {
    const amount = invoice.balance > 0 ? invoice.balance : invoice.totalAmount;
    const q = new URLSearchParams({
      amount: String(Number(amount.toFixed(2))),
      customer: invoice.customerName,
      invoice: invoice.invoiceNumber,
    });
    window.location.href = `/payments?${q.toString()}`;
  };

  const handleScheduleJob = (invoice: Invoice) => {
    const customer = customers.find((entry) => entry.id === invoice.customerId) as (Customer & { address?: { line1?: string; city?: string; state?: string; zip?: string } }) | undefined;
    const customerAddress = customer?.address
      ? [
          customer.address.line1,
          [customer.address.city, customer.address.state].filter(Boolean).join(", "),
          customer.address.zip,
        ]
          .filter(Boolean)
          .join(" ")
          .trim()
      : "";
    const q = new URLSearchParams({
      create: "1",
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      address: customerAddress,
      title: buildInvoiceScheduleTitle(invoice),
      amount: String(invoice.totalAmount),
      jobType: "installation",
      linkedInvoiceId: invoice.id,
      linkedDocumentNumber: invoice.invoiceNumber,
    });
    window.location.href = `/schedule?${q.toString()}`;
  };

  const handleSaveInvoiceEdits = async () => {
    if (!selectedInvoice) return;
    const normalizedLines = selectedInvoice.lineItems
      .map(recalcLineItem)
      .filter((line) => line.description.trim().length > 0);

    if (!normalizedLines.length) {
      setError("At least one invoice line item is required");
      return;
    }

    try {
      const payload = {
        id: selectedInvoice.id,
        updates: {
          DueDate: selectedInvoice.dueDate,
          PrivateNote: selectedInvoice.notes || undefined,
          Line: normalizedLines.map((li, idx) => ({
            LineNum: idx + 1,
            Amount: li.qty * li.unitPrice,
            DetailType: "SalesItemLineDetail",
            Description: li.partNumber ? `${li.description}\nPart: ${li.partNumber}` : li.description,
            SalesItemLineDetail: {
              ItemRef: li.itemId ? { value: li.itemId, name: li.itemName || li.partNumber || li.description } : undefined,
              Qty: li.qty,
              UnitPrice: li.unitPrice,
            },
          })),
        },
      };

      const qbRes = await fetch("/api/quickbooks/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", ...payload }),
      });

      if (!qbRes.ok) {
        const localRes = await fetch("/api/invoices", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedInvoice.id,
            dueDate: selectedInvoice.dueDate,
            notes: selectedInvoice.notes,
            lineItems: normalizedLines,
          }),
        });
        if (!localRes.ok) {
          const localData = await localRes.json().catch(() => ({}));
          throw new Error(localData.error || "Failed to update invoice");
        }
      } else {
        const qbData = await qbRes.json().catch(() => ({}));
        if (qbData?.invoice) {
          setSelectedInvoice(qbData.invoice);
        }
      }

      setEditMode(false);
      await fetchInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice edits");
    }
  };

  const createSubtotal = createForm.lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const createTax = createSubtotal * (createForm.taxRate / 100);
  const createTotal = createSubtotal + createTax;

  const selectedSubtotal = selectedInvoice ? selectedInvoice.lineItems.reduce((s, li) => s + li.qty * li.unitPrice, 0) : 0;
  const selectedTax = selectedInvoice ? selectedSubtotal * ((selectedInvoice.taxRate || 0) / 100) : 0;
  const selectedTotal = selectedInvoice ? selectedSubtotal + selectedTax : 0;

  const handleSyncWithQuickBooks = async () => {
    setSyncing(true);
    try {
      await fetchInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync with QuickBooks");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {/* Page Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Invoices</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {loading ? "Loading..." : `${invoices.length} invoices`}
              {reconcilingSquare ? " · reconciling Square payments…" : ""}
            </p>
          </div>
          <button
            onClick={() => { resetCreateForm(); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white", boxShadow: "0 0 16px rgba(29,78,216,0.25)" }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Invoice
          </button>
          <button
            onClick={handleSyncWithQuickBooks}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "#2CA01C", color: "white" }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}>
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            {syncing ? 'Syncing...' : 'Sync QB'}
          </button>
        </div>

        {/* Summary Stats */}
        <div
          className="px-6 py-4 grid grid-cols-4 gap-4 flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          {[
            { key: "outstanding", label: "Total Outstanding", value: `$${totalOutstanding.toLocaleString()}`, color: "#2563EB" },
            { key: "overdue", label: "Overdue", value: `$${totalOverdue.toLocaleString()}`, color: "#FF204E" },
            { key: "paid", label: "Paid Total", value: `$${paidTotal.toLocaleString()}`, color: "#98CD00" },
            { key: "draft", label: "Drafts", value: `${draftCount} invoices`, color: "#9ca3af" },
          ].map((stat) => (
            <button
              key={stat.label}
              type="button"
              onClick={() => toggleMetricFilter(stat.key as "outstanding" | "overdue" | "paid" | "draft")}
              className="rounded-lg p-3 text-left transition-all"
              style={{
                background: metricFilter === stat.key ? "rgba(255,255,255,0.08)" : "var(--color-surface-2)",
                border: metricFilter === stat.key ? `1px solid ${stat.color}` : "1px solid var(--color-border)",
                boxShadow: metricFilter === stat.key ? `0 0 0 1px ${stat.color} inset` : "none",
              }}
            >
              <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{stat.label}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div
          className="px-6 py-3 flex items-center gap-4 flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex-1 relative">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }}>
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value as "issueDate" | "dueDate")}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <option value="issueDate">Issue Date</option>
            <option value="dueDate">Due Date</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setMetricFilter("all");
              setStatusFilter("all");
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            Clear
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Invoice List */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="rounded-lg px-4 py-3 text-sm mb-4" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.2)", color: "#FF204E" }}>
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin w-8 h-8" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-text-muted)" }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    onClick={() => setSelectedInvoice(invoice)}
                    className={`rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.005] ${selectedInvoice?.id === invoice.id ? "ring-2 ring-orange-500" : ""}`}
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>
                            {invoice.invoiceNumber}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: statusColors[invoice.status].bg, color: statusColors[invoice.status].text, border: `1px solid ${statusColors[invoice.status].border}` }}
                          >
                            {invoice.status.toUpperCase()}
                          </span>
                          {squareSignals[invoice.invoiceNumber] && (
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                              style={{
                                background: squareSignals[invoice.invoiceNumber].status === 'completed' ? 'rgba(152,205,0,0.12)' : 'rgba(29,78,216,0.12)',
                                color: squareSignals[invoice.invoiceNumber].status === 'completed' ? '#98CD00' : '#2563EB',
                                border: `1px solid ${squareSignals[invoice.invoiceNumber].status === 'completed' ? 'rgba(152,205,0,0.25)' : 'rgba(29,78,216,0.25)'}`,
                              }}
                            >
                              SQUARE {squareSignals[invoice.invoiceNumber].status.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>{invoice.customerName}</h3>
                        <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{invoice.jobTitle}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          <span>Issued: {invoice.issueDate}</span>
                          <span>Due: {invoice.dueDate}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>
                          ${invoice.totalAmount.toLocaleString()}
                        </div>
                        {invoice.balance > 0 && (
                          <div className="text-sm mt-0.5" style={{ color: invoice.status === "overdue" ? "#FF204E" : "var(--color-text-muted)" }}>
                            ${invoice.balance.toLocaleString()} due
                          </div>
                        )}
                        {invoice.balance === 0 && invoice.status === "paid" && (
                          <div className="text-sm mt-0.5" style={{ color: "#98CD00" }}>Paid in full</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {filteredInvoices.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">💰</div>
                    <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>No invoices found</p>
                    <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>Try adjusting your filters or create a new invoice</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invoice Detail Panel */}
          {selectedInvoice && (
            <div
              className="w-[420px] flex-shrink-0 overflow-y-auto border-l"
              style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
            >
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Invoice Details</h2>
                <div className="flex items-center gap-2">
                  {!editMode ? (
                    <>
                      <button
                        onClick={() => selectedInvoice && setPnlOpen({ id: selectedInvoice.id, label: selectedInvoice.invoiceNumber || selectedInvoice.id })}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)", color: "#9a5d12" }}
                      >
                        P&amp;L
                      </button>
                      <button onClick={() => setEditMode(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                        Edit
                      </button>
                    </>
                  ) : (
                    <button onClick={handleSaveInvoiceEdits} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#2563EB" }}>
                      Save
                    </button>
                  )}
                  <button onClick={() => { setEditMode(false); setSelectedInvoice(null); }} className="p-1 rounded-lg" style={{ color: "var(--color-text-muted)" }}>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Invoice Header */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm" style={{ color: "var(--color-text-muted)" }}>{selectedInvoice.invoiceNumber}</span>
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-md"
                      style={{ background: statusColors[selectedInvoice.status].bg, color: statusColors[selectedInvoice.status].text }}
                    >
                      {selectedInvoice.status.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>{selectedInvoice.customerName}</h3>
                  <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{selectedInvoice.jobTitle}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    <span>Issued: {selectedInvoice.issueDate}</span>
                    <span>
                      Due:{" "}
                      {editMode ? (
                        <input
                          type="date"
                          value={selectedInvoice.dueDate}
                          onChange={(e) => setSelectedInvoice({ ...selectedInvoice, dueDate: e.target.value })}
                          className="ml-1 px-1 py-0.5 rounded"
                          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                        />
                      ) : (
                        selectedInvoice.dueDate
                      )}
                    </span>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Line Items</h4>
                    {editMode ? (
                      <button
                        onClick={() =>
                          setSelectedInvoice({
                            ...selectedInvoice,
                            lineItems: [
                              ...selectedInvoice.lineItems,
                              { id: `line-${Date.now()}`, description: "", itemId: "", qty: 1, unitPrice: 0, total: 0, partNumber: "" },
                            ],
                          })
                        }
                        className="text-xs font-semibold px-2 py-1 rounded-md"
                        style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB" }}
                      >
                        Add Line
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {selectedInvoice.lineItems.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <div className="flex-1">
                          {editMode ? (
                            <div className="space-y-1">
                              <select
                                value={item.itemId || ""}
                                onChange={(e) => {
                                  const selectedItem = items.find((entry) => entry.Id === e.target.value);
                                  const lineItems = [...selectedInvoice.lineItems];
                                  lineItems[idx] = {
                                    ...lineItems[idx],
                                    itemId: e.target.value || undefined,
                                    itemName: selectedItem?.Name,
                                    partNumber: getItemPartNumber(selectedItem),
                                    description: selectedItem?.Name || lineItems[idx].description,
                                    unitPrice: Number(selectedItem?.UnitPrice || lineItems[idx].unitPrice || 0),
                                    total: Number(lineItems[idx].qty || 0) * Number(selectedItem?.UnitPrice || lineItems[idx].unitPrice || 0),
                                  };
                                  setSelectedInvoice({ ...selectedInvoice, lineItems });
                                }}
                                className="w-full px-2 py-1 rounded text-sm"
                                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                              >
                                <option value="">Select item</option>
                                {items.map((entry) => (
                                  <option key={entry.Id} value={entry.Id}>{entry.Name} · {getItemPartNumber(entry)}</option>
                                ))}
                              </select>
                              <input
                                value={item.description}
                                onChange={(e) => {
                                  const lineItems = [...selectedInvoice.lineItems];
                                  lineItems[idx] = { ...lineItems[idx], description: e.target.value };
                                  setSelectedInvoice({ ...selectedInvoice, lineItems });
                                }}
                                className="w-full px-2 py-1 rounded text-sm"
                                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                              />
                              <input
                                value={item.partNumber || ""}
                                onChange={(e) => {
                                  const lineItems = [...selectedInvoice.lineItems];
                                  lineItems[idx] = { ...lineItems[idx], partNumber: e.target.value };
                                  setSelectedInvoice({ ...selectedInvoice, lineItems });
                                }}
                                placeholder="Part number"
                                className="w-full px-2 py-1 rounded text-sm"
                                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                              />
                              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.qty}
                                  onChange={(e) => {
                                    const qty = Number(e.target.value || 1);
                                    const lineItems = [...selectedInvoice.lineItems];
                                    lineItems[idx] = { ...lineItems[idx], qty, total: qty * lineItems[idx].unitPrice };
                                    setSelectedInvoice({ ...selectedInvoice, lineItems });
                                  }}
                                  className="w-16 px-1 py-0.5 rounded"
                                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                                />
                                ×
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) => {
                                    const unitPrice = Number(e.target.value || 0);
                                    const lineItems = [...selectedInvoice.lineItems];
                                    lineItems[idx] = { ...lineItems[idx], unitPrice, total: unitPrice * lineItems[idx].qty };
                                    setSelectedInvoice({ ...selectedInvoice, lineItems });
                                  }}
                                  className="w-24 px-1 py-0.5 rounded"
                                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                                />
                                <button
                                  onClick={() => {
                                    const lineItems = selectedInvoice.lineItems.filter((_, lineIdx) => lineIdx !== idx);
                                    setSelectedInvoice({ ...selectedInvoice, lineItems });
                                  }}
                                  className="ml-auto px-2 py-1 rounded text-[11px] font-semibold"
                                  style={{ background: "rgba(255,68,0,0.12)", color: "#C2410C" }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>{item.description}</div>
                              {item.partNumber && (
                                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Part: {item.partNumber}</div>
                              )}
                              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                                {item.qty} × ${item.unitPrice.toFixed(2)}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="font-semibold text-sm ml-4" style={{ color: "var(--color-text-primary)" }}>
                          ${item.total.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      <span>Subtotal</span>
                      <span>${selectedSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      <span>Tax ({selectedInvoice.taxRate}%)</span>
                      <span>${selectedTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2" style={{ color: "var(--color-text-primary)", borderTop: "1px solid var(--color-border)" }}>
                      <span>Total</span>
                      <span>${selectedTotal.toFixed(2)}</span>
                    </div>
                    {selectedInvoice.balance > 0 && (
                      <div className="flex justify-between font-bold" style={{ color: selectedInvoice.status === "overdue" ? "#FF204E" : "#2563EB" }}>
                        <span>Balance Due</span>
                        <span>${selectedInvoice.balance.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {(selectedInvoice.notes || editMode) && (
                  <div>
                    <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>NOTES</h4>
                    {editMode ? (
                      <textarea
                        value={selectedInvoice.notes || ""}
                        onChange={(e) => setSelectedInvoice({ ...selectedInvoice, notes: e.target.value })}
                        rows={3}
                        className="w-full px-2 py-1 rounded text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                      />
                    ) : (
                      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{selectedInvoice.notes}</p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => openInvoiceEmailDialog(selectedInvoice)}
                      className="px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      Email
                    </button>
                    <button
                      onClick={() => handlePrintInvoice(selectedInvoice)}
                      className="px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      Print
                    </button>
                    <button
                      onClick={() => handleDownloadInvoice(selectedInvoice)}
                      className="px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      Download
                    </button>
                  </div>
                  <button
                    onClick={() => handleScheduleJob(selectedInvoice)}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                    style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.25)" }}
                  >
                    Create & Schedule Job
                  </button>
                  {selectedInvoice.balance > 0 && (
                    <button
                      onClick={() => handlePayNow(selectedInvoice)}
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: "linear-gradient(135deg, #f8971f, #f8971f)", color: "white" }}
                    >
                      Pay Now (Square)
                    </button>
                  )}
                  {selectedInvoice.status === "draft" && (
                    <button
                      onClick={() => handleUpdateStatus(selectedInvoice.id, "sent")}
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white" }}
                    >
                      Mark as Sent
                    </button>
                  )}
                  {(selectedInvoice.status === "sent" || selectedInvoice.status === "overdue") && (
                    <button
                      onClick={() => handleUpdateStatus(selectedInvoice.id, "paid")}
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: "linear-gradient(135deg, #98CD00, #98CD00)", color: "white" }}
                    >
                      Record Payment (Mark Paid)
                    </button>
                  )}
                  {selectedInvoice.status !== "void" && selectedInvoice.status !== "paid" && (
                    <button
                      onClick={() => handleUpdateStatus(selectedInvoice.id, "void")}
                      className="w-full px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      Void Invoice
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteInvoice(selectedInvoice.id)}
                    className="w-full px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.2)" }}
                  >
                    Delete Invoice
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div
            className="relative w-full max-w-2xl rounded-xl overflow-hidden"
            style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
          >
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h2 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>Create Invoice</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-lg" style={{ color: "var(--color-text-muted)" }}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Customer *</label>
                <select
                  value={createForm.customerId}
                  onChange={(e) => {
                    const cust = customers.find((c) => c.id === e.target.value);
                    setCreateForm({
                      ...createForm,
                      customerId: e.target.value,
                      customerName: cust?.displayName || "",
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                >
                  <option value="">Select a customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.displayName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Job Title *</label>
                <input
                  type="text"
                  value={createForm.jobTitle}
                  onChange={(e) => setCreateForm({ ...createForm, jobTitle: e.target.value })}
                  placeholder="e.g. Annual Cleaning & Inspection"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Issue Date</label>
                  <input
                    type="date"
                    value={createForm.issueDate}
                    onChange={(e) => setCreateForm({ ...createForm, issueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Due Date</label>
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Tax Rate %</label>
                  <input
                    type="number"
                    value={createForm.taxRate}
                    onChange={(e) => setCreateForm({ ...createForm, taxRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Line Items *</label>
                  <button onClick={addLineItem} className="text-xs font-medium" style={{ color: "#2563EB" }}>+ Add Line Item</button>
                </div>
                <div className="space-y-2">
                  {createForm.lineItems.map((li, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <select
                        value={li.itemId}
                        onChange={(e) => applyItemToCreateLine(idx, e.target.value)}
                        className="col-span-4 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      >
                        <option value="">Select item / part</option>
                        {items.map((item) => (
                          <option key={item.Id} value={item.Id}>{item.Name} · {getItemPartNumber(item)}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Description"
                        value={li.description}
                        onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                        className="col-span-3 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <input
                        type="text"
                        placeholder="Part #"
                        value={li.partNumber}
                        onChange={(e) => updateLineItem(idx, "partNumber", e.target.value)}
                        className="col-span-2 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={li.qty}
                        onChange={(e) => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                        className="col-span-1 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <input
                        type="number"
                        placeholder="Price"
                        value={li.unitPrice}
                        onChange={(e) => updateLineItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="col-span-1 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <div className="col-span-1 flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                          ${(li.qty * li.unitPrice).toFixed(2)}
                        </span>
                        {createForm.lineItems.length > 1 && (
                          <button onClick={() => removeLineItem(idx)} className="text-xs" style={{ color: "#FF204E" }}>✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Preview */}
              <div className="rounded-lg p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="flex justify-between text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  <span>Subtotal</span>
                  <span>${createSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  <span>Tax ({createForm.taxRate}%)</span>
                  <span>${createTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg mt-2 pt-2" style={{ color: "var(--color-text-primary)", borderTop: "1px solid var(--color-border)" }}>
                  <span>Total</span>
                  <span>${createTotal.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Notes</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </div>
            </div>

            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateInvoice}
                disabled={saving || !createForm.customerName || !createForm.jobTitle || createForm.lineItems.every((li) => !li.description)}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white" }}
              >
                {saving ? "Creating..." : "Create Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEmailDialogOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>Email Invoice</h2>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              This sends the invoice through QuickBooks using the customer email or the address you enter here.
            </p>
            <input
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="customer@email.com"
              className="mt-4 w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleEmailInvoice}
                disabled={sendingInvoiceEmail}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: "#2563EB", opacity: sendingInvoiceEmail ? 0.7 : 1 }}
              >
                {sendingInvoiceEmail ? "Sending..." : "Send from QuickBooks"}
              </button>
              <button
                onClick={() => setEmailDialogOpen(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pnlOpen && (
        <PnlModal type="invoice" id={pnlOpen.id} docLabel={pnlOpen.label} onClose={() => setPnlOpen(null)} />
      )}
    </div>
  );
}
