"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: "credit_card" | "check" | "cash" | "bank_transfer";
  status: "completed" | "pending" | "failed" | "refunded";
  paymentDate: string;
  transactionId?: string;
  notes?: string;
}

// Sample payments data
const samplePayments: Payment[] = [
  {
    id: "pay-001",
    invoiceId: "inv-003",
    invoiceNumber: "INV-2024-0889",
    customerId: "cust-003",
    customerName: "Patricia Williams",
    amount: 178.20,
    method: "credit_card",
    status: "completed",
    paymentDate: "2026-02-24",
    transactionId: "txn_abc123",
  },
  {
    id: "pay-002",
    invoiceId: "inv-005",
    invoiceNumber: "INV-2024-0887",
    customerId: "cust-004",
    customerName: "James Thompson",
    amount: 561.60,
    method: "bank_transfer",
    status: "completed",
    paymentDate: "2026-02-23",
    transactionId: "txn_def456",
  },
  {
    id: "pay-003",
    invoiceId: "inv-008",
    invoiceNumber: "INV-2024-0884",
    customerId: "cust-008",
    customerName: "David Rodriguez",
    amount: 1296.00,
    method: "credit_card",
    status: "completed",
    paymentDate: "2026-02-21",
    transactionId: "txn_ghi789",
  },
  {
    id: "pay-004",
    invoiceId: "inv-001",
    invoiceNumber: "INV-2024-0891",
    customerId: "cust-001",
    customerName: "Linda Martinez",
    amount: 270.00,
    method: "credit_card",
    status: "pending",
    paymentDate: "2026-02-26",
  },
  {
    id: "pay-005",
    invoiceId: "inv-007",
    invoiceNumber: "INV-2024-0885",
    customerId: "cust-007",
    customerName: "Karen Wilson",
    amount: 193.00,
    method: "check",
    status: "completed",
    paymentDate: "2026-02-20",
    transactionId: "chk_001",
  },
];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>(samplePayments);
  const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPayments = payments.filter(p => {
    const matchesFilter = filter === "all" || p.status === filter;
    const matchesSearch = !searchQuery || 
      p.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalReceived = payments.filter(p => p.status === "completed").reduce((sum, p) => sum + p.amount, 0);
  const totalPending = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);

  function getStatusColor(status: string) {
    switch (status) {
      case "completed": return "bg-green-500/20 text-green-400";
      case "pending": return "bg-yellow-500/20 text-yellow-400";
      case "failed": return "bg-red-500/20 text-red-400";
      case "refunded": return "bg-purple-500/20 text-purple-400";
    }
  }

  function getMethodIcon(method: string) {
    switch (method) {
      case "credit_card": return "💳";
      case "check": return "📝";
      case "cash": return "💵";
      case "bank_transfer": return "🏦";
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
                  Payments
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Track and manage customer payments
                </p>
              </div>
              <button className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                Record Payment
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Received</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#98CD00" }}>${totalReceived.toLocaleString()}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Pending</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#FF4400" }}>${totalPending.toLocaleString()}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>This Month</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>${(totalReceived + totalPending).toLocaleString()}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Transactions</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{payments.length}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search by customer or invoice..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border-0 focus:ring-2 focus:ring-orange-500 outline-none"
                  style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)" }}
                />
              </div>
              <div className="flex gap-2">
                {["all", "completed", "pending", "failed"].map((status) => (
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

            {/* Payments Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "var(--color-surface-2)" }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Invoice</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Method</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((payment) => (
                      <tr key={payment.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {payment.customerName}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          {payment.invoiceNumber}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            <span>{getMethodIcon(payment.method)}</span>
                            <span className="text-sm capitalize" style={{ color: "var(--color-text-secondary)" }}>
                              {payment.method.replace("_", " ")}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: payment.status === "completed" ? "#98CD00" : "var(--color-text-primary)" }}>
                          ${payment.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {payment.transactionId || "—"}
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
