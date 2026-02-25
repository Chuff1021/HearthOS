"use client";

import { useState } from "react";
import Link from "next/link";

// Mock data for customers (will be replaced with QuickBooks data)
const mockCustomers = [
  {
    id: "cust-001",
    qbCustomerId: "QB-12345",
    firstName: "Linda",
    lastName: "Martinez",
    companyName: "",
    email: "linda.martinez@email.com",
    phone: "(555) 123-4567",
    source: "referral",
    tags: ["VIP", "Annual Service"],
    properties: [
      {
        id: "prop-001",
        address: "123 Oak Street, Springfield, IL 62701",
        nickname: "Main Home",
        isPrimary: true,
        fireplaceUnits: [
          { id: "fp-001", brand: "Regency", model: "HZ40E", nickname: "Living Room", fuelType: "gas", lastService: "2024-01-15" },
          { id: "fp-002", brand: "Napoleon", model: "GD80", nickname: "Basement", fuelType: "gas", lastService: "2024-01-15" },
        ],
      },
    ],
    totalJobs: 12,
    totalRevenue: 4280,
    balance: 0,
    lastJobDate: "2024-02-20",
  },
  {
    id: "cust-002",
    qbCustomerId: "QB-12346",
    firstName: "Robert",
    lastName: "Chen",
    companyName: "Chen Properties LLC",
    email: "robert.chen@chenproperties.com",
    phone: "(555) 234-5678",
    source: "google",
    tags: ["Commercial", "Multiple Properties"],
    properties: [
      {
        id: "prop-002",
        address: "456 Maple Ave, Springfield, IL 62702",
        nickname: "Office Building",
        isPrimary: true,
        fireplaceUnits: [
          { id: "fp-003", brand: "Heat & Glo", model: "SLR-FT", nickname: "Lobby", fuelType: "gas", lastService: "2023-12-10" },
        ],
      },
      {
        id: "prop-003",
        address: "789 Pine Road, Springfield, IL 62703",
        nickname: "Warehouse",
        isPrimary: false,
        fireplaceUnits: [
          { id: "fp-004", brand: "Vermont Castings", model: "Defiant", nickname: "Break Room", fuelType: "wood", lastService: "2023-11-20" },
        ],
      },
    ],
    totalJobs: 8,
    totalRevenue: 12500,
    balance: 4200,
    lastJobDate: "2024-02-25",
  },
  {
    id: "cust-003",
    qbCustomerId: "QB-12347",
    firstName: "Patricia",
    lastName: "Williams",
    companyName: "",
    email: "pwilliams@email.com",
    phone: "(555) 345-6789",
    source: "website",
    tags: ["New Customer"],
    properties: [
      {
        id: "prop-004",
        address: "321 Elm Court, Springfield, IL 62704",
        nickname: "Home",
        isPrimary: true,
        fireplaceUnits: [
          { id: "fp-005", brand: "Heat & Glo", model: "SLR-FT", nickname: "Master Bedroom", fuelType: "gas", lastService: "2024-02-24" },
        ],
      },
    ],
    totalJobs: 2,
    totalRevenue: 470,
    balance: 0,
    lastJobDate: "2024-02-24",
  },
  {
    id: "cust-004",
    qbCustomerId: "QB-12348",
    firstName: "Tom",
    lastName: "Bradley",
    companyName: "",
    email: "tom.bradley@email.com",
    phone: "(555) 456-7890",
    source: "referral",
    tags: ["Annual Service", "Wood Stove"],
    properties: [
      {
        id: "prop-005",
        address: "555 Cedar Lane, Springfield, IL 62705",
        nickname: "Home",
        isPrimary: true,
        fireplaceUnits: [
          { id: "fp-006", brand: "Vermont Castings", model: "Defiant", nickname: "Den", fuelType: "wood", lastService: "2023-10-15" },
        ],
      },
    ],
    totalJobs: 6,
    totalRevenue: 1890,
    balance: 0,
    lastJobDate: "2024-01-10",
  },
  {
    id: "cust-005",
    qbCustomerId: "QB-12349",
    firstName: "Susan",
    lastName: "Park",
    companyName: "",
    email: "susan.park@email.com",
    phone: "(555) 567-8901",
    source: "quickbooks",
    tags: ["Pellet Stove"],
    properties: [
      {
        id: "prop-006",
        address: "888 Birch Drive, Springfield, IL 62706",
        nickname: "Home",
        isPrimary: true,
        fireplaceUnits: [
          { id: "fp-007", brand: "Harman", model: "P68", nickname: "Family Room", fuelType: "pellet", lastService: "2024-02-10" },
        ],
      },
    ],
    totalJobs: 4,
    totalRevenue: 1120,
    balance: 280,
    lastJobDate: "2024-02-25",
  },
];

const sourceColors: Record<string, { bg: string; text: string }> = {
  referral: { bg: "rgba(74,222,128,0.12)", text: "#4ade80" },
  google: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa" },
  website: { bg: "rgba(192,132,252,0.12)", text: "#c084fc" },
  quickbooks: { bg: "rgba(44,160,28,0.12)", text: "#2ca01c" },
};

