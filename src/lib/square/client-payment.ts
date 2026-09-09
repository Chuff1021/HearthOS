export const PAYMENT_DEADLINE_MS = 30_000;
export const PAYMENT_REVIEW_MESSAGE = "Payment status is uncertain. Do not submit another payment or switch payment methods. Check payment status with the office before trying again.";

export type PaymentResult = {
  kind: "completed" | "submitted" | "checkout" | "rejected" | "unknown";
  message: string;
  paymentId?: string;
  receiptUrl?: string;
  url?: string;
  accountingWarning?: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function httpsUrl(value: unknown): string | undefined {
  if (!nonempty(value)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function classifyPaymentResponse(status: number, data: unknown, checkout = false): PaymentResult {
  const unknown: PaymentResult = { kind: "unknown", message: PAYMENT_REVIEW_MESSAGE };
  if (!record(data) || !Number.isInteger(status) || status >= 500 || status < 200) return unknown;
  const matchesPayment = data.payment === undefined || (record(data.payment)
    && data.payment.id === data.paymentId && data.payment.status === data.status);
  if (!checkout && status === 409 && data.ok === false && data.code === "CAPTURE_PENDING"
    && nonempty(data.paymentId) && matchesPayment && (data.status === "PENDING" || data.status === "APPROVED")) {
    return { kind: "submitted", message: "Payment submitted, not yet captured. Wait for confirmation and check payment status with the office. Do not submit another payment.", paymentId: data.paymentId };
  }
  if (status >= 400) {
    // Only the server can establish that an attempted payment did not capture.
    if (data.retrySafe === true && data.ok !== true
      && (data.status === undefined || data.status === "FAILED" || data.status === "CANCELED")
      && (data.payment === undefined || (nonempty(data.paymentId) && matchesPayment
        && (data.status === "FAILED" || data.status === "CANCELED")))) {
      return { kind: "rejected", message: nonempty(data.error) ? data.error : "Payment was rejected. You may correct the details and try again." };
    }
    return unknown;
  }
  if (status >= 300 || data.ok !== true) return unknown;
  if (checkout) {
    const url = httpsUrl(data.url);
    return nonempty(data.paymentLinkId) && url
      ? { kind: "checkout", message: "Payment link created. Payment has not been captured. Check payment status before collecting another payment for this invoice.", url }
      : unknown;
  }
  if (!nonempty(data.paymentId)) return unknown;
  if (!matchesPayment) return unknown;
  const receiptUrl = httpsUrl(data.receiptUrl);
  if (data.status === "COMPLETED") {
    const accountingWarning = record(data.invoicePayment) && data.invoicePayment.qbExportStatus === "review_required"
      ? "Payment was captured, but the QuickBooks export needs office review. Do not charge again." : undefined;
    return { kind: "completed", message: "Square payment captured.", paymentId: data.paymentId, receiptUrl, accountingWarning };
  }
  if (data.status === "PENDING" || data.status === "APPROVED") {
    return { kind: "submitted", message: "Payment submitted, not yet captured. Wait for confirmation and check payment status with the office. Do not submit another payment.", paymentId: data.paymentId };
  }
  return unknown;
}

export async function submitPaymentRequest(url: string, body: object, checkout = false): Promise<PaymentResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unknown: PaymentResult = { kind: "unknown", message: PAYMENT_REVIEW_MESSAGE };
  try {
    // Race the whole response, including JSON. Abort alone cannot bound a stalled body.
    return await Promise.race([
      new Promise<PaymentResult>((resolve) => {
        timer = setTimeout(() => { resolve(unknown); controller.abort(); }, PAYMENT_DEADLINE_MS);
      }),
      (async () => {
        const response = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: controller.signal,
        });
        return classifyPaymentResponse(response.status, await response.json(), checkout);
      })(),
    ]);
  } catch {
    return unknown;
  } finally {
    clearTimeout(timer);
  }
}

type Method = "card" | "ach" | "checkout";
type Phase = "idle" | "authorizing" | "submitting" | PaymentResult["kind"];

export function createPaymentGuard() {
  let phase: Phase = "idle";
  let method: Method | undefined;
  return {
    begin(next: Method) {
      if (phase !== "idle") return false;
      phase = "authorizing";
      method = next;
      return true;
    },
    submit(next: Method) {
      if (phase !== "authorizing" || method !== next) return false;
      phase = "submitting";
      return true;
    },
    authorizationFailed(next: Method) {
      if (phase !== "authorizing" || method !== next) return false;
      phase = "idle";
      return true;
    },
    finish(result: PaymentResult) {
      if (phase !== "submitting") return;
      phase = result.kind === "rejected" ? "idle" : result.kind;
    },
    resetConfirmed() {
      if (phase !== "completed" && phase !== "checkout") return false;
      phase = "idle";
      return true;
    },
  };
}
