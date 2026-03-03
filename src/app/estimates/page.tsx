"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface Estimate {
  id: string;
  estimateNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  propertyAddress: string;
  fireplace?: {
    brand: string;
    model: string;
    type: string;
  };
  status: "draft" | "sent" | "approved" | "rejected" | "expired";
  createdDate: string;
  validUntil: string;
  totalAmount: number;
  description: string;
  lineItems: {
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }[];
}

const sampleEstimates: Estimate[] = [
  {
    id: "est-001",
    estimateNumber: "EST-2026-0147",
    customerId: "cust-006",
    customerName: "Michael Davis",
    customerPhone: "(555) 789-0123",
    customerEmail: "mdavis@email.com",
    propertyAddress: "3456 Cedar Court, Arvada, CO 80002",
    fireplace: { brand: "Napoleon", model: "Lexington", type: "Gas" },
    status: "sent",
    createdDate: "2026-02-23",
    validUntil: "2026-03-09",
    totalAmount: 3850.00,
    description: "New gas fireplace installation",
    lineItems: [
      { description: "Napoleon Lexington 36\" Gas Fireplace", qty: 1, unitPrice: 2400.00, total: 2400.00 },
      { description: "Installation Labor (8 hrs)", qty: 8, unitPrice: 125.00, total: 1000.00 },
      { description: "Gas Line Connection", qty: 1, unitPrice: 250.00, total: 250.00 },
      { description: "Permit & Inspection", qty: 1, unitPrice: 200.00, total: 200.00 },
    ],
  },
  {
    id: "est-002",
    estimateNumber: "EST-2026-0148",
    customerId: "cust-009",
    customerName: "Jennifer Adams",
    customerPhone: "(555) 111-9999",
    customerEmail: "jennifer@email.com",
    propertyAddress: "789 Oak Lane, Denver, CO 80204",
    fireplace: { brand: "Majestic", model: "Ruby 42", type: "Gas" },
    status: "approved",
    createdDate: "2026-02-20",
    validUntil: "2026-03-06",
    totalAmount: 5200.00,
    description: "Upgrade to new direct vent fireplace",
    lineItems: [
      { description: "Majestic Ruby 42\" Gas Fireplace", qty: 1, unitPrice: 3200.00, total: 3200.00 },
      { description: "Removal of Existing Unit", qty: 1, unitPrice: 350.00, total: 350.00 },
      { description: "Installation Labor (10 hrs)", qty: 10, unitPrice: 125.00, total: 1250.00 },
      { description: "Venting & Accessories", qty: 1, unitPrice: 400.00, total: 400.00 },
    ],
  },
  {
    id: "est-003",
    estimateNumber: "EST-2026-0149",
    customerId: "cust-010",
    customerName: "Thomas Wright",
    customerPhone: "(555) 222-8888",
    customerEmail: "twright@email.com",
    propertyAddress: "456 Pine Street, Boulder, CO 80302",
    status: "draft",
    createdDate: "2026-02-26",
    validUntil: "2026-03-12",
    totalAmount: 0,
    description: "Wood stove replacement consultation",
    lineItems: [],
  },
];

