"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileSearch,
  PackageOpen,
  ReceiptText,
  Search,
  Store,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

type ExpenseStatus = "submitted" | "approved" | "reimbursed" | "rejected";
type Expense = {
  id: string;
  submittedByName: string;
  expenseDate: string;
  merchant: string;
  amount: number;
  category: string;
  allocationType: "customer" | "stock_shop";
  customerName: string | null;
  notes: string | null;
  status: ExpenseStatus;
  receiptFileName: string;
  createdAt: string;
};

type ExpenseResponse = {
  expenses: Expense[];
  summary: {
    total: number;
    pendingAmount: number;
    pendingCount: number;
    monthTotal: number;
    stockShopTotal: number;
  };
  canReview: boolean;
};

const statusOptions: Array<{ value: ExpenseStatus; label: string }> = [
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "reimbursed", label: "Reimbursed" },
  { value: "rejected", label: "Rejected" },
];

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function prettyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status: ExpenseStatus) {
  if (status === "approved") return { color: "#157347", background: "rgba(34,197,94,0.12)" };
  if (status === "reimbursed") return { color: "#1D4ED8", background: "rgba(59,130,246,0.12)" };
  if (status === "rejected") return { color: "#B42318", background: "rgba(239,68,68,0.11)" };
  return { color: "#B45309", background: "rgba(249,115,22,0.12)" };
}

