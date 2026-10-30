"use client";
import { useState } from "react";
export default function QuoteBuilder() {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <details className="rounded border bg-[var(--color-surface)] p-4">
      <summary className="cursor-pointer font-semibold">
        Email a confirmed shipping quote and checkout link
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setNotice("");
          try {
            const items = String(data.get("items"))
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => {
                const [sku, quantity] = line.split(",");
                return { sku: sku.trim(), quantity: Number(quantity) };
              });
            const address = Object.fromEntries(
              [
                "name",
                "email",
                "phone",
                "street",
                "street2",
                "city",
                "state",
                "zip",
              ].map((key) => [key, String(data.get(key) || "")]),
            );
            const r = await fetch("/api/website-inbox/parts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "email_quote",
                items,
                address: { ...address, country: "US" },
                shippingCents: Math.round(Number(data.get("shipping")) * 100),
                shippingMethod: String(data.get("method")),
                reference: String(data.get("reference")),
              }),
            });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            setNotice(
              "Checkout email queued. The customer will review the total and authorize payment.",
            );
          } catch (e) {
            setNotice(
              e instanceof Error ? e.message : "Quote could not be sent",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm">
          Enter the supplier’s actual shipping quote. Square and TaxJar must be
          configured. The emailed link expires after 15 minutes.
        </p>
        <label className="block text-sm">
          One SKU and quantity per line (example: ABC,2)
          <textarea
            name="items"
            required
            className="mt-1 min-h-24 w-full rounded border bg-transparent p-3"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["name", "Customer name"],
            ["email", "Email"],
            ["phone", "Phone (optional)"],
            ["street", "Street address"],
            ["street2", "Apartment / suite (optional)"],
            ["city", "City"],
            ["state", "State code"],
            ["zip", "ZIP"],
            ["shipping", "Supplier shipping charge ($)"],
            ["method", "Shipping service"],
            ["reference", "Supplier quote reference"],
          ].map(([key, label]) => (
            <label className="text-sm" key={key}>
              {label}
              <input
                name={key}
                type={
                  key === "email"
                    ? "email"
                    : key === "shipping"
                      ? "number"
                      : "text"
                }
                min={key === "shipping" ? 0 : undefined}
                step={key === "shipping" ? "0.01" : undefined}
                required={!["phone", "street2"].includes(key)}
                className="mt-1 block w-full rounded border bg-transparent p-3"
              />
            </label>
          ))}
        </div>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" required />I confirmed the supplier shipping
          charge, items, package sizes and destination.
        </label>
        <button
          disabled={busy}
          className="rounded bg-orange-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Preparing quote…" : "Email checkout link"}
        </button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </form>
    </details>
  );
}