export default function EstimatesPage() {
  const [estimates] = useState<Estimate[]>(sampleEstimates);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "approved" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);

  const filteredEstimates = estimates.filter(e => {
    const matchesFilter = filter === "all" || e.status === filter;
    const matchesSearch = !searchQuery || 
      e.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.estimateNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalValue = estimates.filter(e => e.status !== "draft").reduce((sum, e) => sum + e.totalAmount, 0);
  const approvedValue = estimates.filter(e => e.status === "approved").reduce((sum, e) => sum + e.totalAmount, 0);

  function getStatusColor(status: string) {
    switch (status) {
      case "draft": return "bg-gray-500/20 text-gray-400";
      case "sent": return "bg-blue-500/20 text-blue-400";
      case "approved": return "bg-green-500/20 text-green-400";
      case "rejected": return "bg-red-500/20 text-red-400";
      case "expired": return "bg-orange-500/20 text-orange-400";
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                  Estimates
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Manage customer quotes and proposals
                </p>
              </div>
              <button className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                + New Estimate
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Estimates</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{estimates.length}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Value</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>${totalValue.toLocaleString()}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Approved</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#0d9488" }}>${approvedValue.toLocaleString()}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Pending</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#b7791f" }}>
                  {estimates.filter(e => e.status === "sent").length}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search estimates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border-0 focus:ring-2 focus:ring-orange-500 outline-none"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)" }}
                />
              </div>
              <div className="flex gap-2">
                {["all", "draft", "sent", "approved", "rejected"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                      filter === status 
                        ? "bg-orange-500 text-white" 
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Estimates List */}
            <div className="space-y-3">
              {filteredEstimates.map((estimate) => (
                <div 
                  key={estimate.id}
                  className="p-5 rounded-xl cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all"
                  style={{ background: "var(--color-surface-1)" }}
                  onClick={() => setSelectedEstimate(estimate)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                          {estimate.estimateNumber}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(estimate.status)}`}>
                          {estimate.status}
                        </span>
                      </div>
                      <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{estimate.customerName}</p>
                      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{estimate.propertyAddress}</p>
                      {estimate.fireplace && (
                        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                          {estimate.fireplace.brand} {estimate.fireplace.model} • {estimate.fireplace.type}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                        ${estimate.totalAmount.toLocaleString()}
                      </p>
                      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                        Valid until {new Date(estimate.validUntil).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Estimate Detail Modal */}
      {selectedEstimate && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] w-full max-w-2xl rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold">{selectedEstimate.estimateNumber}</h2>
                <p className="text-gray-400">{selectedEstimate.description}</p>
              </div>
              <button 
                onClick={() => setSelectedEstimate(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Customer Info */}
            <div className="mb-6">
              <h3 className="font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Customer</h3>
              <div className="p-4 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
                <p className="font-medium">{selectedEstimate.customerName}</p>
                <p className="text-sm text-gray-400">{selectedEstimate.customerPhone}</p>
                <p className="text-sm text-gray-400">{selectedEstimate.customerEmail}</p>
                <p className="text-sm text-gray-400 mt-1">{selectedEstimate.propertyAddress}</p>
              </div>
            </div>

            {/* Line Items */}
            {selectedEstimate.lineItems.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Line Items</h3>
                <div className="rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "var(--color-surface-2)" }}>
                        <th className="px-4 py-2 text-left text-xs" style={{ color: "var(--color-text-muted)" }}>Description</th>
                        <th className="px-4 py-2 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>Qty</th>
                        <th className="px-4 py-2 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>Price</th>
                        <th className="px-4 py-2 text-right text-xs" style={{ color: "var(--color-text-muted)" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEstimate.lineItems.map((item, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                          <td className="px-4 py-2">{item.description}</td>
                          <td className="px-4 py-2 text-right">{item.qty}</td>
                          <td className="px-4 py-2 text-right">${item.unitPrice}</td>
                          <td className="px-4 py-2 text-right font-medium">${item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "var(--color-surface-2)" }}>
                        <td colSpan={3} className="px-4 py-2 text-right font-bold">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-lg text-orange-400">
                          ${selectedEstimate.totalAmount.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {selectedEstimate.status === "draft" && (
                <button className="flex-1 py-2 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                  Send to Customer
                </button>
              )}
              {selectedEstimate.status === "sent" && (
                <>
                  <button className="flex-1 py-2 rounded-lg font-medium bg-green-500 text-white hover:bg-green-600 transition-colors">
                    Mark Approved
                  </button>
                  <button className="py-2 px-4 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                    Reject
                  </button>
                </>
              )}
              <button className="py-2 px-4 rounded-lg font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
