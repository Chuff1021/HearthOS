"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  receiptUrl?: string;
  notes?: string;
}

const fmtMoney = (n: number) =>
  `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function isOpaqueReference(value: string) {
  const v = value.trim();
  if (!v) return false;
  return v.length > 16 || /^[a-f0-9-]{16,}$/i.test(v);
}

export default function PaymentsPage() {
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const cardInstanceRef = useRef<any>(null);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [form, setForm] = useState({
    amount: "",
    customerName: "",
    invoiceNumber: "",
    buyerEmail: "",
    buyerPhone: "",
    note: "",
  });

  const [squareReady, setSquareReady] = useState(false);
  const [chargingCard, setChargingCard] = useState(false);
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const squareAppId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || "";
  const squareLocationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || "";
  const squareEnv = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || "production";
  const squareDashboardUrl = process.env.NEXT_PUBLIC_SQUARE_DASHBOARD_URL || "https://squareup.com/dashboard";
  const visibleReference = !isOpaqueReference(form.invoiceNumber) ? form.invoiceNumber.trim() : "";

  // ── Load Square Web Payments SDK + mount card form ──
  useEffect(() => {
    if (!squareAppId || !squareLocationId || !cardContainerRef.current) return;

    let cancelled = false;
    const scriptId = "square-web-payments-sdk";
    const scriptSrc =
      squareEnv === "sandbox"
        ? "https://sandbox.web.squarecdn.com/v1/square.js"
        : "https://web.squarecdn.com/v1/square.js";

    async function mountCard() {
      try {
        const w = window as any;
        if (!w.Square) return;
        const sqPayments = w.Square.payments(squareAppId, squareLocationId);
        const card = await sqPayments.card();
        if (cancelled) return;
        await card.attach(cardContainerRef.current);
        cardInstanceRef.current = card;
        setSquareReady(true);
      } catch {
        if (!cancelled) {
          setError("Failed to load Square card form.");
          setSquareReady(false);
        }
      }
    }

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      void mountCard();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => void mountCard();
    script.onerror = () => {
      if (!cancelled) setError("Failed to load Square Web Payments SDK.");
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [squareAppId, squareLocationId, squareEnv]);

  // ── Pre-fill from URL params (e.g. clicking Take Payment from an invoice) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const amount = params.get("amount") || "";
    const customer = params.get("customer") || "";
    const invoice = params.get("invoice") || "";
    setForm((p) => ({
      ...p,
      amount: amount && amount !== "0" ? amount : p.amount,
      customerName: customer || p.customerName,
      invoiceNumber: invoice || p.invoiceNumber,
    }));
    loadSquareTransactions();
    const t = setInterval(loadSquareTransactions, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function resetMessages() {
    setError(null);
    setSuccessMessage(null);
    setReceiptUrl(null);
    setCheckoutUrl(null);
  }

  async function chargeCard() {
    resetMessages();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!cardInstanceRef.current) {
      setError("Square card form is not ready yet.");
      return;
    }
    try {
      setChargingCard(true);
      const tokenResult = await cardInstanceRef.current.tokenize();
      if (tokenResult.status !== "OK") {
        throw new Error("Card details are incomplete or invalid.");
      }
      const res = await fetch("/api/square/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          sourceId: tokenResult.token,
          customerName: form.customerName || "Customer",
          invoiceNumber: form.invoiceNumber || undefined,
          buyerEmail: form.buyerEmail || undefined,
          note: form.note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to charge card");
      setReceiptUrl(data.receiptUrl || null);
      setSuccessMessage(`Captured ${fmtMoney(amount)} from ${form.customerName || "customer"}.`);
      await loadSquareTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to charge card");
    } finally {
      setChargingCard(false);
    }
  }

  async function createCheckoutLink() {
    resetMessages();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    try {
      setCreatingCheckout(true);
      const res = await fetch("/api/square/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          customerName: form.customerName || "Customer",
          invoiceNumber: form.invoiceNumber || undefined,
          buyerEmail: form.buyerEmail || undefined,
          note: form.note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Failed to create Square checkout link");
      setCheckoutUrl(data.url);
      window.open(data.url, "_blank", "noopener,noreferrer");
      await loadSquareTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Square checkout link");
    } finally {
      setCreatingCheckout(false);
    }
  }

  function openText(url: string, receipt = false) {
    const message = encodeURIComponent(receipt ? `Your Square receipt is ready: ${url}` : `Pay securely with Square: ${url}`);
    window.location.href = `sms:${form.buyerPhone || ""}?&body=${message}`;
  }
  function openEmail(url: string, receipt = false) {
    const subject = encodeURIComponent(receipt ? "Your Square receipt" : "Square payment link");
    const body = encodeURIComponent(receipt ? `Here is your Square receipt:\n\n${url}` : `Use this secure Square payment link:\n\n${url}`);
    window.location.href = `mailto:${form.buyerEmail || ""}?subject=${subject}&body=${body}`;
  }
  async function shareLink(label: string, url: string) {
    if (navigator.share) {
      try { await navigator.share({ title: "HearthOS Payment", text: label, url }); return; } catch {}
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesFilter = filter === "all" || p.status === filter;
      const matchesSearch =
        !searchQuery ||
        p.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [payments, filter, searchQuery]);

  const totalReceived = payments.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);

  function getStatusBadge(status: string) {
    switch (status) {
      case "completed": return { color: "#16A34A", bg: "rgba(22,163,74,0.12)", label: "Completed" };
      case "pending":   return { color: "#9a5d12", bg: "rgba(248,151,31,0.12)", label: "Pending" };
      case "failed":    return { color: "#DC2626", bg: "rgba(220,38,38,0.12)", label: "Failed" };
      case "refunded":  return { color: "#7C3AED", bg: "rgba(124,58,237,0.12)", label: "Refunded" };
      default:          return { color: "var(--color-text-muted)", bg: "var(--color-surface-2)", label: status };
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">
            {/* ── Page header ─────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Payments</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Take a Square card payment in-app or send a hosted checkout link.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open(squareDashboardUrl, "_blank", "noopener,noreferrer")}
                  className="px-3 py-2 rounded-lg text-sm font-semibold"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", background: "var(--color-surface-2)" }}
                >
                  Open Square Dashboard
                </button>
                <button
                  onClick={loadSquareTransactions}
                  className="px-3 py-2 rounded-lg text-sm font-semibold"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", background: "var(--color-surface-2)" }}
                >
                  {loadingTransactions ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {/* ── Money tiles ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Received", value: fmtMoney(totalReceived), accent: "#16A34A" },
                { label: "Pending",  value: fmtMoney(totalPending),  accent: "#f8971f" },
                { label: "This view", value: fmtMoney(totalReceived + totalPending), accent: "#f8971f" },
                { label: "Transactions", value: String(payments.length), accent: "var(--color-text-muted)" },
              ].map((t) => (
                <div key={t.label} className="p-4 rounded-xl" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderLeft: `4px solid ${t.accent}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{t.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: t.accent === "var(--color-text-muted)" ? "var(--color-text-primary)" : t.accent }}>{t.value}</p>
                </div>
              ))}
            </div>

            {/* ── Take a payment (in-app card form) ───────────────────── */}
            <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>Take a payment</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    Enter the customer card with Square&apos;s secure form, or send them a hosted checkout link.
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded" style={{ background: squareReady ? "rgba(22,163,74,0.12)" : "rgba(248,151,31,0.12)", color: squareReady ? "#16A34A" : "#9a5d12", border: `1px solid ${squareReady ? "rgba(22,163,74,0.35)" : "rgba(248,151,31,0.35)"}` }}>
                  {squareReady ? "Card form ready" : "Loading card form…"}
                </span>
              </div>

              {error && (
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#DC2626" }}>
                  {error}
                </div>
              )}
              {successMessage && (
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(22,163,74,0.10)", border: "1px solid rgba(22,163,74,0.25)", color: "#15803D" }}>
                  {successMessage}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Amount (USD)" required>
                  <input
                    type="number" min={0} step="0.01" placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-base font-semibold"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                  />
                </Field>
                <Field label="Customer name">
                  <input
                    type="text" placeholder="Customer name"
                    value={form.customerName}
                    onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                  />
                </Field>
                <Field label="Invoice / reference (optional)">
                  <input
                    type="text" placeholder="INV-12345"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                  />
                  {visibleReference && (
                    <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>Reference: <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{visibleReference}</span></p>
                  )}
                </Field>
                <Field label="Customer email">
                  <input
                    type="email" placeholder="customer@example.com"
                    value={form.buyerEmail}
                    onChange={(e) => setForm((p) => ({ ...p, buyerEmail: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                  />
                </Field>
                <Field label="Customer mobile">
                  <input
                    type="tel" placeholder="(555) 123-4567"
                    value={form.buyerPhone}
                    onChange={(e) => setForm((p) => ({ ...p, buyerPhone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                  />
                </Field>
                <Field label="Note (optional)">
                  <input
                    type="text" placeholder="Service description, deposit, etc."
                    value={form.note}
                    onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                  />
                </Field>
              </div>

              {/* Card entry */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Card details</div>
                  <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Securely captured by Square</div>
                </div>
                <div ref={cardContainerRef} className="min-h-[96px] rounded-lg p-3" style={{ background: "#fff", border: "1px solid var(--color-border)" }} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={chargeCard}
                    disabled={chargingCard || !squareReady}
                    className="py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #f8971f, #eaa23f)" }}
                  >
                    {chargingCard ? "Processing…" : `Charge Card${form.amount ? ` ${fmtMoney(Number(form.amount) || 0)}` : ""}`}
                  </button>
                  <button
                    onClick={createCheckoutLink}
                    disabled={creatingCheckout}
                    className="py-3 rounded-lg text-sm font-semibold disabled:opacity-60"
                    style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    {creatingCheckout ? "Creating link…" : "Send Payment Link Instead"}
                  </button>
                </div>
              </div>

              {/* Checkout link share strip */}
              {checkoutUrl && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Payment link</div>
                  <a href={checkoutUrl} target="_blank" rel="noreferrer" className="text-xs break-all" style={{ color: "#f8971f" }}>{checkoutUrl}</a>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => openText(checkoutUrl)} className="py-1.5 rounded-md text-xs font-semibold" style={{ background: "rgba(248,151,31,0.12)", color: "#9a5d12", border: "1px solid rgba(248,151,31,0.25)" }}>Text</button>
                    <button onClick={() => openEmail(checkoutUrl)} className="py-1.5 rounded-md text-xs font-semibold" style={{ background: "rgba(248,151,31,0.12)", color: "#9a5d12", border: "1px solid rgba(248,151,31,0.25)" }}>Email</button>
                    <button onClick={() => shareLink("Square payment link", checkoutUrl)} className="py-1.5 rounded-md text-xs font-semibold" style={{ background: "rgba(248,151,31,0.12)", color: "#9a5d12", border: "1px solid rgba(248,151,31,0.25)" }}>Share</button>
                  </div>
                </div>
              )}

              {/* Receipt share strip */}
              {receiptUrl && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--color-surface-2)", border: "1px solid rgba(22,163,74,0.35)" }}>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#16A34A" }}>Receipt ready</div>
                  <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs break-all" style={{ color: "#16A34A" }}>{receiptUrl}</a>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => openText(receiptUrl, true)} className="py-1.5 rounded-md text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)" }}>Text Receipt</button>
                    <button onClick={() => openEmail(receiptUrl, true)} className="py-1.5 rounded-md text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)" }}>Email Receipt</button>
                    <button onClick={() => shareLink("Square receipt", receiptUrl)} className="py-1.5 rounded-md text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)" }}>Share</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── History filters ─────────────────────────────────────── */}
            <div className="flex gap-3 items-center flex-wrap">
              <input
                type="text" placeholder="Search by customer or invoice…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[240px] px-3 py-2 rounded-lg outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              />
              <div className="flex gap-1.5">
                {(["all", "completed", "pending", "failed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors"
                    style={{
                      background: filter === status ? "rgba(248,151,31,0.16)" : "var(--color-surface-1)",
                      color: filter === status ? "#9a5d12" : "var(--color-text-muted)",
                      border: filter === status ? "1px solid #f8971f" : "1px solid var(--color-border)",
                    }}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Payments table ──────────────────────────────────────── */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "var(--color-surface-2)" }}>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Date</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Customer</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Reference</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Method</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Amount</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                          No payments match.
                        </td>
                      </tr>
                    ) : filteredPayments.map((payment) => {
                      const badge = getStatusBadge(payment.status);
                      return (
                        <tr key={payment.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                          <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                            {new Date(payment.paymentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {payment.customerName || "Square Customer"}
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                            {isOpaqueReference(payment.invoiceNumber) ? "—" : (payment.invoiceNumber || "—")}
                          </td>
                          <td className="px-4 py-3 text-sm capitalize" style={{ color: "var(--color-text-secondary)" }}>
                            {payment.method.replace("_", " ")}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.color, border: `1px solid ${typeof badge.color === "string" ? badge.color : "var(--color-border)"}33` }}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: payment.status === "completed" ? "#16A34A" : "var(--color-text-primary)" }}>
                            {fmtMoney(payment.amount)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {payment.receiptUrl ? (
                              <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "#f8971f" }}>View</a>
                            ) : (
                              <span style={{ color: "var(--color-text-muted)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
        {label}{required ? <span style={{ color: "#DC2626", marginLeft: 2 }}>*</span> : null}
      </span>
      {children}
    </label>
  );
}
