"use client";

import { useState } from "react";
import Link from "next/link";

// Mock invoice data (will be replaced with QuickBooks data)
const mockInvoices = [
  {
    id: "inv-001",
    invoiceNumber: "INV-2024-0891",
    qbInvoiceId: "QB-INV-891",
    customer: { id: "cust-001", name: "Linda Martinez" },
    jobNumber: "JOB-2024-0089",
    jobTitle: "Annual Cleaning & Inspection",
    issueDate: "2024-02-20",
    dueDate: "2024-03-20",
    status: "sent",
    subtotal: 250.00,
    taxAmount: 20.00,
    totalAmount: 270.00,
    balance: 270.00,
    lineItems: [
      { description: "Annual Fireplace Cleaning", qty: 1, unitPrice: 185.00, total: 185.00 },
      { description: "Safety Inspection", qty: 1, unitPrice: 65.00, total: 65.00 },
    ],
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-2024-0890",
    qbInvoiceId: "QB-INV-890",
    customer: { id: "cust-002", name: "Robert Chen" },
    jobNumber: "JOB-2024-0090",
    jobTitle: "Gas Fireplace Installation",
    issueDate: "2024-02-25",
    dueDate: "2024-03-25",
    status: "draft",
    subtotal: 3800.00,
    taxAmount: 304.00,
    totalAmount: 4104.00,
    balance: 4104.00,
    lineItems: [
      { description: "Napoleon GVFL60 Gas Fireplace Unit", qty: 1, unitPrice: 2400.00, total: 2400.00 },
      { description: "Installation Labor (8 hrs)", qty: 8, unitPrice: 125.00, total: 1000.00 },
      { description: "Gas Line Connection", qty: 1, unitPrice: 250.00, total: 250.00 },
      { description: "Permits & Inspection", qty: 1, unitPrice: 150.00, total: 150.00 },
    ],
  },
  {
    id: "inv-003",
    invoiceNumber: "INV-2024-0889",
    qbInvoiceId: "QB-INV-889",
    customer: { id: "cust-003", name: "Patricia Williams" },
    jobNumber: "JOB-2024-0091",
    jobTitle: "Pilot Light Repair",
    issueDate: "2024-02-24",
    dueDate: "2024-03-24",
    status: "paid",
    subtotal: 165.00,
    taxAmount: 13.20,
    totalAmount: 178.20,
    balance: 0,
    lineItems: [
      { description: "Pilot Light Repair - Labor (1.5 hrs)", qty: 1.5, unitPrice: 95.00, total: 142.50 },
      { description: "Thermocouple Replacement", qty: 1, unitPrice: 22.50, total: 22.50 },
    ],
  },
  {
    id: "inv-004",
    invoiceNumber: "INV-2024-0888",
    qbInvoiceId: "QB-INV-888",
    customer: { id: "cust-005", name: "Susan Park" },
    jobNumber: "JOB-2024-0093",
    jobTitle: "Pellet Stove Service",
    issueDate: "2024-02-10",
    dueDate: "2024-03-10",
    status: "overdue",
    subtotal: 245.00,
    taxAmount: 19.60,
    totalAmount: 264.60,
    balance: 264.60,
    lineItems: [
      { description: "Pellet Stove Annual Service", qty: 1, unitPrice: 195.00, total: 195.00 },
      { description: "Auger Motor Replacement", qty: 1, unitPrice: 50.00, total: 50.00 },
    ],
  },
];

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
  sent: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  paid: { bg: "rgba(74,222,128,0.12)", text: "#4ade80", border: "rgba(74,222,128,0.25)" },
  overdue: { bg: "rgba(248,113,113,0.12)", text: "#f87171", border: "rgba(248,113,113,0.25)" },
  void: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
};

