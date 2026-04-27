"use client";

import { useEffect, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Reusable doc drawer for drilling into a bill / invoice / purchase order
// from anywhere in the app. Stacks above existing drawers/modals.
// ───────────────────────────────────────────────────────────────────────────

export type DocumentType = "bill" | "invoice" | "purchase-order";

type Props = {
  type: DocumentType;
  id: string;
  onClose: () => void;
};

// API path per type
const apiFor = (type: DocumentType, id: string) => {
  switch (type) {
    case "bill": return `/api/bills/${id}`;
    case "invoice": return `/api/invoices/${id}`;
    case "purchase-order": return `/api/purchase-orders/${id}`;
  }
};

const titleFor = (type: DocumentType) => ({
  bill: "Bill",
  invoice: "Invoice",
  "purchase-order": "Purchase Order",
}[type]);

const fmtMoney = (n: number | string | null | undefined) => {
  if (n == null || n === "") return "—";
  const v = Number(n);
  return isNaN(v) ? "—" : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Slightly higher z-index than the inventory drawer (which is z-50)
const Z = 60;

export default function DocumentDrawer({ type, id, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    fetch(apiFor(type, id))
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => ok ? setData(j) : setError(j.error || "Failed to load"))
      .catch((e) => setError(e?.message || "Failed"));
  }, [type, id]);

  // Esc key closes the drawer (handy when stacked)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex" style={{ zIndex: Z }} onClick={onClose}>
      <div className="flex-1 bg-black/50" />
      <div
        className="h-full w-full md:w-[760px] overflow-y-auto"
        style={{ background: "var(--color-surface-1)", borderLeft: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Header type={type} data={data} onClose={onClose} />

        {error && (
          <div className="p-5">
            <p className="text-sm" style={{ color: "#FF204E" }}>Failed to load: {error}</p>
          </div>
        )}

        {!data && !error && (
          <div className="p-5 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
        )}

        {data && type === "bill" && <BillBody data={data} />}
        {data && type === "invoice" && <InvoiceBody data={data} />}
        {data && type === "purchase-order" && <POBody data={data} />}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Header
// ───────────────────────────────────────────────────────────────────────────
function Header({ type, data, onClose }: { type: DocumentType; data: any; onClose: () => void }) {
  let title = titleFor(type);
  let subtitle: string | null = null;
  let docNumber: string | null = null;
  let dateLabel: string | null = null;
  let total: number | string | null = null;
  let status: string | null = null;

  if (data) {
    if (type === "bill") {
      docNumber = data.bill?.billNumber || null;
      subtitle = data.vendor?.name || null;
      dateLabel = data.bill?.issueDate;
      total = data.bill?.totalAmount;
      status = data.bill?.status;
    } else if (type === "invoice") {
      docNumber = data.invoice?.invoiceNumber || null;
      subtitle = data.customer?.name || null;
      dateLabel = data.invoice?.issueDate;
      total = data.invoice?.totalAmount;
      status = data.invoice?.status;
    } else if (type === "purchase-order") {
      docNumber = data.purchaseOrder?.poNumber || null;
      subtitle = data.vendor?.name || null;
      dateLabel = data.purchaseOrder?.issueDate;
      total = data.purchaseOrder?.totalAmount;
      status = data.purchaseOrder?.status;
    }
  }

  return (
    <div
      className="sticky top-0 z-10 p-5"
      style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-mono mb-1" style={{ color: "var(--color-text-muted)" }}>
            {title} {docNumber ? `· #${docNumber}` : ""}
          </p>
          <h2 className="text-lg font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {subtitle || "—"}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {fmtDate(dateLabel)}
            {status && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase" style={{ background: "var(--color-surface-2)" }}>
                {status}
              </span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          {total != null && (
            <p className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(total)}</p>
          )}
          <button onClick={onClose} className="mt-1 p-2 rounded-lg" style={{ color: "var(--color-text-muted)" }}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Body renderers
// ───────────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-secondary)" }}>{title}</h3>
      {children}
    </div>
  );
}

function MetaGrid({ pairs }: { pairs: Array<[string, string | number | null]> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {pairs.map(([label, value], i) => (
        <div key={i}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
          <p className="text-sm font-medium mt-0.5" style={{ color: "var(--color-text-primary)" }}>{value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}

function LineItemTable({ items, costMode = false }: { items: any[]; costMode?: boolean }) {
  if (!items?.length) {
    return <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No line items.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead style={{ color: "var(--color-text-muted)" }}>
          <tr>
            <th className="text-left py-1.5 pr-3">Description</th>
            <th className="text-right py-1.5 px-2">Qty</th>
            <th className="text-right py-1.5 px-2">{costMode ? "Unit Cost" : "Unit Price"}</th>
            {costMode && <th className="text-right py-1.5 px-2">Received</th>}
            <th className="text-right py-1.5 pl-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((li, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
              <td className="py-2 pr-3" style={{ color: "var(--color-text-primary)" }}>
                {li.description || "—"}
                {li.qbItemId && <span className="ml-2 text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>QB#{li.qbItemId}</span>}
                {li.customerName && <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>billable to {li.customerName}</div>}
              </td>
              <td className="py-2 px-2 text-right" style={{ color: "var(--color-text-secondary)" }}>{Number(li.quantity || 1)}</td>
              <td className="py-2 px-2 text-right" style={{ color: "var(--color-text-secondary)" }}>
                {fmtMoney(costMode ? li.unitCost : li.unitPrice)}
              </td>
              {costMode && (
                <td className="py-2 px-2 text-right" style={{ color: "var(--color-text-muted)" }}>
                  {li.receivedQty != null ? Number(li.receivedQty) : "—"}
                </td>
              )}
              <td className="py-2 pl-2 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>
                {fmtMoney(li.amount ?? li.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillBody({ data }: { data: any }) {
  const b = data.bill;
  return (
    <>
      <Section title="Bill details">
        <MetaGrid pairs={[
          ["Vendor", data.vendor?.name || "—"],
          ["Issue date", fmtDate(b.issueDate)],
          ["Due date", fmtDate(b.dueDate)],
          ["Subtotal", fmtMoney(b.subtotal)],
          ["Tax", fmtMoney(b.taxAmount)],
          ["Balance due", fmtMoney(b.balance)],
        ]} />
      </Section>
      <Section title="Line items">
        <LineItemTable items={data.lineItems} costMode />
      </Section>
      {b.privateNote && (
        <Section title="Notes">
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>{b.privateNote}</p>
        </Section>
      )}
      {data.vendor && (
        <Section title="Vendor contact">
          <MetaGrid pairs={[
            ["Email", data.vendor.email || null],
            ["Phone", data.vendor.phone || null],
          ]} />
        </Section>
      )}
    </>
  );
}

function InvoiceBody({ data }: { data: any }) {
  const inv = data.invoice;
  return (
    <>
      <Section title="Invoice details">
        <MetaGrid pairs={[
          ["Customer", data.customer?.name || "—"],
          ["Issue date", fmtDate(inv.issueDate)],
          ["Due date", fmtDate(inv.dueDate)],
          ["Subtotal", fmtMoney(inv.subtotal)],
          ["Tax", fmtMoney(inv.taxAmount)],
          ["Balance due", fmtMoney(inv.balance)],
        ]} />
      </Section>
      <Section title="Line items">
        <LineItemTable items={data.lineItems} />
      </Section>
      {data.payments && data.payments.length > 0 && (
        <Section title={`Payments applied (${data.payments.length})`}>
          <div className="space-y-1.5">
            {data.payments.map((p: any) => (
              <div key={p.id} className="text-xs flex items-center justify-between p-2 rounded" style={{ background: "var(--color-surface-2)" }}>
                <div>
                  <span style={{ color: "var(--color-text-primary)" }}>{fmtMoney(p.amount)}</span>
                  <span className="mx-2" style={{ color: "var(--color-text-muted)" }}>·</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>{p.paymentMethod || "payment"}</span>
                </div>
                <span style={{ color: "var(--color-text-muted)" }}>{fmtDate(p.paidAt)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      {inv.notes && (
        <Section title="Notes">
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>{inv.notes}</p>
        </Section>
      )}
      {data.customer && (
        <Section title="Customer contact">
          <MetaGrid pairs={[
            ["Email", data.customer.email || null],
            ["Phone", data.customer.phone || null],
          ]} />
        </Section>
      )}
    </>
  );
}

function POBody({ data }: { data: any }) {
  const po = data.purchaseOrder;
  return (
    <>
      <Section title="PO details">
        <MetaGrid pairs={[
          ["Vendor", data.vendor?.name || "—"],
          ["Issue date", fmtDate(po.issueDate)],
          ["Expected", fmtDate(po.expectedDate)],
          ["Subtotal", fmtMoney(po.subtotal)],
          ["Tax", fmtMoney(po.taxAmount)],
          ["Total", fmtMoney(po.totalAmount)],
        ]} />
      </Section>
      <Section title="Line items">
        <LineItemTable items={data.lineItems} costMode />
      </Section>
      {po.shipAddress && (
        <Section title="Ship to">
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>{po.shipAddress}</p>
        </Section>
      )}
      {po.vendorMessage && (
        <Section title="Message to vendor">
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>{po.vendorMessage}</p>
        </Section>
      )}
      {po.privateNote && (
        <Section title="Internal notes">
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>{po.privateNote}</p>
        </Section>
      )}
      {data.vendor && (
        <Section title="Vendor contact">
          <MetaGrid pairs={[
            ["Email", data.vendor.email || null],
            ["Phone", data.vendor.phone || null],
          ]} />
        </Section>
      )}
    </>
  );
}