export default function ExpensesPage() {
  const [data, setData] = useState<ExpenseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ExpenseStatus>("all");
  const [allocation, setAllocation] = useState<"all" | "customer" | "stock_shop">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope: "all" });
      if (search.trim()) params.set("q", search.trim());
      if (status !== "all") params.set("status", status);
      if (allocation !== "all") params.set("allocation", allocation);
      const response = await fetch(`/api/expenses?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Expenses could not be loaded.");
      setData(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Expenses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [allocation, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadExpenses(), 180);
    return () => window.clearTimeout(timer);
  }, [loadExpenses]);

  async function changeStatus(id: string, nextStatus: ExpenseStatus) {
    setUpdatingId(id);
    setError("");
    try {
      const response = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Expense status could not be updated.");
      await loadExpenses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Expense status could not be updated.");
    } finally {
      setUpdatingId(null);
    }
  }

  const tiles = useMemo(() => [
    { label: "Needs review", value: String(data?.summary.pendingCount || 0), hint: money(data?.summary.pendingAmount || 0), icon: FileSearch, tone: "#F97316" },
    { label: "This month", value: money(data?.summary.monthTotal || 0), hint: "Submitted expenses", icon: CircleDollarSign, tone: "#2563EB" },
    { label: "Stock / Shop", value: money(data?.summary.stockShopTotal || 0), hint: "Current view", icon: PackageOpen, tone: "#7C3AED" },
    { label: "Visible total", value: money(data?.summary.total || 0), hint: `${data?.expenses.length || 0} receipts`, icon: ReceiptText, tone: "#15803D" },
  ], [data]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 lg:pb-6">
          <div className="mx-auto max-w-[1500px] space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ember)" }}>
                  <ReceiptText size={16} /> Expense center
                </div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Receipts and expenses</h1>
                <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Review field purchases, customer costs, and stock or shop spending.
                </p>
              </div>
              <div className="rounded-2xl px-4 py-2 text-sm font-medium" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                Tech receipts appear here as soon as they are submitted.
              </div>
            </div>

            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {tiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div key={tile.label} className="glass-card rounded-2xl p-4 sm:p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)", letterSpacing: "0.08em" }}>{tile.label}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ color: tile.tone, background: `${tile.tone}12` }}><Icon size={18} /></span>
                    </div>
                    <div className="text-xl font-bold sm:text-2xl" style={{ color: "var(--color-text-primary)" }}>{tile.value}</div>
                    <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{tile.hint}</div>
                  </div>
                );
              })}
            </section>

            <section className="glass-panel overflow-hidden rounded-2xl">
              <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center" style={{ borderColor: "var(--color-border)" }}>
                <div className="relative min-w-0 flex-1">
                  <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, customer, employee, or category" className="w-full rounded-xl py-2.5 pl-10 pr-3 text-sm outline-none" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                  {(["all", "submitted", "approved", "reimbursed", "rejected"] as const).map((value) => (
                    <button key={value} onClick={() => setStatus(value)} className="whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold" style={{ color: status === value ? "#fff" : "var(--color-text-secondary)", background: status === value ? "var(--color-ember)" : "rgba(255,255,255,0.68)", border: "1px solid var(--color-border)" }}>
                      {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
                <select value={allocation} onChange={(event) => setAllocation(event.target.value as typeof allocation)} className="rounded-xl px-3 py-2.5 text-sm outline-none" style={{ background: "rgba(255,255,255,0.74)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                  <option value="all">All allocations</option>
                  <option value="customer">Customer expenses</option>
                  <option value="stock_shop">Stock / Shop</option>
                </select>
              </div>

              {error ? <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1050px] text-left">
                  <thead>
                    <tr className="border-b text-[11px] font-semibold uppercase" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                      <th className="px-5 py-3">Date</th><th className="px-5 py-3">Merchant</th><th className="px-5 py-3">Submitted by</th><th className="px-5 py-3">Allocation</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Receipt</th><th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.expenses || []).map((expense) => (
                      <tr key={expense.id} className="border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                        <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>{prettyDate(expense.expenseDate)}</td>
                        <td className="px-5 py-4"><div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{expense.merchant}</div><div className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{expense.category}{expense.notes ? ` · ${expense.notes}` : ""}</div></td>
                        <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>{expense.submittedByName}</td>
                        <td className="px-5 py-4"><div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>{expense.allocationType === "customer" ? <CheckCircle2 size={16} style={{ color: "#2563EB" }} /> : <Store size={16} style={{ color: "#7C3AED" }} />}{expense.customerName || "Stock / Shop"}</div></td>
                        <td className="px-5 py-4 text-right font-bold" style={{ color: "var(--color-text-primary)" }}>{money(expense.amount)}</td>
                        <td className="px-5 py-4"><a href={`/api/expenses/${expense.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ember)" }}>View <ExternalLink size={14} /></a></td>
                        <td className="px-5 py-4">
                          {data?.canReview ? (
                            <select disabled={updatingId === expense.id} value={expense.status} onChange={(event) => void changeStatus(expense.id, event.target.value as ExpenseStatus)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none disabled:opacity-50" style={{ ...statusTone(expense.status), border: "1px solid transparent" }}>
                              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          ) : <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={statusTone(expense.status)}>{expense.status}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-3 lg:hidden">
                {(data?.expenses || []).map((expense) => (
                  <article key={expense.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-start justify-between gap-3"><div><div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{expense.merchant}</div><div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{prettyDate(expense.expenseDate)} · {expense.submittedByName}</div></div><div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{money(expense.amount)}</div></div>
                    <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>{expense.allocationType === "customer" ? <CheckCircle2 size={16} /> : <Store size={16} />}{expense.customerName || "Stock / Shop"}</div>
                    <div className="mt-4 flex items-center justify-between gap-3"><a href={`/api/expenses/${expense.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ember)" }}>View receipt <ExternalLink size={14} /></a><select disabled={updatingId === expense.id} value={expense.status} onChange={(event) => void changeStatus(expense.id, event.target.value as ExpenseStatus)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none" style={{ ...statusTone(expense.status), border: "1px solid transparent" }}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  </article>
                ))}
              </div>

              {!loading && !data?.expenses.length ? <div className="flex flex-col items-center px-6 py-16 text-center"><ReceiptText size={28} style={{ color: "var(--color-text-muted)" }} /><h2 className="mt-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>No matching expenses</h2><p className="mt-1 max-w-sm text-sm" style={{ color: "var(--color-text-muted)" }}>Tech receipt submissions will appear here automatically.</p></div> : null}
              {loading ? <div className="px-6 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading expenses...</div> : null}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
