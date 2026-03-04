"use client";

import { useEffect, useState } from "react";
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

const samplePayments: Payment[] = [];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>(samplePayments);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [checkoutAmount, setCheckoutAmount] = useState(0);
  const [checkoutCustomer, setCheckoutCustomer] = useState("");
  const [checkoutInvoice, setCheckoutInvoice] = useState("");
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const filteredPayments = payments.filter(p => {
    const matchesFilter = filter === "all" || p.status === filter;
    const matchesSearch = !searchQuery || 
      p.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalReceived = payments.filter(p => p.status === "completed").reduce((sum, p) => sum + p.amount, 0);
  const totalPending = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);

  const squareDashboardUrl = process.env.NEXT_PUBLIC_SQUARE_DASHBOARD_URL || "https://squareup.com/dashboard";
  const squareVirtualTerminalUrl = process.env.NEXT_PUBLIC_SQUARE_VIRTUAL_TERMINAL_URL || "https://squareup.com/dashboard/virtual-terminal";

  function openSquare(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function loadSquareTransactions() {
    try {
      setLoadingTransactions(true);
      const res = await fetch("/api/square/transactions?limit=100", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.payments)) {
        setPayments(data.payments as Payment[]);
      }
    } finally {
      setLoadingTransactions(false);
    }
  }

  async function createSquareCheckout() {
    setCheckoutError(null);
    setCheckoutUrl(null);

    if (!checkoutAmount || checkoutAmount <= 0) {
      setCheckoutError("Enter an amount greater than 0.");
      return;
    }

    try {
      setCreatingCheckout(true);
      const res = await fetch("/api/square/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: checkoutAmount,
          customerName: checkoutCustomer || "Customer",
          invoiceNumber: checkoutInvoice || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.url) {
        setCheckoutError(data?.error || "Failed to create Square checkout link.");
        return;
      }

      setCheckoutUrl(data.url);
      openSquare(data.url);
    } catch (e) {
      setCheckoutError("Failed to create Square checkout link.");
    } finally {
      setCreatingCheckout(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const amount = Number(params.get("amount") || 0);
    const customer = params.get("customer") || "";
    const invoice = params.get("invoice") || "";

    if (amount > 0) setCheckoutAmount(amount);
    if (customer) setCheckoutCustomer(customer);
    if (invoice) setCheckoutInvoice(invoice);

    loadSquareTransactions();
    const t = setInterval(loadSquareTransactions, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <button
                onClick={loadSquareTransactions}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                {loadingTransactions ? "Refreshing…" : "Refresh Payments"}
              </button>
            </div>

            {/* Square Quick Actions */}
            <div
              className="rounded-xl p-5 space-y-4"
              style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Square Payments
                  </h2>
                  <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                    Create a payment checkout link from this screen and open it instantly.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openSquare(squareVirtualTerminalUrl)}
                    className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                  >
                    Virtual Terminal
                  </button>
                  <button
                    onClick={() => openSquare(squareDashboardUrl)}
                    className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                  >
                    Open Dashboard
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Amount (USD)"
                  value={checkoutAmount || ""}
                  onChange={(e) => setCheckoutAmount(Number(e.target.value || 0))}
                  className="px-3 py-2 rounded-lg border-0 outline-none"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
                />
                <input
                  type="text"
                  placeholder="Customer name"
                  value={checkoutCustomer}
                  onChange={(e) => setCheckoutCustomer(e.target.value)}
                  className="px-3 py-2 rounded-lg border-0 outline-none"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
                />
                <input
                  type="text"
                  placeholder="Invoice # (optional)"
                  value={checkoutInvoice}
                  onChange={(e) => setCheckoutInvoice(e.target.value)}
                  className="px-3 py-2 rounded-lg border-0 outline-none"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
                />
                <button
                  onClick={createSquareCheckout}
                  disabled={creatingCheckout}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {creatingCheckout ? "Creating…" : "Create Checkout Link"}
                </button>
              </div>

              {checkoutError && (
                <div className="text-sm" style={{ color: "#FF204E" }}>
                  {checkoutError}
                </div>
              )}
              {checkoutUrl && (
                <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Checkout link: <a href={checkoutUrl} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>{checkoutUrl}</a>
                </div>
              )}
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
