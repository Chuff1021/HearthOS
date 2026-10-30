"use client";
import { useState } from "react";
export default function DiscoveryReview({
  url,
  saved,
}: {
  url: string;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer break-all text-sm">{url}</summary>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="my-3 inline-block text-sm underline"
      >
        Review supplier page
      </a>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/website-inbox/parts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "publish_discovery",
                url,
                brand: data.get("brand"),
                department: data.get("department"),
                partType: data.get("partType"),
              }),
            });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            await saved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Catalog update failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm">
          Manufacturer
          <input
            name="brand"
            required
            className="mt-1 block w-full rounded border bg-transparent p-3"
          />
        </label>
        <label className="block text-sm">
          Part type
          <input
            name="partType"
            required
            className="mt-1 block w-full rounded border bg-transparent p-3"
          />
        </label>
        <label className="block text-sm">
          Department
          <select
            name="department"
            className="mt-1 block w-full rounded border bg-[var(--color-surface)] p-3"
          >
            {[
              "Wood & Coal Stove Parts",
              "Gas Fireplace Parts",
              "Gas Stove Parts",
              "Pellet Stove Parts",
              "Electric Fireplace Parts",
              "Outdoor Fireplace Parts",
            ].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" required />I checked this part’s SKU, package
          size, photo and category.
        </label>
        <button
          disabled={busy}
          className="rounded border px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Verifying supplier page…" : "Publish reviewed part"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
