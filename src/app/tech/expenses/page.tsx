"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, FileText, Loader2, Search, Store, UserRound } from "lucide-react";
import TechBottomNav from "@/components/tech/TechBottomNav";

type Customer = { id: string; displayName: string; phone?: string; address?: { line1?: string; city?: string; state?: string } };
type Expense = { id: string; expenseDate: string; merchant: string; amount: number; allocationType: "customer" | "stock_shop"; customerName: string | null; status: string; receiptFileName: string };

const categories = ["Fuel", "Materials", "Parts", "Tools", "Vehicle", "Meals", "Lodging", "Other"];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function TechExpensesPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [allocationType, setAllocationType] = useState<"customer" | "stock_shop">("customer");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [expenseDate, setExpenseDate] = useState(today());
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Fuel");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadMine() {
    setLoading(true);
    try {
      const response = await fetch("/api/expenses?scope=mine", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Expenses could not be loaded.");
      setExpenses(body.expenses || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Expenses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMine(); }, []);

  useEffect(() => {
    if (allocationType !== "customer" || selectedCustomer || customerQuery.trim().length < 2) {
      setCustomers([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const response = await fetch(`/api/customers?q=${encodeURIComponent(customerQuery.trim())}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.ok) setCustomers((body.customers || []).slice(0, 8));
      } finally {
        if (!controller.signal.aborted) setCustomerLoading(false);
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [allocationType, customerQuery, selectedCustomer]);

  const canSubmit = useMemo(() => Boolean(
    receipt && merchant.trim() && Number(amount) > 0 && expenseDate &&
    (allocationType === "stock_shop" || selectedCustomer)
  ), [allocationType, amount, expenseDate, merchant, receipt, selectedCustomer]);

  function selectAllocation(value: "customer" | "stock_shop") {
    setAllocationType(value);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomers([]);
  }

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !receipt) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.set("receipt", receipt);
      form.set("allocationType", allocationType);
      form.set("customerId", selectedCustomer?.id || "");
      form.set("expenseDate", expenseDate);
      form.set("merchant", merchant.trim());
      form.set("amount", amount);
      form.set("category", category);
      form.set("notes", notes.trim());
      const response = await fetch("/api/expenses", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Expense could not be submitted.");
      setSuccess("Receipt submitted to the office.");
      setMerchant(""); setAmount(""); setNotes(""); setReceipt(null); setSelectedCustomer(null); setCustomerQuery("");
      if (fileInput.current) fileInput.current.value = "";
      await loadMine();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Expense could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-10 border-b px-4 pb-4" style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))", background: "color-mix(in srgb, var(--color-surface-1) 94%, #fff)", borderColor: "rgba(255,106,0,0.12)" }}>
        <div className="flex items-center justify-between"><div><h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Expenses</h1><p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Photograph a receipt and send it to the office.</p></div><div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}><Camera size={20} /></div></div>
      </header>

      <main className="space-y-4 p-4">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={17} />{success}</div> : null}

        <form onSubmit={submitExpense} className="space-y-4 rounded-2xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-subtle)" }}>
          <div><div className="mb-2 text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)", letterSpacing: "0.08em" }}>Attach expense to</div><div className="grid grid-cols-2 gap-2 rounded-2xl p-1.5" style={{ background: "var(--color-bg)" }}><button type="button" onClick={() => selectAllocation("customer")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold" style={{ background: allocationType === "customer" ? "#fff" : "transparent", color: allocationType === "customer" ? "#C2410C" : "var(--color-text-muted)", boxShadow: allocationType === "customer" ? "0 4px 14px rgba(15,23,42,0.08)" : "none" }}><UserRound size={18} /> Customer</button><button type="button" onClick={() => selectAllocation("stock_shop")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold" style={{ background: allocationType === "stock_shop" ? "#fff" : "transparent", color: allocationType === "stock_shop" ? "#C2410C" : "var(--color-text-muted)", boxShadow: allocationType === "stock_shop" ? "0 4px 14px rgba(15,23,42,0.08)" : "none" }}><Store size={18} /> Stock / Shop</button></div></div>

          {allocationType === "customer" ? <div className="relative"><label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Customer</label>{selectedCustomer ? <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerQuery(""); }} className="flex w-full items-center justify-between rounded-xl p-3 text-left" style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)" }}><span><span className="block text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{selectedCustomer.displayName}</span><span className="mt-0.5 block text-xs" style={{ color: "var(--color-text-muted)" }}>{selectedCustomer.phone || "Selected customer"}</span></span><span className="text-xs font-semibold text-blue-700">Change</span></button> : <><Search size={17} className="pointer-events-none absolute left-3 top-[43px]" style={{ color: "var(--color-text-muted)" }} /><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search customer name" className="w-full rounded-xl py-3 pl-10 pr-10 text-base outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }} />{customerLoading ? <Loader2 size={17} className="absolute right-3 top-[43px] animate-spin" style={{ color: "var(--color-text-muted)" }} /> : null}{customers.length ? <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl" style={{ background: "#fff", border: "1px solid var(--color-border)", boxShadow: "0 18px 45px rgba(15,23,42,0.16)" }}>{customers.map((customer) => <button key={customer.id} type="button" onClick={() => { setSelectedCustomer(customer); setCustomerQuery(customer.displayName); setCustomers([]); }} className="block w-full border-b px-3 py-3 text-left last:border-0" style={{ borderColor: "var(--color-border)" }}><span className="block text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{customer.displayName}</span><span className="mt-0.5 block text-xs" style={{ color: "var(--color-text-muted)" }}>{[customer.address?.line1, customer.address?.city, customer.address?.state].filter(Boolean).join(", ") || customer.phone || "Customer record"}</span></button>)}</div> : null}</>}</div> : <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.14)", color: "var(--color-text-secondary)" }}>This expense will be recorded as general stock or shop spending.</div>}

          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="mt-1.5 w-full rounded-xl p-3 text-base outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }} /></label><label className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Amount<div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" style={{ color: "var(--color-text-muted)" }}>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" className="w-full rounded-xl py-3 pl-7 pr-3 text-base outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }} /></div></label></div>
          <label className="block text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Merchant<input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Where was it purchased?" className="mt-1.5 w-full rounded-xl p-3 text-base outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }} /></label>
          <label className="block text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl p-3 text-base outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="block text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Note <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="What was purchased?" className="mt-1.5 w-full resize-none rounded-xl p-3 text-base outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }} /></label>

          <div><div className="mb-1.5 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Receipt</div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" capture="environment" onChange={(event) => setReceipt(event.target.files?.[0] || null)} className="sr-only" /><button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl px-4 text-left" style={{ background: receipt ? "rgba(34,197,94,0.08)" : "rgba(255,106,0,0.06)", border: `1px dashed ${receipt ? "rgba(34,197,94,0.35)" : "rgba(255,106,0,0.35)"}` }}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "#fff", color: receipt ? "#15803D" : "#C2410C" }}>{receipt?.type === "application/pdf" ? <FileText size={21} /> : <Camera size={21} />}</span><span><span className="block text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{receipt ? receipt.name : "Take photo or upload receipt"}</span><span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>{receipt ? `${(receipt.size / 1024 / 1024).toFixed(1)} MB · Tap to replace` : "PDF or image, up to 10 MB"}</span></span></button></div>

          <button type="submit" disabled={!canSubmit || saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-45" style={{ background: "linear-gradient(135deg, #FF6A00, #E65300)", boxShadow: canSubmit ? "0 12px 28px rgba(255,106,0,0.24)" : "none" }}>{saving ? <><Loader2 size={18} className="animate-spin" />Uploading receipt...</> : <><Camera size={18} />Submit expense</>}</button>
        </form>

        <section className="rounded-2xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>My recent expenses</h2><p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>Status updates from the office</p></div><span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(255,106,0,0.1)", color: "#C2410C" }}>{expenses.length}</span></div><div className="space-y-2">{expenses.slice(0, 8).map((expense) => <a key={expense.id} href={`/api/expenses/${expense.id}/receipt`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}><div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{expense.merchant}</div><div className="mt-0.5 truncate text-xs" style={{ color: "var(--color-text-muted)" }}>{expense.customerName || "Stock / Shop"} · {expense.expenseDate}</div></div><div className="shrink-0 text-right"><div className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{money(expense.amount)}</div><div className="mt-0.5 text-[11px] font-semibold capitalize" style={{ color: expense.status === "rejected" ? "#B42318" : expense.status === "reimbursed" ? "#1D4ED8" : expense.status === "approved" ? "#15803D" : "#B45309" }}>{expense.status}</div></div></a>)}{!loading && !expenses.length ? <div className="py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No expenses submitted yet.</div> : null}{loading ? <div className="py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</div> : null}</div></section>
      </main>
      <TechBottomNav active="expenses" />
    </div>
  );
}
