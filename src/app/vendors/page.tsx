"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Vendor = { Id: string; DisplayName: string; CompanyName?: string; PrimaryEmailAddr?: { Address?: string } };
type Item = { Id: string; Name: string; UnitPrice?: number };
type PO = { Id: string; DocNumber?: string; TxnDate?: string; VendorRef?: { value?: string; name?: string }; TotalAmt?: number };

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vendorQuery, setVendorQuery] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ itemId: "", description: "", qty: 1, unitPrice: 0 }]);

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

      if (!selectedVendorId && vData.vendors?.length) {
        setSelectedVendorId(vData.vendors[0].Id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vendor data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      v.DisplayName?.toLowerCase().includes(q) ||
      v.CompanyName?.toLowerCase().includes(q) ||
      v.PrimaryEmailAddr?.Address?.toLowerCase().includes(q)
    );
  }, [vendors, vendorQuery]);

  const selectedVendor = vendors.find((v) => v.Id === selectedVendorId);

  const vendorPOs = useMemo(() => {
    if (!selectedVendorId) return purchaseOrders;
    return purchaseOrders.filter((po) => po.VendorRef?.value === selectedVendorId || po.VendorRef?.name === selectedVendor?.DisplayName);
  }, [purchaseOrders, selectedVendorId, selectedVendor?.DisplayName]);

  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  }, [lines]);

  function updateLine(idx: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function createPO() {
    if (!selectedVendorId) return setError("Select a vendor first.");
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

    if (!normalized.length) return setError("Add at least one PO line with quantity and price.");

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: selectedVendorId, memo: memo || undefined, lines: normalized }),
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
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Vendors</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Search vendors, review recent purchase orders, and create new POs</p>
          </div>
          <button onClick={loadAll} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>Refresh</button>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-3">Vendor Search</h2>
              <input
                value={vendorQuery}
                onChange={(e) => setVendorQuery(e.target.value)}
                placeholder="Search vendor"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
              />

              <div className="mt-3 space-y-2 max-h-[620px] overflow-auto pr-1">
                {(loading ? [] : filteredVendors).map((v) => (
                  <button
                    key={v.Id}
                    onClick={() => setSelectedVendorId(v.Id)}
                    className="w-full text-left p-3 rounded-lg"
                    style={{
                      background: selectedVendorId === v.Id ? "rgba(37,99,235,0.12)" : "var(--color-surface-3)",
                      border: `1px solid ${selectedVendorId === v.Id ? "rgba(37,99,235,0.35)" : "var(--color-border)"}`,
                    }}
                  >
                    <div className="text-sm font-semibold">{v.DisplayName}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{v.PrimaryEmailAddr?.Address || v.CompanyName || "—"}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="xl:col-span-2 rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-4">Create Purchase Order {selectedVendor ? `· ${selectedVendor.DisplayName}` : ""}</h2>
              {error && <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.35)" }}>{error}</div>}

              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo / note" className="w-full px-3 py-2 rounded-lg text-sm mb-3" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={line.itemId}
                      onChange={(e) => {
                        const item = items.find((it) => it.Id === e.target.value);
                        updateLine(idx, {
                          itemId: e.target.value,
                          description: item?.Name || line.description,
                          unitPrice: Number(item?.UnitPrice || line.unitPrice || 0),
                        });
                      }}
                      className="col-span-4 px-2 py-2 rounded-lg text-sm"
                      style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                    >
                      <option value="">Item</option>
                      {items.map((i) => <option key={i.Id} value={i.Id}>{i.Name}</option>)}
                    </select>
                    <input value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} className="col-span-4 px-2 py-2 rounded-lg text-sm" placeholder="Description" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                    <input type="number" min={1} value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value || 1) })} className="col-span-1 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                    <input type="number" step="0.01" min={0} value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value || 0) })} className="col-span-2 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                    <button onClick={() => setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))} className="col-span-1 px-2 py-2 rounded-lg text-xs" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E" }}>✕</button>
                  </div>
                ))}
              </div>

              <button onClick={() => setLines((prev) => [...prev, { itemId: "", description: "", qty: 1, unitPrice: 0 }])} className="mt-3 px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>+ Add line</button>

              <div className="mt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>Subtotal</div>
                <div className="text-lg font-bold">${subtotal.toFixed(2)}</div>
              </div>

              <button disabled={saving || !selectedVendorId} onClick={createPO} className="mt-3 w-full py-2.5 rounded-lg text-white font-semibold" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Sending to QuickBooks..." : "Create Purchase Order"}
              </button>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <h2 className="font-semibold mb-3">Recent Purchase Orders</h2>
              {loading ? <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</p> : (
                <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
                  {vendorPOs.slice(0, 40).map((po) => (
                    <div key={po.Id} className="p-3 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{po.DocNumber || `PO ${po.Id}`}</div>
                      <div className="text-sm font-semibold">{po.VendorRef?.name || "Vendor"}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{po.TxnDate || "—"}</div>
                      <div className="text-sm font-semibold mt-1">${Number(po.TotalAmt || 0).toFixed(2)}</div>
                    </div>
                  ))}
                  {vendorPOs.length === 0 && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No POs for this vendor yet.</p>}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
