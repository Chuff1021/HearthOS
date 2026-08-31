"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type PaymentStatus = {
  type: "info" | "success" | "error";
  message: string;
  receiptUrl?: string;
};

const fmtMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARD_FEE_RATE = 0.035;

function formAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export default function CustomerPayPage() {
  const searchParams = useSearchParams();
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<any>(null);
  const achRef = useRef<any>(null);
  const achTransactionIdRef = useRef("");
  const paymentContextRef = useRef({
    amount: "",
    customerName: "",
    invoiceNumber: "",
    buyerEmail: "",
    accountHolderName: "",
  });

  const [form, setForm] = useState({
    amount: searchParams.get("amount") || "",
    customerName: searchParams.get("customer") || "",
    invoiceNumber: searchParams.get("invoice") || "",
    buyerEmail: searchParams.get("email") || "",
    accountHolderName: searchParams.get("customer") || "",
  });
  const [sdkReady, setSdkReady] = useState(false);
  const [achReady, setAchReady] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [processingCard, setProcessingCard] = useState(false);
  const [processingAch, setProcessingAch] = useState(false);
  const [status, setStatus] = useState<PaymentStatus | null>(null);

  const squareAppId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || "";
  const squareLocationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || "";
  const squareEnv = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || "production";
  const amount = formAmount(form.amount);
  const cardFee = amount * CARD_FEE_RATE;
  const cardTotal = amount + cardFee;

  useEffect(() => {
    paymentContextRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!squareAppId || !squareLocationId || !cardContainerRef.current) {
      setStatus({ type: "error", message: "Square payments are not configured for this payment page." });
      return;
    }

    let cancelled = false;
    const scriptId = "square-web-payments-sdk";
    const scriptSrc =
      squareEnv === "sandbox"
        ? "https://sandbox.web.squarecdn.com/v1/square.js"
        : "https://web.squarecdn.com/v1/square.js";

    async function createSquarePayment(sourceId: string, methodLabel: string, chargeAmount?: number) {
      const context = paymentContextRef.current;
      const nextAmount = chargeAmount ?? formAmount(context.amount);
      if (!nextAmount) throw new Error("Enter an amount greater than 0.");

      const res = await fetch("/api/square/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: nextAmount,
          invoiceAmount: formAmount(context.amount),
          sourceId,
          customerName: context.customerName || "Customer",
          invoiceNumber: context.invoiceNumber || undefined,
          buyerEmail: context.buyerEmail || undefined,
          note: context.invoiceNumber
            ? `${methodLabel} payment for invoice ${context.invoiceNumber}`
            : `${methodLabel} payment`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to submit ${methodLabel} payment`);
      return data;
    }

    async function mountPayments() {
      try {
        const w = window as any;
        if (!w.Square || cancelled) return;

        const payments = w.Square.payments(squareAppId, squareLocationId);
        const card = await payments.card();
        if (cancelled) return;
        await card.attach(cardContainerRef.current);
        cardRef.current = card;
        setCardReady(true);

        const transactionId = `hearth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        achTransactionIdRef.current = transactionId;
        const ach = await payments.ach({
          redirectURI: `${window.location.origin}/pay`,
          transactionId,
        });
        ach.addEventListener("ontokenization", async (event: any) => {
          const { tokenResult, error } = event.detail || {};
          try {
            if (error) throw new Error(error.message || "Bank account authorization failed.");
            if (tokenResult?.status !== "OK" || !tokenResult?.token) {
              throw new Error("Bank account authorization was not completed.");
            }
      const data = await createSquarePayment(tokenResult.token, "e-check");
            setStatus({
              type: "success",
              message: `E-check payment submitted for ${fmtMoney(formAmount(paymentContextRef.current.amount))}. Bank payments can take a few business days to settle.`,
              receiptUrl: data.receiptUrl || undefined,
            });
          } catch (err) {
            setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to submit e-check payment." });
          } finally {
            setProcessingAch(false);
          }
        });
        achRef.current = ach;
        setAchReady(true);
        setSdkReady(true);
      } catch (err) {
        if (!cancelled) {
          setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to load Square payments." });
          setSdkReady(false);
        }
      }
    }

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      void mountPayments();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => void mountPayments();
    script.onerror = () => {
      if (!cancelled) setStatus({ type: "error", message: "Failed to load Square Web Payments SDK." });
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [squareAppId, squareLocationId, squareEnv]);

  async function payByCard() {
    setStatus(null);
    if (!amount) return setStatus({ type: "error", message: "Enter an amount greater than 0." });
    if (!cardRef.current) return setStatus({ type: "error", message: "Card payment form is still loading." });

    try {
      setProcessingCard(true);
      const tokenResult = await cardRef.current.tokenize();
      if (tokenResult.status !== "OK") throw new Error("Card details are incomplete or invalid.");

      const res = await fetch("/api/square/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: cardTotal,
          invoiceAmount: amount,
          sourceId: tokenResult.token,
          customerName: form.customerName || "Customer",
          invoiceNumber: form.invoiceNumber || undefined,
          buyerEmail: form.buyerEmail || undefined,
          note: form.invoiceNumber
            ? `Card payment for invoice ${form.invoiceNumber}. Invoice amount ${fmtMoney(amount)} plus 3.5% card fee ${fmtMoney(cardFee)}.`
            : `Card payment. Amount ${fmtMoney(amount)} plus 3.5% card fee ${fmtMoney(cardFee)}.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit card payment");
      setStatus({
        type: "success",
        message: `Card payment captured for ${fmtMoney(cardTotal)}, including a ${fmtMoney(cardFee)} card processing fee.`,
        receiptUrl: data.receiptUrl || undefined,
      });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to submit card payment." });
    } finally {
      setProcessingCard(false);
    }
  }

  async function payByBank() {
    setStatus(null);
    if (!amount) return setStatus({ type: "error", message: "Enter an amount greater than 0." });
    if (!form.accountHolderName.trim()) return setStatus({ type: "error", message: "Enter the account holder name." });
    if (!achRef.current) return setStatus({ type: "error", message: "Bank payment is still loading." });

    try {
      setProcessingAch(true);
      window.localStorage.setItem(`hearth-ach-${achTransactionIdRef.current}`, JSON.stringify(paymentContextRef.current));
      await achRef.current.tokenize({
        accountHolderName: form.accountHolderName.trim(),
        intent: "CHARGE",
        amount: amount.toFixed(2),
        currency: "USD",
      });
    } catch (err) {
      setProcessingAch(false);
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to start bank payment." });
    }
  }

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>AARON&apos;S FIREPLACE CO, LLC</div>
          <h1 className="mt-1 text-3xl font-bold">Pay Invoice</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Pay securely by card or e-check through Square.
          </p>
        </div>

        <section className="rounded-xl p-5 space-y-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Invoice</div>
              <div className="mt-1 text-xl font-bold">{form.invoiceNumber || "Payment"}</div>
              <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>{form.customerName || "Customer"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Amount</div>
              <div className="mt-1 text-3xl font-bold" style={{ color: "#f8971f" }}>{fmtMoney(amount)}</div>
            </div>
          </div>

          {status && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: status.type === "error" ? "rgba(220,38,38,0.08)" : status.type === "success" ? "rgba(22,163,74,0.10)" : "rgba(37,99,235,0.10)",
                border: status.type === "error" ? "1px solid rgba(220,38,38,0.25)" : status.type === "success" ? "1px solid rgba(22,163,74,0.25)" : "1px solid rgba(37,99,235,0.25)",
                color: status.type === "error" ? "#DC2626" : status.type === "success" ? "#15803D" : "#2563EB",
              }}
            >
              <div>{status.message}</div>
              {status.receiptUrl && (
                <a href={status.receiptUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block underline">
                  View receipt
                </a>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Amount</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Customer email</span>
              <input
                type="email"
                value={form.buyerEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, buyerEmail: event.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              />
            </label>
          </div>

          <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Pay by card</h2>
              <span className="text-[10px] font-semibold uppercase" style={{ color: cardReady ? "#16A34A" : "var(--color-text-muted)" }}>
                {cardReady ? "Ready" : "Loading"}
              </span>
            </div>
            <div ref={cardContainerRef} className="min-h-[96px] rounded-lg p-3" style={{ background: "#fff", border: "1px solid var(--color-border)" }} />
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(248,151,31,0.10)", border: "1px solid rgba(248,151,31,0.25)", color: "var(--color-text-primary)" }}>
              <div className="flex justify-between"><span>Invoice amount</span><span>{fmtMoney(amount)}</span></div>
              <div className="flex justify-between"><span>Card fee (3.5%)</span><span>{fmtMoney(cardFee)}</span></div>
              <div className="flex justify-between font-semibold pt-1 mt-1" style={{ borderTop: "1px solid rgba(248,151,31,0.25)" }}><span>Card total</span><span>{fmtMoney(cardTotal)}</span></div>
            </div>
            <button
              onClick={payByCard}
              disabled={!cardReady || processingCard || !sdkReady}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #f8971f, #eaa23f)" }}
            >
              {processingCard ? "Processing..." : `Pay by Card ${amount ? fmtMoney(cardTotal) : ""}`}
            </button>
          </div>

          <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Pay by e-check</h2>
              <span className="text-[10px] font-semibold uppercase" style={{ color: achReady ? "#16A34A" : "var(--color-text-muted)" }}>
                {achReady ? "Ready" : "Loading"}
              </span>
            </div>
            <label className="block">
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Account holder name</span>
              <input
                type="text"
                value={form.accountHolderName}
                onChange={(event) => setForm((prev) => ({ ...prev, accountHolderName: event.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg"
                style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              />
            </label>
            <button
              onClick={payByBank}
              disabled={!achReady || processingAch || !sdkReady}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "#16A34A", border: "1px solid rgba(22,163,74,0.35)" }}
            >
              {processingAch ? "Opening bank verification..." : `Pay by E-check ${amount ? fmtMoney(amount) : ""}`}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
