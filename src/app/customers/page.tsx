"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface QBCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  Balance: number;
  Active: boolean;
}

interface CustomerWithMeta extends QBCustomer {
  firstName?: string;
  lastName?: string;
  tags: string[];
  properties: {
    id: string;
    address: string;
    nickname: string;
    isPrimary: boolean;
    fireplaceUnits: { id: string; brand: string; model: string; nickname: string; fuelType: string; lastService?: string }[];
  }[];
  totalJobs: number;
  totalRevenue: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMeta | null>(null);

  // Fetch customers from QuickBooks
  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/customers");
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
        setCustomers([]);
      } else if (data.customers && data.customers.length > 0) {
        // Transform QB customers to our format
        const transformed: CustomerWithMeta[] = data.customers.map((c: QBCustomer) => {
          const nameParts = c.DisplayName.split(" ");
          return {
            ...c,
            firstName: nameParts[0] || "",
            lastName: nameParts.slice(1).join(" ") || "",
            tags: c.Balance > 0 ? ["Has Balance"] : ["Active"],
            properties: c.BillAddr ? [{
              id: `prop-${c.Id}`,
              address: `${c.BillAddr.Line1 || ""}, ${c.BillAddr.City || ""}, ${c.BillAddr.CountrySubDivisionCode || ""} ${c.BillAddr.PostalCode || ""}`.trim(),
              nickname: "Primary",
              isPrimary: true,
              fireplaceUnits: [],
            }] : [],
            totalJobs: 0,
            totalRevenue: 0,
          };
        });
        setCustomers(transformed);
      } else {
        setCustomers([]);
      }
    } catch (err) {
      setError("Failed to load customers");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  // Sync customers from QuickBooks
  const syncCustomers = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/quickbooks/customers?sync=true");
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        fetchCustomers();
      }
    } catch (err) {
      setError("Failed to sync customers");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Filter customers
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.DisplayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.PrimaryEmailAddr?.Address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.PrimaryPhone?.FreeFormNumber.includes(searchQuery) ||
      customer.CompanyName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

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
              <path
                fillRule="evenodd"
                d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>
              HearthOS
            </div>
            <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              Field Service
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {[
            { href: "/", label: "Dashboard", icon: "📊" },
            { href: "/jobs", label: "Jobs", icon: "📋" },
            { href: "/customers", label: "Customers", icon: "👥", active: true },
            { href: "/schedule", label: "Schedule", icon: "📅" },
            { href: "/dispatch", label: "Dispatch", icon: "🗺️" },
            { href: "/invoices", label: "Invoices", icon: "💰" },
            { href: "/integrations/quickbooks", label: "QuickBooks", icon: "📗" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
                item.active ? "font-semibold" : ""
              }`}
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
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>
              Customers
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {loading ? "Loading..." : `${filteredCustomers.length} customers from QuickBooks`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={syncCustomers}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{
                background: "var(--color-surface-2)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              {syncing ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path
                      fillRule="evenodd"
                      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Sync from QB
                </>
              )}
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: "linear-gradient(135deg, #f97316, #ea6c0a)",
                color: "white",
                boxShadow: "0 0 16px rgba(249,115,22,0.25)",
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              Add Customer
            </button>
          </div>
        </div>

        {/* Filters */}
        <div
          className="px-6 py-4 flex items-center gap-4 flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          {/* Search */}
          <div className="flex-1 relative">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--color-text-muted)" }}
            >
              <path
                fillRule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              placeholder="Search customers by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
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
                style={{
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "#f87171",
                }}
              >
                {error}.{" "}
                <Link href="/integrations/quickbooks" className="underline">
                  Check QuickBooks connection
                </Link>
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
                    key={customer.Id}
                    onClick={() => setSelectedCustomer(customer)}
                    className={`rounded-xl p-4 transition-all cursor-pointer ${
                      selectedCustomer?.Id === customer.Id ? "ring-2 ring-orange-500" : ""
                    }`}
                    style={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                          style={{
                            background: "linear-gradient(135deg, #f97316, #ea6c0a)",
                            color: "white",
                          }}
                        >
                          {customer.DisplayName.charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                              {customer.DisplayName}
                            </h3>
                            {customer.CompanyName && (
                              <span
                                className="text-xs px-2 py-0.5 rounded"
                                style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}
                              >
                                {customer.CompanyName}
                              </span>
                            )}
                            {!customer.Active && (
                              <span
                                className="text-xs px-2 py-0.5 rounded"
                                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                              >
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {customer.PrimaryEmailAddr && (
                              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                                {customer.PrimaryEmailAddr.Address}
                              </span>
                            )}
                            {customer.PrimaryPhone && (
                              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                                {customer.PrimaryPhone.FreeFormNumber}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {customer.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-2 py-0.5 rounded-md"
                                style={{
                                  background: "var(--color-surface-3)",
                                  color: "var(--color-text-muted)",
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {customer.Balance > 0 && (
                          <div className="text-sm font-semibold" style={{ color: "#f87171" }}>
                            ${customer.Balance.toLocaleString()} balance
                          </div>
                        )}
                        {customer.properties.length > 0 && (
                          <div className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                            📍 {customer.properties[0].address}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {filteredCustomers.length === 0 && !loading && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">👥</div>
                    <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {error ? "Could not load customers" : "No customers found"}
                    </p>
                    <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                      {error ? "Check your QuickBooks connection" : "Try adjusting your search or sync from QuickBooks"}
                    </p>
                    <Link
                      href="/integrations/quickbooks"
                      className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        background: "linear-gradient(135deg, #f97316, #ea6c0a)",
                        color: "white",
                      }}
                    >
                      Go to QuickBooks Settings
                    </Link>
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
              <div
                className="px-6 py-4 flex items-center justify-between"
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>
                  Customer Details
                </h2>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1 rounded-lg"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Customer Info */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold"
                      style={{
                        background: "linear-gradient(135deg, #f97316, #ea6c0a)",
                        color: "white",
                      }}
                    >
                      {selectedCustomer.DisplayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {selectedCustomer.DisplayName}
                      </h3>
                      {selectedCustomer.CompanyName && (
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {selectedCustomer.CompanyName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedCustomer.PrimaryEmailAddr && (
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "var(--color-surface-3)" }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-muted)" }}>
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Email</p>
                          <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                            {selectedCustomer.PrimaryEmailAddr.Address}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedCustomer.PrimaryPhone && (
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "var(--color-surface-3)" }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-muted)" }}>
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Phone</p>
                          <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                            {selectedCustomer.PrimaryPhone.FreeFormNumber}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedCustomer.properties.length > 0 && (
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "var(--color-surface-3)" }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-muted)" }}>
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Address</p>
                          <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                            {selectedCustomer.properties[0].address}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedCustomer.Balance > 0 && (
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(248,113,113,0.12)" }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "#f87171" }}>
                            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Outstanding Balance</p>
                          <p className="text-sm font-semibold" style={{ color: "#f87171" }}>
                            ${selectedCustomer.Balance.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                >
                  <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
                    Quick Actions
                  </h4>
                  <div className="space-y-2">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                      style={{ background: "var(--color-surface-3)", color: "var(--color-text-secondary)" }}
                    >
                      <span>📋</span> Create Job
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                      style={{ background: "var(--color-surface-3)", color: "var(--color-text-secondary)" }}
                    >
                      <span>💰</span> Create Invoice
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                      style={{ background: "var(--color-surface-3)", color: "var(--color-text-secondary)" }}
                    >
                      <span>📝</span> Edit in QuickBooks
                    </button>
                  </div>
                </div>

                {/* QB ID */}
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  QuickBooks ID: {selectedCustomer.Id}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
