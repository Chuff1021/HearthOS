"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Vendor = { Id: string; DisplayName: string; CompanyName?: string };
type Item = { Id: string; Name: string; Type?: string; FullyQualifiedName?: string; Sku?: string; UnitPrice?: number };
type PO = { Id: string; DocNumber?: string; TxnDate?: string; VendorRef?: { name?: string }; TotalAmt?: number };

export default function PurchaseOrdersPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ itemId: "", description: "", qty: 1, unitPrice: 0 }]);

  function getItemPartNumber(item: Item | undefined) {
    return item?.Sku || item?.FullyQualifiedName || item?.Name || "";
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [vRes, iRes, pRes] = await Promise.all([
        fetch("/api/quickbooks/vendors"),
        fetch("/api/quickbooks/items?sync=true"),
        fetch("/api/quickbooks/purchase-orders"),
      ]);

      const vData = await vRes.json();
      const iData = await iRes.json();
      const pData = await pRes.json();

      if (!vRes.ok) throw new Error(vData.error || "Failed vendors load");
      if (!iRes.ok) throw new Error(iData.error || "Failed items load");
      if (!pRes.ok) throw new Error(pData.error || "Failed purchase orders load");

      setVendors(vData.vendors || []);
      setItems(iData.items || []);
      setPurchaseOrders(pData.purchaseOrders || []);

      if (!vendorId && vData.vendors?.length) setVendorId(vData.vendors[0].Id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase order data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
    return { subtotal };
  }, [lines]);

  function updateLine(idx: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { itemId: "", description: "", qty: 1, unitPrice: 0 }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function createPO() {
    if (!vendorId) return setError("Please select a vendor.");
    const normalized = lines
      .filter((l) => l.itemId || l.description)
      .map((l) => ({
        itemId: l.itemId || undefined,
        description: l.description || undefined,
        qty: Number(l.qty || 0),
        unitPrice: Number(l.unitPrice || 0),
        amount: Number(l.qty || 0) * Number(l.unitPrice || 0),
      }))
      .filter((l) => l.amount > 0);

    if (!normalized.length) return setError("Add at least one line with quantity and price.");

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          memo: memo || undefined,
          lines: normalized,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create purchase order");

      setMemo("");
      setLines([{ itemId: "", description: "", qty: 1, unitPrice: 0 }]);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Purchase Orders</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Create and send purchase orders to QuickBooks vendors</p>
          </div>
          <button onClick={loadAll} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>Refresh</button>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-4">New Purchase Order</h2>

              {error && (
                <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.35)", color: "#FF204E" }}>
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Vendor</label>
                  <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                    <option value="">Select vendor</option>
                    {vendors.map((v) => <option key={v.Id} value={v.Id}>{v.DisplayName}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Memo</label>
                  <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional internal note" className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={line.itemId}
                        onChange={(e) => {
                          const item = items.find((i) => i.Id === e.target.value);
                          updateLine(idx, {
                            itemId: e.target.value,
                            description: item ? `${item.Name}${getItemPartNumber(item) ? ` | Part: ${getItemPartNumber(item)}` : ""}` : line.description,
                            unitPrice: Number(item?.UnitPrice || line.unitPrice || 0),
                          });
                        }}
                        className="col-span-4 px-2 py-2 rounded-lg text-sm"
                        style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                      >
                        <option value="">Item</option>
                        {items.map((i) => <option key={i.Id} value={i.Id}>{i.Name} · {getItemPartNumber(i)}</option>)}
                      </select>

                      <input value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} placeholder="Description" className="col-span-4 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                      <input type="number" min={1} value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value || 1) })} className="col-span-1 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                      <input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value || 0) })} className="col-span-2 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                      <button onClick={() => removeLine(idx)} className="col-span-1 px-2 py-2 rounded-lg text-xs" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E" }}>✕</button>
                    </div>
                  ))}
                </div>

                <button onClick={addLine} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>+ Add line</button>

                <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>Subtotal</div>
                  <div className="font-semibold">${totals.subtotal.toFixed(2)}</div>
                </div>

                <button disabled={saving || loading} onClick={createPO} className="w-full py-2.5 rounded-lg text-white font-semibold" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Sending to QuickBooks..." : "Create Purchase Order"}
                </button>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-3">Recent Purchase Orders</h2>
              {loading ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</p>
              ) : purchaseOrders.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No purchase orders found.</p>
              ) : (
                <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                  {purchaseOrders.slice(0, 30).map((po) => (
                    <div key={po.Id} className="p-3 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{po.DocNumber || `PO ${po.Id}`}</div>
                      <div className="text-sm font-semibold">{po.VendorRef?.name || "Vendor"}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{po.TxnDate || "—"}</div>
                      <div className="text-sm font-semibold mt-1">${Number(po.TotalAmt || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
