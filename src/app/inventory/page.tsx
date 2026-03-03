"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: "parts" | "supplies" | "equipment";
  brand: string;
  quantity: number;
  minQuantity: number;
  unitPrice: number;
  location: string;
  lastRestocked: string;
}

const sampleInventory: InventoryItem[] = [
  { id: "inv-001", sku: "TC-001", name: "Thermocouple Universal", category: "parts", brand: "Generic", quantity: 45, minQuantity: 10, unitPrice: 24.99, location: "Bin A-1", lastRestocked: "2026-02-15" },
  { id: "inv-002", sku: "TP-001", name: "Thermopile 750mV", category: "parts", brand: "White-Rodgers", quantity: 28, minQuantity: 8, unitPrice: 45.00, location: "Bin A-2", lastRestocked: "2026-02-10" },
  { id: "inv-003", sku: "GV-001", name: "Gas Valve 3/4\" NG", category: "parts", brand: "Miller", quantity: 12, minQuantity: 5, unitPrice: 89.00, location: "Bin B-1", lastRestocked: "2026-01-28" },
  { id: "inv-004", sku: "IGN-001", name: "Electronic Igniter", category: "parts", brand: "Honywood", quantity: 33, minQuantity: 10, unitPrice: 65.00, location: "Bin C-1", lastRestocked: "2026-02-05" },
  { id: "inv-005", sku: "PILOT-001", name: "Pilot Assembly NG", category: "parts", brand: "Robertshaw", quantity: 18, minQuantity: 5, unitPrice: 52.00, location: "Bin C-2", lastRestocked: "2026-02-12" },
  { id: "inv-006", sku: "GLASS-001", name: "Glass Panel 36\"", category: "parts", brand: "Majestic", quantity: 8, minQuantity: 3, unitPrice: 125.00, location: "Bin D-1", lastRestocked: "2026-01-20" },
  { id: "inv-007", sku: "LOG-001", name: "Ceramic Log Set", category: "parts", brand: "Generic", quantity: 15, minQuantity: 5, unitPrice: 75.00, location: "Bin E-1", lastRestocked: "2026-02-01" },
  { id: "inv-008", sku: "VENT-001", name: "Vent Kit 4\" x 6\"", category: "parts", brand: "Simpson", quantity: 24, minQuantity: 8, unitPrice: 38.00, location: "Bin F-1", lastRestocked: "2026-02-18" },
  { id: "inv-009", sku: "CLEAN-001", name: "Glass Cleaner 16oz", category: "supplies", brand: " Rutland", quantity: 48, minQuantity: 12, unitPrice: 8.99, location: "Shelf 1", lastRestocked: "2026-02-08" },
  { id: "inv-010", sku: "GASKET-001", name: "Door Gasket Kit", category: "supplies", brand: "Generic", quantity: 22, minQuantity: 6, unitPrice: 28.00, location: "Shelf 2", lastRestocked: "2026-01-25" },
];

export default function InventoryPage() {
  const [inventory] = useState<InventoryItem[]>(sampleInventory);
  const [filter, setFilter] = useState<"all" | "parts" | "supplies" | "low">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredInventory = inventory.filter(item => {
    const matchesFilter = 
      filter === "all" || 
      (filter === "low" ? item.quantity <= item.minQuantity : item.category === filter);
    const matchesSearch = !searchQuery || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const lowStockCount = inventory.filter(i => i.quantity <= i.minQuantity).length;
  const totalValue = inventory.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);

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
                  Inventory
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Parts, supplies, and equipment management
                </p>
              </div>
              <button className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                + Add Item
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Items</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{inventory.length}</p>
              </div>
              <button
                onClick={() => setFilter("low")}
                className={`p-5 rounded-xl text-left transition-all ${filter === "low" ? "ring-2 ring-red-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Low Stock</p>
                <p className="text-2xl font-bold mt-1" style={{ color: lowStockCount > 0 ? "#FF204E" : "#B6F500" }}>{lowStockCount}</p>
              </button>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Value</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>${totalValue.toLocaleString()}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Categories</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>2</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search inventory..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border-0 focus:ring-2 focus:ring-orange-500 outline-none"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)" }}
                />
              </div>
              <div className="flex gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "parts", label: "Parts" },
                  { id: "supplies", label: "Supplies" },
                  { id: "low", label: "Low Stock" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filter === tab.id 
                        ? "bg-orange-500 text-white" 
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inventory Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "var(--color-surface-2)" }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Category</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Brand</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Min</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Unit Price</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item) => (
                      <tr key={item.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                        <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {item.sku}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {item.name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.category === "parts" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                          }`}>
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          {item.brand}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${
                            item.quantity <= item.minQuantity ? "text-red-400" : "text-green-400"
                          }`}>
                            {item.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {item.minQuantity}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          ${item.unitPrice.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {item.location}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
