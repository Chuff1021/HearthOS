"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TechBottomNav from "@/components/tech/TechBottomNav";

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

export default function TechPaymentsPage() {
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<SquarePayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [creating, setCreating] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    amount: "",
    customerName: "",
    invoiceNumber: "",
    buyerEmail: "",
    buyerPhone: "",
    note: "",
  });

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
      const res = await fetch("/api/square/transactions?limit=20", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Square payments");
      setPayments(data.payments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Square payments");
    } finally {
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    loadPayments();
    const intervalId = window.setInterval(loadPayments, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const completedToday = useMemo(
    () => payments.filter((payment) => payment.status === "completed").reduce((sum, payment) => sum + payment.amount, 0),
    [payments]
  );

  async function createCheckout() {
    setError("");
    setCheckoutUrl("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }

    try {
      setCreating(true);
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
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to create Square checkout link");
      }
      setCheckoutUrl(data.url);
      window.open(data.url, "_blank", "noopener,noreferrer");
      await loadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Square checkout link");
    } finally {
      setCreating(false);
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
          <div className="px-3 py-2 rounded-xl text-sm" style={{ background: "rgba(255,68,0,0.10)", border: "1px solid rgba(255,68,0,0.22)", color: "#C2410C" }}>
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
              This opens Square-hosted checkout on the tech’s phone. After the link is created, you can send it by text or email.
            </div>
          </div>
          <input
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
            type="text"
            placeholder="Customer name"
            value={form.customerName}
            onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <input
            type="text"
            placeholder="Invoice or job number"
            value={form.invoiceNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <input
            type="email"
            placeholder="Customer email"
            value={form.buyerEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, buyerEmail: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <input
            type="tel"
            placeholder="Customer mobile"
            value={form.buyerPhone}
            onChange={(e) => setForm((prev) => ({ ...prev, buyerPhone: e.target.value }))}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <textarea
            placeholder="Note"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            rows={3}
            className="w-full px-3 py-3 rounded-xl resize-none"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          />
          <button
            onClick={createCheckout}
            disabled={creating}
            className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}
          >
            {creating ? "Creating Square link..." : "Create Square Payment Link"}
          </button>

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
        </div>

        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
          <div>
            <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent Square activity</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Completed payments can share the Square receipt URL by text, email, or the phone share sheet.
            </div>
          </div>

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
                        {payment.invoiceNumber || "Square Order"} • {methodLabel(payment.method)} • {formatDateTime(payment.paymentDate)}
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
