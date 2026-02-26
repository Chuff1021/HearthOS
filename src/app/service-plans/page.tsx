"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface ServicePlan {
  id: string;
  customerId: string;
  customerName: string;
  planType: "annual" | "biennial" | "premium";
  status: "active" | "expired" | "cancelled";
  startDate: string;
  nextServiceDate: string;
  price: number;
  fireplace: {
    brand: string;
    model: string;
    location: string;
  };
  services: string[];
  lastService?: {
    date: string;
    tech: string;
    notes: string;
  };
}

const samplePlans: ServicePlan[] = [
  {
    id: "plan-001",
    customerId: "cust-001",
    customerName: "Linda Martinez",
    planType: "annual",
    status: "active",
    startDate: "2024-01-15",
    nextServiceDate: "2026-01-15",
    price: 199.00,
    fireplace: { brand: "Regency", model: "HZ40E", location: "Living Room" },
    services: ["Annual Inspection", "Cleaning", "Safety Check", "10% Parts Discount"],
    lastService: { date: "2025-01-10", tech: "Mike Johnson", notes: "All good, cleaned burner assembly" },
  },
  {
    id: "plan-002",
    customerId: "cust-003",
    customerName: "Patricia Williams",
    planType: "premium",
    status: "active",
    startDate: "2023-06-01",
    nextServiceDate: "2026-06-01",
    price: 349.00,
    fireplace: { brand: "Heat & Glo", model: "SLR", location: "Master Bedroom" },
    services: ["Bi-Annual Inspection", "Cleaning", "Priority Service", "20% Parts Discount", "Labor Discount"],
    lastService: { date: "2025-12-05", tech: "Tom Davis", notes: "Replaced thermocouple, good condition" },
  },
  {
    id: "plan-003",
    customerId: "cust-005",
    customerName: "Susan Park",
    planType: "annual",
    status: "expired",
    startDate: "2024-02-01",
    nextServiceDate: "2025-02-01",
    price: 199.00,
    fireplace: { brand: "Harman", model: "P68", location: "Family Room" },
    services: ["Annual Inspection", "Cleaning", "Safety Check", "10% Parts Discount"],
  },
  {
    id: "plan-004",
    customerId: "cust-006",
    customerName: "Michael Davis",
    planType: "biennial",
    status: "active",
    startDate: "2024-08-01",
    nextServiceDate: "2026-08-01",
    price: 149.00,
    fireplace: { brand: "Napoleon", model: "Lexington", location: "Living Room" },
    services: ["Bi-Annual Inspection", "Cleaning"],
    lastService: { date: "2025-08-15", tech: "Sarah Williams", notes: "Unit in excellent condition" },
  },
];

export default function ServicePlansPage() {
  const [plans] = useState<ServicePlan[]>(samplePlans);
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<ServicePlan | null>(null);

  const filteredPlans = plans.filter(p => {
    const matchesFilter = filter === "all" || p.status === filter;
    const matchesSearch = !searchQuery || 
      p.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const activePlans = plans.filter(p => p.status === "active").length;
  const totalRevenue = plans.filter(p => p.status === "active").reduce((sum, p) => sum + p.price, 0);
  const expiringSoon = plans.filter(p => {
    if (p.status !== "active") return false;
    const nextDate = new Date(p.nextServiceDate);
    const today = new Date();
    const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays > 0;
  }).length;

  function getStatusColor(status: string) {
    switch (status) {
      case "active": return "bg-green-500/20 text-green-400";
      case "expired": return "bg-red-500/20 text-red-400";
      case "cancelled": return "bg-gray-500/20 text-gray-400";
    }
  }

  function getPlanTypeColor(type: string) {
    switch (type) {
      case "annual": return "bg-blue-500/20 text-blue-400";
      case "biennial": return "bg-purple-500/20 text-purple-400";
      case "premium": return "bg-orange-500/20 text-orange-400";
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
                  Service Plans
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Manage annual maintenance plans
                </p>
              </div>
              <button className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                + New Plan
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Plans</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{plans.length}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Active Plans</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#10b981" }}>{activePlans}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Monthly Revenue</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>${totalRevenue.toLocaleString()}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Expiring Soon</p>
                <p className="text-2xl font-bold mt-1" style={{ color: expiringSoon > 0 ? "#ef4444" : "#10b981" }}>{expiringSoon}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border-0 focus:ring-2 focus:ring-orange-500 outline-none"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)" }}
                />
              </div>
              <div className="flex gap-2">
                {["all", "active", "expired"].map((status) => (
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

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPlans.map((plan) => (
                <div 
                  key={plan.id}
                  className="p-5 rounded-xl cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all"
                  style={{ background: "var(--color-surface-1)" }}
                  onClick={() => setSelectedPlan(plan)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{plan.customerName}</h3>
                      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{plan.fireplace.brand} {plan.fireplace.model}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}>
                      {plan.status}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap gap-1 mb-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPlanTypeColor(plan.planType)}`}>
                      {plan.planType}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                      ${plan.price}/yr
                    </span>
                  </div>

                  <div className="pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: "var(--color-text-muted)" }}>Next Service</span>
                      <span style={{ color: "var(--color-text-secondary)" }}>{new Date(plan.nextServiceDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Plan Detail Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] w-full max-w-lg rounded-2xl p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold">{selectedPlan.customerName}</h2>
                <p className="text-gray-400">{selectedPlan.fireplace.brand} {selectedPlan.fireplace.model}</p>
              </div>
              <button 
                onClick={() => setSelectedPlan(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 p-3 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
                  <p className="text-xs text-gray-400">Plan Type</p>
                  <p className="font-medium capitalize">{selectedPlan.planType}</p>
                </div>
                <div className="flex-1 p-3 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="font-medium capitalize">{selectedPlan.status}</p>
                </div>
                <div className="flex-1 p-3 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
                  <p className="text-xs text-gray-400">Price</p>
                  <p className="font-medium">${selectedPlan.price}/yr</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-2">Plan Services</p>
                <div className="flex flex-wrap gap-2">
                  {selectedPlan.services.map((service, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-sm bg-blue-500/10 text-blue-400">
                      {service}
                    </span>
                  ))}
                </div>
              </div>

              {selectedPlan.lastService && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Last Service</p>
                  <div className="p-3 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
                    <p className="text-sm">{selectedPlan.lastService.date} - {selectedPlan.lastService.tech}</p>
                    <p className="text-sm text-gray-400">{selectedPlan.lastService.notes}</p>
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button className="flex-1 py-2 rounded-lg font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                  Schedule Service
                </button>
                <button className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                  Edit Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
