"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface Customer {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  balance: number;
  active: boolean;
  tags: string[];
  totalJobs: number;
  totalRevenue: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomerProfile {
  customer: Customer;
  history: {
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      customerId: string;
      customerName: string;
      jobTitle: string;
      issueDate: string;
      dueDate: string;
      totalAmount: number;
      balance: number;
      status: "draft" | "sent" | "paid" | "overdue" | "void";
    }>;
    localInvoices: Array<{
      id: string;
      invoiceNumber: string;
      jobTitle: string;
      issueDate: string;
      totalAmount: number;
      balance: number;
      status: "draft" | "sent" | "paid" | "overdue" | "void";
    }>;
    payments: Array<{
      id: string;
      txnDate: string;
      totalAmt: number;
      unappliedAmt: number;
      paymentMethod?: string;
      linkedTxnIds: string[];
    }>;
    purchaseOrders: Array<{
      id: string;
      docNumber: string;
      txnDate?: string;
      vendorName?: string;
      totalAmt: number;
      memo?: string;
    }>;
  };
  summary: {
    quickbooksInvoiceCount: number;
    quickbooksPaymentCount: number;
    purchaseOrderCount: number;
    localInvoiceCount: number;
    totalRevenue: number;
    outstandingBalance: number;
    totalPaid: number;
  };
  source: "quickbooks" | "local";
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState<CustomerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Form state
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    email: "",
    phone: "",
    line1: "",
    city: "",
    state: "",
    zip: "",
    tags: "",
    notes: "",
  });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try QuickBooks endpoint first (with live to trigger sync)
      const url = searchQuery 
        ? `/api/quickbooks/customers?q=${encodeURIComponent(searchQuery)}&live=true` 
        : "/api/quickbooks/customers?live=true";
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.error) {
        // Fallback to local if QB not connected
        const localUrl = searchQuery 
          ? `/api/customers?q=${encodeURIComponent(searchQuery)}` 
          : "/api/customers";
        const localRes = await fetch(localUrl);
        const localData = await localRes.json();
        if (localData.error) {
          setError(localData.error);
          setCustomers([]);
        } else {
          setCustomers(localData.customers || []);
        }
      } else {
        setCustomers(data.customers || []);
      }
    } catch {
      // Fallback to local API on error
      try {
        const localUrl = searchQuery 
          ? `/api/customers?q=${encodeURIComponent(searchQuery)}` 
          : "/api/customers";
        const localRes = await fetch(localUrl);
        const localData = await localRes.json();
        setCustomers(localData.customers || []);
      } catch {
        setError("Failed to load customers");
        setCustomers([]);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    const customerId = selectedCustomer?.id;

    if (!customerId) {
      setSelectedCustomerProfile(null);
      return;
    }
    const resolvedCustomerId: string = customerId;

    let cancelled = false;

    async function fetchCustomerProfile() {
      setLoadingProfile(true);
      try {
        const res = await fetch(`/api/customers/profile?id=${encodeURIComponent(resolvedCustomerId)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) {
            setSelectedCustomerProfile(data);
          } else {
            setSelectedCustomerProfile(null);
            setError(data.error || "Failed to load customer profile");
          }
        }
      } catch {
        if (!cancelled) {
          setSelectedCustomerProfile(null);
          setError("Failed to load customer profile");
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    }

    fetchCustomerProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer?.id]);

  const resetForm = () => {
    setForm({ firstName: "", lastName: "", companyName: "", email: "", phone: "", line1: "", city: "", state: "", zip: "", tags: "", notes: "" });
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      companyName: customer.companyName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      line1: customer.address?.line1 || "",
      city: customer.address?.city || "",
      state: customer.address?.state || "",
      zip: customer.address?.zip || "",
      tags: customer.tags.join(", "),
      notes: customer.notes || "",
    });
    setShowEditModal(true);
  };

  const handleSaveCustomer = async (isEdit: boolean) => {
    setSaving(true);
    try {
      const payload = {
        ...(isEdit && selectedCustomer ? { id: selectedCustomer.id } : {}),
        displayName: `${form.firstName} ${form.lastName}`.trim(),
        firstName: form.firstName,
        lastName: form.lastName,
        companyName: form.companyName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.line1
          ? { line1: form.line1, city: form.city, state: form.state, zip: form.zip }
          : undefined,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notes: form.notes || undefined,
        active: true,
      };

      // Try QuickBooks first for new customers
      if (!isEdit) {
        const qbRes = await fetch("/api/quickbooks/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        
        const qbData = await qbRes.json();
        if (qbData.success) {
          // Success from QB
          setShowAddModal(false);
          setShowEditModal(false);
          fetchCustomers();
          return;
        }
        // If QB fails with 401/not connected, fall through to local
        if (qbRes.status !== 401 && !qbData.error?.includes('Not connected')) {
          setError(qbData.error || "Failed to save customer to QuickBooks");
          setSaving(false);
          return;
        }
      }
      
      // Fallback to local API
      const res = await fetch("/api/customers", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (isEdit) {
          setSelectedCustomer(data.customer);
        }
        setShowAddModal(false);
        setShowEditModal(false);
        fetchCustomers();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save customer");
      }
    } catch {
      setError("Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    try {
      const res = await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedCustomer(null);
        fetchCustomers();
      }
    } catch {
      setError("Failed to delete customer");
    }
  };

  const handleSyncWithQuickBooks = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/quickbooks/customers?sync=true", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        fetchCustomers();
      }
    } catch {
      setError("Failed to sync with QuickBooks");
    } finally {
      setSyncing(false);
    }
  };

  const filteredCustomers = customers;
  const detailCustomer = selectedCustomerProfile?.customer || selectedCustomer;
  const detailSummary = selectedCustomerProfile?.summary;
  const detailHistory = selectedCustomerProfile?.history;

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
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Customers</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {loading ? "Loading..." : `${filteredCustomers.length} customers`}
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white", boxShadow: "0 0 16px rgba(29,78,216,0.25)" }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Customer
          </button>
          <button
            onClick={handleSyncWithQuickBooks}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "#2CA01C", color: "white" }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}>
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            {syncing ? 'Syncing...' : 'Sync QB'}
          </button>
        </div>

        {/* Search */}
        <div
          className="px-6 py-4 flex items-center gap-4 flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex-1 relative">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }}>
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search customers by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Customer List */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div
                className="rounded-lg px-4 py-3 text-sm mb-4"
                style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.2)", color: "#FF204E" }}
              >
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
              <div className="grid gap-3">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    className={`rounded-xl p-4 transition-all cursor-pointer ${selectedCustomer?.id === customer.id ? "ring-2 ring-orange-500" : ""}`}
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white" }}
                        >
                          {customer.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                              {customer.displayName}
                            </h3>
                            {customer.companyName && (
                              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>
                                {customer.companyName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {customer.email && (
                              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{customer.email}</span>
                            )}
                            {customer.phone && (
                              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{customer.phone}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {customer.tags.map((tag) => (
                              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {customer.balance > 0 && (
                          <div className="text-sm font-semibold" style={{ color: "#FF204E" }}>
                            ${customer.balance.toLocaleString()} balance
                          </div>
                        )}
                        <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                          {customer.totalJobs} jobs · ${customer.totalRevenue.toLocaleString()} revenue
                        </div>
                        {customer.address && (
                          <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                            📍 {customer.address.city}, {customer.address.state}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {filteredCustomers.length === 0 && !loading && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">👥</div>
                    <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>No customers found</p>
                    <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                      Try adjusting your search or add a new customer
                    </p>
                    <button
                      onClick={openAddModal}
                      className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white" }}
                    >
                      Add First Customer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Customer Detail Panel */}
          {selectedCustomer && (
            <div
              className="w-[400px] flex-shrink-0 overflow-y-auto border-l"
              style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
            >
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Customer Details</h2>
                <button onClick={() => setSelectedCustomer(null)} className="p-1 rounded-lg" style={{ color: "var(--color-text-muted)" }}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                {loadingProfile && (
                  <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                    Loading customer history...
                  </div>
                )}
                {/* Customer Info */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold"
                    style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white" }}
                  >
                    {detailCustomer?.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{detailCustomer?.displayName}</h3>
                    {detailCustomer?.companyName && (
                      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{detailCustomer.companyName}</p>
                    )}
                  </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-3">
                  {detailCustomer?.email && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm">📧</span>
                      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{detailCustomer.email}</span>
                    </div>
                  )}
                  {detailCustomer?.phone && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm">📱</span>
                      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{detailCustomer.phone}</span>
                    </div>
                  )}
                  {detailCustomer?.address && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm">📍</span>
                      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                        {detailCustomer.address.line1}, {detailCustomer.address.city}, {detailCustomer.address.state} {detailCustomer.address.zip}
                      </span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{detailCustomer?.totalJobs || 0}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Total Jobs</div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                    <div className="text-lg font-bold" style={{ color: "#98CD00" }}>${Number(detailSummary?.totalRevenue || detailCustomer?.totalRevenue || 0).toLocaleString()}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Total Revenue</div>
                  </div>
                  {Number(detailSummary?.outstandingBalance || detailCustomer?.balance || 0) > 0 && (
                    <div className="col-span-2 rounded-lg p-3" style={{ background: "rgba(255,32,78,0.08)", border: "1px solid rgba(255,32,78,0.2)" }}>
                      <div className="text-lg font-bold" style={{ color: "#FF204E" }}>${Number(detailSummary?.outstandingBalance || detailCustomer?.balance || 0).toLocaleString()}</div>
                      <div className="text-xs" style={{ color: "#FF204E" }}>Outstanding Balance</div>
                    </div>
                  )}
                </div>

                {detailSummary && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                      <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{detailSummary.quickbooksInvoiceCount + detailSummary.localInvoiceCount}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Invoices</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                      <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{detailSummary.quickbooksPaymentCount}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Payments</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                      <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{detailSummary.purchaseOrderCount}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>POs</div>
                    </div>
                  </div>
                )}

                {/* Tags */}
                {detailCustomer && detailCustomer.tags.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)" }}>TAGS</h4>
                    <div className="flex flex-wrap gap-2">
                      {detailCustomer.tags.map((tag) => (
                        <span key={tag} className="text-xs px-2.5 py-1 rounded-md" style={{ background: "var(--color-surface-3)", color: "var(--color-text-secondary)" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {detailCustomer?.notes && (
                  <div>
                    <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)" }}>NOTES</h4>
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{detailCustomer.notes}</p>
                  </div>
                )}

                {detailHistory && (
                  <>
                    <div>
                      <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)" }}>INVOICES</h4>
                      <div className="space-y-2">
                        {[...detailHistory.invoices, ...detailHistory.localInvoices].slice(0, 8).map((invoice) => (
                          <Link
                            key={`${invoice.id}-${invoice.invoiceNumber}`}
                            href={`/invoices?id=${invoice.id}`}
                            className="block rounded-lg p-3"
                            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{invoice.invoiceNumber}</div>
                                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{invoice.jobTitle} • {new Date(invoice.issueDate).toLocaleDateString()}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>${Number(invoice.totalAmount).toLocaleString()}</div>
                                <div className="text-xs" style={{ color: Number(invoice.balance) > 0 ? "#FF204E" : "#98CD00" }}>
                                  {invoice.status} • ${Number(invoice.balance).toLocaleString()} open
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                        {detailHistory.invoices.length + detailHistory.localInvoices.length === 0 && (
                          <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>No invoices found for this customer.</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)" }}>PAYMENTS</h4>
                      <div className="space-y-2">
                        {detailHistory.payments.slice(0, 8).map((payment) => (
                          <div key={payment.id} className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{payment.paymentMethod || "QuickBooks payment"}</div>
                                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                  {new Date(payment.txnDate).toLocaleDateString()}
                                  {payment.linkedTxnIds.length ? ` • ${payment.linkedTxnIds.length} linked invoices` : ""}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold" style={{ color: "#98CD00" }}>${Number(payment.totalAmt).toLocaleString()}</div>
                                {payment.unappliedAmt > 0 && (
                                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>${Number(payment.unappliedAmt).toLocaleString()} unapplied</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {detailHistory.payments.length === 0 && (
                          <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>No payments found for this customer.</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)" }}>PURCHASE ORDERS</h4>
                      <div className="space-y-2">
                        {detailHistory.purchaseOrders.slice(0, 8).map((purchaseOrder) => (
                          <div key={purchaseOrder.id} className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{purchaseOrder.docNumber}</div>
                                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                  {[purchaseOrder.vendorName, purchaseOrder.txnDate ? new Date(purchaseOrder.txnDate).toLocaleDateString() : undefined].filter(Boolean).join(" • ")}
                                </div>
                                {purchaseOrder.memo && (
                                  <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{purchaseOrder.memo}</div>
                                )}
                              </div>
                              <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>${Number(purchaseOrder.totalAmt).toLocaleString()}</div>
                            </div>
                          </div>
                        ))}
                        {detailHistory.purchaseOrders.length === 0 && (
                          <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                            No linked purchase orders found. Existing QuickBooks POs appear here when they reference this customer in their memo or line details.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  <button
                    onClick={() => detailCustomer && openEditModal(detailCustomer)}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold"
                    style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white" }}
                  >
                    Edit Customer
                  </button>
                  <div className="flex gap-2">
                    <Link
                      href={`/invoices?customer=${selectedCustomer.id}`}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-center"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      View Invoices
                    </Link>
                    <button
                      onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.2)" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Customer Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowAddModal(false); setShowEditModal(false); }} />
          <div
            className="relative w-full max-w-lg rounded-xl overflow-hidden"
            style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
          >
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h2 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>
                {showEditModal ? "Edit Customer" : "Add Customer"}
              </h2>
              <button onClick={() => { setShowAddModal(false); setShowEditModal(false); }} className="p-1 rounded-lg" style={{ color: "var(--color-text-muted)" }}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>First Name *</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Last Name *</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Company Name</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Street Address</label>
                <input
                  type="text"
                  value={form.line1}
                  onChange={(e) => setForm({ ...form, line1: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>ZIP</label>
                  <input
                    type="text"
                    value={form.zip}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Tags (comma separated)</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="Residential, Gas Fireplace, VIP"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </div>
            </div>

            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveCustomer(showEditModal)}
                disabled={saving || !form.firstName || !form.lastName}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white" }}
              >
                {saving ? "Saving..." : showEditModal ? "Save Changes" : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
