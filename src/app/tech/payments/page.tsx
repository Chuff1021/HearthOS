"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import TechBottomNav from "@/components/tech/TechBottomNav";
import { createPaymentGuard, submitPaymentRequest, type PaymentResult } from "@/lib/square/client-payment";

type SquarePayment = {
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
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function methodLabel(method: SquarePayment["method"]) {
  switch (method) {
    case "credit_card":
      return "Credit Card";
    case "bank_transfer":
      return "Bank Transfer";
    case "cash":
      return "Cash";
    case "check":
      return "Check";
  }
}

function isOpaqueReference(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  return normalized.length > 16 || /^[a-f0-9-]{16,}$/i.test(normalized);
}

export default function TechPaymentsPage() {
  const searchParams = useSearchParams();
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const cardInstanceRef = useRef<any>(null);
  const submissionRef = useRef(createPaymentGuard());
  const confirmedPaymentsRef = useRef(new Set<string>());
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<PaymentResult | null>(null);
  const [newPayment, setNewPayment] = useState(false);
  const [payments, setPayments] = useState<SquarePayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [creating, setCreating] = useState(false);
  const [chargingCard, setChargingCard] = useState(false);
  const [squareReady, setSquareReady] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState({
    amount: "",
    customerName: "",
    invoiceNumber: "",
    buyerEmail: "",
    buyerPhone: "",
    note: "",
  });

  const squareAppId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || "";
  const squareLocationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || "";
  const squareEnv = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || "production";
  const visibleReference = !isOpaqueReference(form.invoiceNumber) ? form.invoiceNumber.trim() : "";
  const paymentKey = form.invoiceNumber.trim()
    ? `invoice:${form.invoiceNumber.trim()}`
    : JSON.stringify([Number(form.amount), form.customerName.trim(), form.buyerEmail.trim(), form.note.trim()]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      amount: searchParams.get("amount") || prev.amount,
      customerName: searchParams.get("customer") || prev.customerName,
      invoiceNumber: searchParams.get("invoice") || prev.invoiceNumber,
    }));
  }, [searchParams]);

  async function loadPayments() {
    try {
      setLoadingPayments(true);
      setListError("");
      const res = await fetch("/api/square/transactions?limit=20", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Square payments");
      setPayments(data.payments || []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load Square payments");
    } finally {
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    loadPayments();
    const intervalId = window.setInterval(loadPayments, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

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
        const squareWindow = window as any;
        if (!squareWindow.Square) return;
        const payments = squareWindow.Square.payments(squareAppId, squareLocationId);
        const card = await payments.card();
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
    script.onload = () => {
      void mountCard();
    };
    script.onerror = () => {
      if (!cancelled) setError("Failed to load Square Web Payments SDK.");
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [squareAppId, squareLocationId, squareEnv]);

  const completedToday = useMemo(
    () => payments.filter((payment) => payment.status === "completed").reduce((sum, payment) => sum + payment.amount, 0),
    [payments]
  );

  function finishSubmission(result: PaymentResult) {
    submissionRef.current.finish(result);
    setSubmissionLocked(result.kind !== "rejected");
    setSubmissionResult(result);
    setReceiptUrl(result.receiptUrl || "");
    setSuccessMessage(result.kind === "completed" ? result.message : "");
    if (result.kind === "completed" || result.kind === "checkout") {
      confirmedPaymentsRef.current.add(paymentKey);
    }
  }

  function startNewPayment() {
    if (!submissionRef.current.resetConfirmed()) return;
    setForm({ amount: "", customerName: "", invoiceNumber: "", buyerEmail: "", buyerPhone: "", note: "" });
    setSubmissionResult(null);
    setSubmissionLocked(false);
    setCheckoutUrl("");
    setReceiptUrl("");
    setSuccessMessage("");
    setError("");
    setNewPayment(true);
  }

  async function createCheckout() {
    if (!submissionRef.current.begin("checkout")) return;
    setError("");
    setCheckoutUrl("");
    setReceiptUrl("");
    setSuccessMessage("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      submissionRef.current.authorizationFailed("checkout");
      setError("Enter an amount greater than 0.");
      return;
    }
    if (confirmedPaymentsRef.current.has(paymentKey)) {
      submissionRef.current.authorizationFailed("checkout");
      setError("This payment already has a confirmed result. Check payment status with the office before collecting again.");
      return;
    }

    try {
      setCreating(true);
      setSubmissionLocked(true);
      setSubmissionResult(null);
      if (!submissionRef.current.submit("checkout")) return;
      const result = await submitPaymentRequest("/api/square/checkout", {
        amount,
        customerName: form.customerName || "Customer",
        invoiceNumber: form.invoiceNumber || undefined,
        buyerEmail: form.buyerEmail || undefined,
        note: form.note || undefined,
      }, true);
      finishSubmission(result);
      if (result.kind === "checkout" && result.url) {
        setCheckoutUrl(result.url);
        window.open(result.url, "_blank", "noopener,noreferrer");
        void loadPayments();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Square checkout link");
    } finally {
      setCreating(false);
    }
  }

  async function chargeCard() {
    if (!submissionRef.current.begin("card")) return;
    setError("");
    setCheckoutUrl("");
    setReceiptUrl("");
    setSuccessMessage("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      submissionRef.current.authorizationFailed("card");
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!cardInstanceRef.current) {
      submissionRef.current.authorizationFailed("card");
      setError("Square card form is not ready yet.");
      return;
    }
    if (confirmedPaymentsRef.current.has(paymentKey)) {
      submissionRef.current.authorizationFailed("card");
      setError("This payment already has a confirmed result. Check payment status with the office before collecting again.");
      return;
    }
    try {
      setChargingCard(true);
      setSubmissionLocked(true);
      setSubmissionResult(null);
      const tokenResult = await cardInstanceRef.current.tokenize();
      if (tokenResult.status !== "OK" || !tokenResult.token) {
        throw new Error("Card details are incomplete or invalid.");
      }
      if (!submissionRef.current.submit("card")) return;
      const result = await submitPaymentRequest("/api/square/payments", {
        amount,
        sourceId: tokenResult.token,
        customerName: form.customerName || "Customer",
        invoiceNumber: form.invoiceNumber || undefined,
        buyerEmail: form.buyerEmail || undefined,
        note: form.note || undefined,
      });
      finishSubmission(result);
      if (result.kind === "completed" || result.kind === "submitted") void loadPayments();
    } catch (err) {
      if (submissionRef.current.authorizationFailed("card")) {
        setSubmissionLocked(false);
        setError(err instanceof Error ? err.message : "Failed to authorize card");
      }
    } finally {
      setChargingCard(false);
    }
  }

  async function shareLink(label: string, url: string) {
    const message = `${label}\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "HearthOS Payment", text: label, url });
        return;
      } catch {
        // Fall through to explicit sms/email options if the share sheet is dismissed.
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openText(url: string, receipt = false) {
    const message = encodeURIComponent(
      receipt
        ? `Your Square receipt is ready: ${url}`
        : `Pay securely with Square: ${url}`
    );
    window.location.href = `sms:${form.buyerPhone || ""}?&body=${message}`;
  }

  function openEmail(url: string, receipt = false) {
    const subject = encodeURIComponent(receipt ? "Your Square receipt" : "Square payment link");
    const body = encodeURIComponent(
      receipt
        ? `Here is your Square receipt:\n\n${url}`
        : `Use this secure Square payment link:\n\n${url}`
    );
    window.location.href = `mailto:${form.buyerEmail || ""}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="flex flex-col min-h-screen pb-32">
      <header
        className="sticky top-0 z-10 px-4 pb-4"
        style={{
          paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))",
          background: "color-mix(in srgb, var(--color-surface-1) 92%, #fff)",
          borderBottom: "1px solid rgba(255,106,0,0.12)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Square Payments</h1>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Create a Square payment link, then text, email, or share it from the tech app.
            </p>
          </div>
          <button
            onClick={loadPayments}
            className="px-3 py-2 rounded-xl text-sm font-medium"
            style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C", border: "1px solid rgba(255,106,0,0.18)" }}
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {error ? (
          <div role="alert" className="px-3 py-2 rounded-xl text-sm" style={{ background: "rgba(255,68,0,0.10)", border: "1px solid rgba(255,68,0,0.22)", color: "#C2410C" }}>
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Completed</div>
            <div className="text-2xl font-bold mt-1" style={{ color: "#C2410C" }}>{formatCurrency(completedToday)}</div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Recent Payments</div>
            <div className="text-2xl font-bold mt-1" style={{ color: "#C2410C" }}>{payments.length}</div>
          </div>
        </div>

        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
          <div>
            <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Take a payment</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Enter the customer card with Square’s secure card form, or create a hosted payment link if you prefer to text/email it.
            </div>
          </div>
          <input
            disabled={submissionLocked}
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <input
            disabled={submissionLocked}
            type="text"
            placeholder="Customer name"
            value={form.customerName}
            onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          {newPayment ? (
            <input
              aria-label="Invoice number"
              placeholder="Invoice number (optional)"
              value={form.invoiceNumber}
              disabled={submissionLocked}
              onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
              className="w-full px-3 py-3 rounded-xl"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
            />
          ) : visibleReference ? (
            <div
              className="px-3 py-3 rounded-xl text-sm"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }}
            >
              Reference: <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{visibleReference}</span>
            </div>
          ) : null}
          <input
            disabled={submissionLocked}
            type="email"
            placeholder="Customer email"
            value={form.buyerEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, buyerEmail: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <input
            disabled={submissionLocked}
            type="tel"
            placeholder="Customer mobile"
            value={form.buyerPhone}
            onChange={(e) => setForm((prev) => ({ ...prev, buyerPhone: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <textarea
            disabled={submissionLocked}
            placeholder="Note"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            rows={3}
            className="w-full px-3 py-3 rounded-xl resize-none"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Card entry</div>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              The tech can enter card number, expiration, CVV, and billing ZIP directly here using Square’s secure form.
            </div>
            <div ref={cardContainerRef} className="min-h-[96px] rounded-xl p-3" style={{ background: "#fff" }} />
            <button
              onClick={chargeCard}
              disabled={submissionLocked || !squareReady}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "#C2410C", color: "#fff" }}
            >
              {chargingCard ? "Processing Card..." : squareReady ? "Charge Card" : "Loading Card Form..."}
            </button>
          </div>

          <button
            onClick={createCheckout}
            disabled={submissionLocked}
            className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}
          >
            {creating ? "Creating Square link..." : "Create Square Payment Link"}
          </button>

          {successMessage ? (
            <div role="status" className="rounded-2xl p-4 text-sm" style={{ background: "rgba(22,163,74,0.10)", border: "1px solid rgba(22,163,74,0.22)", color: "#15803D" }}>
              {successMessage}
            </div>
          ) : null}

          {submissionResult && submissionResult.kind !== "completed" ? (
            <div role={submissionResult.kind === "unknown" || submissionResult.kind === "rejected" ? "alert" : "status"}
              className="rounded-xl p-4 text-sm" style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}>
              {submissionResult.message}
            </div>
          ) : null}

          {submissionResult?.accountingWarning ? (
            <div role="status" className="rounded-xl p-4 text-sm" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
              {submissionResult.accountingWarning}
            </div>
          ) : null}

          {submissionResult?.kind === "completed" || submissionResult?.kind === "checkout" ? (
            <button onClick={startNewPayment} className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
              New payment for another invoice
            </button>
          ) : null}

          {checkoutUrl ? (
            <div className="space-y-3 rounded-2xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Payment link ready</div>
              <a href={checkoutUrl} target="_blank" rel="noreferrer" className="text-sm break-all" style={{ color: "#C2410C" }}>
                {checkoutUrl}
              </a>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => openText(checkoutUrl)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                  Text
                </button>
                <button onClick={() => openEmail(checkoutUrl)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                  Email
                </button>
                <button onClick={() => shareLink("Square payment link", checkoutUrl)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                  Share
                </button>
              </div>
            </div>
          ) : null}

          {receiptUrl ? (
            <div className="space-y-3 rounded-2xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Square receipt ready</div>
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-sm break-all" style={{ color: "#C2410C" }}>
                {receiptUrl}
              </a>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => openText(receiptUrl, true)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                  Text Receipt
                </button>
                <button onClick={() => openEmail(receiptUrl, true)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                  Email Receipt
                </button>
                <button onClick={() => shareLink("Square receipt", receiptUrl)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                  Share
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
          <div>
            <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent Square activity</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Completed payments can share the Square receipt URL by text, email, or the phone share sheet.
            </div>
          </div>

          {listError ? <div role="alert" className="text-sm" style={{ color: "#C2410C" }}>{listError}</div> : null}
          {loadingPayments ? (
            <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading Square payments...</div>
          ) : payments.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>No Square payments yet.</div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-2xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {payment.customerName || "Square Customer"}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                        {(isOpaqueReference(payment.invoiceNumber) ? "Linked Job Payment" : payment.invoiceNumber || "Square Order")} • {methodLabel(payment.method)} • {formatDateTime(payment.paymentDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatCurrency(payment.amount)}</div>
                      <div className="text-xs mt-1" style={{ color: payment.status === "completed" ? "#15803D" : payment.status === "pending" ? "#C2410C" : "#DC2626" }}>
                        {payment.status.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  {payment.receiptUrl ? (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <button onClick={() => openText(payment.receiptUrl!, true)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                        Text Receipt
                      </button>
                      <button onClick={() => openEmail(payment.receiptUrl!, true)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                        Email Receipt
                      </button>
                      <button onClick={() => shareLink("Square receipt", payment.receiptUrl!)} className="py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,106,0,0.12)", color: "#C2410C" }}>
                        Share
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TechBottomNav active="payments" />
    </div>
  );
}