export default function InvoicesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<typeof mockInvoices[0] | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredInvoices = mockInvoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.jobTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalOutstanding = mockInvoices
    .filter((i) => i.balance > 0)
    .reduce((sum, i) => sum + i.balance, 0);

  const totalOverdue = mockInvoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + i.balance, 0);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* Sidebar */}
      <div
        className="w-[220px] flex-shrink-0 flex flex-col"
        style={{ background: "var(--color-surface-1)", borderRight: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #f97316, #ea6c0a)", boxShadow: "0 0 16px rgba(249,115,22,0.35)" }}
          >
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>HearthOS</div>
            <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Field Service</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { href: "/", label: "Dashboard", icon: "📊" },
            { href: "/jobs", label: "Jobs", icon: "📋" },
            { href: "/customers", label: "Customers", icon: "👥" },
            { href: "/schedule", label: "Schedule", icon: "📅" },
            { href: "/dispatch", label: "Dispatch", icon: "🗺️" },
            { href: "/invoices", label: "Invoices", icon: "💰", active: true },
            { href: "/integrations/quickbooks", label: "QuickBooks", icon: "📗" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${item.active ? "font-semibold" : ""}`}
              style={{
                background: item.active ? "var(--color-surface-3)" : "transparent",
                color: item.active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Invoices</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Synced with QuickBooks Online
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Sync from QB
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(135deg, #f97316, #ea6c0a)", color: "white", boxShadow: "0 0 16px rgba(249,115,22,0.25)" }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New Invoice
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div
          className="px-6 py-4 grid grid-cols-4 gap-4 flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          {[
            { label: "Total Outstanding", value: `$${totalOutstanding.toLocaleString()}`, color: "#60a5fa" },
            { label: "Overdue", value: `$${totalOverdue.toLocaleString()}`, color: "#f87171" },
            { label: "Paid This Month", value: "$178", color: "#4ade80" },
            { label: "Draft", value: `${mockInvoices.filter(i => i.status === "draft").length} invoices`, color: "#9ca3af" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg p-3"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
            >
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
                        {invoice.qbInvoiceId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(44,160,28,0.12)", color: "#2ca01c" }}>
                            QB Synced
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>
                        {invoice.customer.name}
                      </h3>
                      <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                        {invoice.jobTitle}
                      </p>
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
                        <div className="text-sm mt-0.5" style={{ color: invoice.status === "overdue" ? "#f87171" : "var(--color-text-muted)" }}>
                          ${invoice.balance.toLocaleString()} due
                        </div>
                      )}
                      {invoice.balance === 0 && (
                        <div className="text-sm mt-0.5" style={{ color: "#4ade80" }}>Paid in full</div>
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
          </div>

          {/* Invoice Detail Panel */}
          {selectedInvoice && (
            <div
              className="w-[420px] flex-shrink-0 overflow-y-auto border-l"
              style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
            >
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Invoice Details</h2>
                <button onClick={() => setSelectedInvoice(null)} className="p-1 rounded-lg" style={{ color: "var(--color-text-muted)" }}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
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
                  <h3 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>{selectedInvoice.customer.name}</h3>
                  <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{selectedInvoice.jobTitle}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    <span>Issued: {selectedInvoice.issueDate}</span>
                    <span>Due: {selectedInvoice.dueDate}</span>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <h4 className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Line Items</h4>
                  <div className="space-y-2">
                    {selectedInvoice.lineItems.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <div className="flex-1">
                          <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>{item.description}</div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                            {item.qty} × ${item.unitPrice.toFixed(2)}
                          </div>
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
                      <span>${selectedInvoice.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      <span>Tax (8%)</span>
                      <span>${selectedInvoice.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2" style={{ color: "var(--color-text-primary)", borderTop: "1px solid var(--color-border)" }}>
                      <span>Total</span>
                      <span>${selectedInvoice.totalAmount.toFixed(2)}</span>
                    </div>
                    {selectedInvoice.balance > 0 && (
                      <div className="flex justify-between font-bold" style={{ color: selectedInvoice.status === "overdue" ? "#f87171" : "#60a5fa" }}>
                        <span>Balance Due</span>
                        <span>${selectedInvoice.balance.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  {selectedInvoice.status === "draft" && (
                    <button
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: "linear-gradient(135deg, #2ca01c, #1e7a14)", color: "white" }}
                    >
                      Send to QuickBooks & Email Customer
                    </button>
                  )}
                  {selectedInvoice.status === "sent" && (
                    <button
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", color: "white" }}
                    >
                      Record Payment
                    </button>
                  )}
                  {selectedInvoice.status === "overdue" && (
                    <button
                      className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: "linear-gradient(135deg, #f97316, #ea6c0a)", color: "white" }}
                    >
                      Send Payment Reminder
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      Download PDF
                    </button>
                    <button
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      Open in QB →
                    </button>
                  </div>
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
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Customer *</label>
                <input
                  type="text"
                  placeholder="Search QuickBooks customers..."
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Issue Date *</label>
                  <input type="date" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Due Date</label>
                  <input type="date" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Line Items *</label>
                  <button className="text-xs font-medium" style={{ color: "#f97316" }}>+ Add Item from QB</button>
                </div>
                <div className="space-y-2">
                  {[1].map((_, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input
                        type="text"
                        placeholder="Description"
                        className="col-span-6 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        className="col-span-2 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <input
                        type="number"
                        placeholder="Price"
                        className="col-span-3 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                      />
                      <button className="col-span-1 flex items-center justify-center rounded-lg" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "#f87171" }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button className="mt-2 text-sm font-medium" style={{ color: "#f97316" }}>+ Add Line Item</button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Notes</label>
                <textarea rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
              </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                Cancel
              </button>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                  Save as Draft
                </button>
                <button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "linear-gradient(135deg, #2ca01c, #1e7a14)", color: "white" }}>
                  Create & Send to QB
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
