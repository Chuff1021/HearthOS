"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface InvoiceLineItem {
  id: string;
  description: string;
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

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
  sent: { bg: "rgba(29,78,216,0.12)", text: "#2563EB", border: "rgba(29,78,216,0.25)" },
  paid: { bg: "rgba(152,205,0,0.12)", text: "#98CD00", border: "rgba(152,205,0,0.25)" },
  overdue: { bg: "rgba(255,32,78,0.12)", text: "#FF204E", border: "rgba(255,32,78,0.25)" },
  void: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
    lineItems: [{ description: "", qty: 1, unitPrice: 0 }],
  });

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try QuickBooks endpoint first
      const res = await fetch("/api/quickbooks/invoices?live=true");
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

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
  }, [fetchInvoices, fetchCustomers]);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.jobTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalOutstanding = invoices.filter((i) => i.balance > 0).reduce((sum, i) => sum + i.balance, 0);
  const totalOverdue = invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.balance, 0);
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.totalAmount, 0);
  const draftCount = invoices.filter((i) => i.status === "draft").length;

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
      lineItems: [{ description: "", qty: 1, unitPrice: 0 }],
    });
  };

  const addLineItem = () => {
    setCreateForm({
      ...createForm,
      lineItems: [...createForm.lineItems, { description: "", qty: 1, unitPrice: 0 }],
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

  const handleCreateInvoice = async () => {
    setSaving(true);
    try {
      const lineItems = createForm.lineItems.map((li) => ({
        description: li.description,
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

  const handleEmailInvoice = async (invoice: Invoice) => {
    const email = window.prompt("Send invoice to email (leave blank to use QuickBooks default):", "") || undefined;
    try {
      const res = await fetch("/api/quickbooks/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", id: invoice.id, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to email invoice");
      alert("Invoice emailed successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to email invoice");
    }
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<html><head><title>${invoice.invoiceNumber}</title></head><body><h2>Invoice ${invoice.invoiceNumber}</h2><p>Customer: ${invoice.customerName}</p><p>Issue: ${invoice.issueDate}</p><p>Due: ${invoice.dueDate}</p><p>Total: $${invoice.totalAmount.toFixed(2)}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    const data = JSON.stringify(invoice, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveInvoiceEdits = async () => {
    if (!selectedInvoice) return;
    try {
      const payload = {
        id: selectedInvoice.id,
        updates: {
          DueDate: selectedInvoice.dueDate,
          PrivateNote: selectedInvoice.notes || undefined,
          Line: selectedInvoice.lineItems.map((li, idx) => ({
            LineNum: idx + 1,
            Amount: li.qty * li.unitPrice,
            DetailType: "SalesItemLineDetail",
            Description: li.description,
            SalesItemLineDetail: {
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
        await fetch("/api/invoices", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedInvoice.id,
            dueDate: selectedInvoice.dueDate,
            notes: selectedInvoice.notes,
            lineItems: selectedInvoice.lineItems,
          }),
        });
      }

      setEditMode(false);
      fetchInvoices();
    } catch {
      setError("Failed to save invoice edits");
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
      const res = await fetch("/api/quickbooks/invoices?sync=true", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        fetchInvoices();
      }
    } catch {
      setError("Failed to sync with QuickBooks");
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
            { label: "Total Outstanding", value: `$${totalOutstanding.toLocaleString()}`, color: "#2563EB" },
            { label: "Overdue", value: `$${totalOverdue.toLocaleString()}`, color: "#FF204E" },
            { label: "Paid Total", value: `$${paidTotal.toLocaleString()}`, color: "#98CD00" },
            { label: "Drafts", value: `${draftCount} invoices`, color: "#9ca3af" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{stat.label}</div>
            </div>
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
                    <button onClick={() => setEditMode(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                      Edit
                    </button>
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
                  <h4 className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Line Items</h4>
                  <div className="space-y-2">
                    {selectedInvoice.lineItems.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <div className="flex-1">
                          {editMode ? (
                            <div className="space-y-1">
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
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>{item.description}</div>
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
                      onClick={() => handleEmailInvoice(selectedInvoice)}
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
                      <input
                        type="text"
                        placeholder="Description"
                        value={li.description}
                        onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                        className="col-span-5 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={li.qty}
                        onChange={(e) => updateLineItem(idx, "qty", parseFloat(e.target.value) || 0)}
                        className="col-span-2 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <input
                        type="number"
                        placeholder="Price"
                        value={li.unitPrice}
                        onChange={(e) => updateLineItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="col-span-3 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <div className="col-span-2 flex items-center gap-2">
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
    </div>
  );
}