const fuelTypeIcons: Record<string, string> = {
  gas: "🔥",
  wood: "🪵",
  pellet: "🫘",
  electric: "⚡",
  propane: "⛽",
};

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<typeof mockCustomers[0] | null>(null);

  // Filter customers
  const filteredCustomers = mockCustomers.filter((customer) => {
    const matchesSearch =
      `${customer.firstName} ${customer.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      customer.companyName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSource = sourceFilter === "all" || customer.source === sourceFilter;

    return matchesSearch && matchesSource;
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
              {filteredCustomers.length} customers • Synced from QuickBooks
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: "var(--color-surface-2)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clipRule="evenodd"
                />
              </svg>
              Sync from QB
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

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="all">All Sources</option>
            <option value="referral">Referral</option>
            <option value="google">Google</option>
            <option value="website">Website</option>
            <option value="quickbooks">QuickBooks</option>
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Customer List */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid gap-3">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className={`rounded-xl p-4 transition-all cursor-pointer ${
                    selectedCustomer?.id === customer.id ? "ring-2 ring-orange-500" : ""
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
                        {customer.firstName[0]}
                        {customer.lastName[0]}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                            {customer.firstName} {customer.lastName}
                          </h3>
                          {customer.companyName && (
                            <span
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}
                            >
                              {customer.companyName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                            {customer.email}
                          </span>
                          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                            {customer.phone}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                            style={{
                              background: sourceColors[customer.source]?.bg || "var(--color-surface-3)",
                              color: sourceColors[customer.source]?.text || "var(--color-text-muted)",
                            }}
                          >
                            {customer.source.toUpperCase()}
                          </span>
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
                      <div className="flex items-center gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                        {customer.properties.length} {customer.properties.length === 1 ? "property" : "properties"}
                      </div>
                      <div className="flex items-center gap-1 text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path
                            fillRule="evenodd"
                            d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {customer.properties.reduce((sum, p) => sum + p.fireplaceUnits.length, 0)} units
                      </div>
                      {customer.balance > 0 && (
                        <div className="text-sm font-semibold mt-1" style={{ color: "#f87171" }}>
                          ${customer.balance.toLocaleString()} balance
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {filteredCustomers.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">👥</div>
                  <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                    No customers found
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                    Try adjusting your search or sync from QuickBooks
                  </p>
                </div>
              )}
            </div>
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
                      {selectedCustomer.firstName[0]}
                      {selectedCustomer.lastName[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {selectedCustomer.firstName} {selectedCustomer.lastName}
                      </h3>
                      {selectedCustomer.companyName && (
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {selectedCustomer.companyName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-muted)" }}>
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                      <span style={{ color: "var(--color-text-primary)" }}>{selectedCustomer.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-muted)" }}>
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                      <span style={{ color: "var(--color-text-primary)" }}>{selectedCustomer.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-muted)" }}>
                        <path
                          fillRule="evenodd"
                          d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span style={{ color: "var(--color-text-muted)" }}>QB ID: {selectedCustomer.qbCustomerId}</span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div
                    className="rounded-lg p-3 text-center"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                      {selectedCustomer.totalJobs}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      Total Jobs
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-3 text-center"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                      ${selectedCustomer.totalRevenue.toLocaleString()}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      Revenue
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-3 text-center"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="text-xl font-bold" style={{ color: selectedCustomer.balance > 0 ? "#f87171" : "var(--color-text-primary)" }}>
                      ${selectedCustomer.balance.toLocaleString()}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      Balance
                    </div>
                  </div>
                </div>

                {/* Properties & Fireplace Units */}
                <div>
                  <h4 className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>
                    Properties & Fireplace Units
                  </h4>
                  <div className="space-y-3">
                    {selectedCustomer.properties.map((property) => (
                      <div
                        key={property.id}
                        className="rounded-lg p-3"
                        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-muted)" }}>
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                          </svg>
                          <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {property.nickname}
                          </span>
                          {property.isPrimary && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}
                            >
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                          {property.address}
                        </p>
                        <div className="space-y-1.5">
                          {property.fireplaceUnits.map((unit) => (
                            <div
                              key={unit.id}
                              className="flex items-center justify-between p-2 rounded"
                              style={{ background: "var(--color-surface-3)" }}
                            >
                              <div className="flex items-center gap-2">
                                <span>{fuelTypeIcons[unit.fuelType]}</span>
                                <div>
                                  <div className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                                    {unit.brand} {unit.model}
                                  </div>
                                  <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                                    {unit.nickname}
                                  </div>
                                </div>
                              </div>
                              <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                                Last: {unit.lastService}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                    style={{
                      background: "var(--color-surface-2)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    View Jobs
                  </button>
                  <button
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{
                      background: "linear-gradient(135deg, #f97316, #ea6c0a)",
                      color: "white",
                    }}
                  >
                    Schedule Job
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
