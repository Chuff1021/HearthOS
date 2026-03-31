"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TechBottomNav from "@/components/tech/TechBottomNav";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function EstimatePage() {
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ description: "", quantity: 1, unitPrice: 0 });
  const [actionMsg, setActionMsg] = useState("");

  const [customer, setCustomer] = useState({
    name: "",
    address: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('customer') || '';
    const address = params.get('address') || '';
    if (name || address) setCustomer({ name, address });
  }, []);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    setActionMsg("");

    try {
      const res = await fetch("/api/estimator/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, customerName: customer.name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionMsg(data.error || "Failed to generate estimate");
        setIsGenerating(false);
        return;
      }

      if (data.lineItems && Array.isArray(data.lineItems)) {
        const items: LineItem[] = data.lineItems.map((item: any, i: number) => ({
          id: `ai-${Date.now()}-${i}`,
          description: item.partNumber ? `${item.description} (${item.partNumber})` : item.description,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          total: Number(item.total) || (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
        }));
        setLineItems(items);
        if (data.notes) setActionMsg(data.notes);
      } else {
        setActionMsg("No line items generated. Try being more specific.");
      }
    } catch (err) {
      setActionMsg("Failed to connect to AI. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddItem = () => {
    if (!newItem.description) return;
    
    const item: LineItem = {
      id: Date.now().toString(),
      description: newItem.description,
      quantity: newItem.quantity,
      unitPrice: newItem.unitPrice,
      total: newItem.quantity * newItem.unitPrice,
    };
    
    setLineItems([...lineItems, item]);
    setNewItem({ description: "", quantity: 1, unitPrice: 0 });
    setShowAddItem(false);
  };

  const handleRemoveItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * 0.07; // 7% tax
  const total = subtotal + tax;

  const saveDraft = async () => {
    const draft = { customer, lineItems, subtotal, tax, total, savedAt: new Date().toISOString() };
    localStorage.setItem("tech-estimate-draft", JSON.stringify(draft));
    try {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customer.name,
          customerId: '',
          issueDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          lineItems: lineItems.map((l) => ({ description: l.description, qty: l.quantity, unitPrice: l.unitPrice })),
          notes: 'Tech estimate draft',
        }),
      });
      setActionMsg("Draft saved to office queue.");
    } catch {
      setActionMsg("Draft saved locally.");
    }
  };

  const sendToCustomer = async () => {
    const payload = { customer, lineItems, subtotal, tax, total };
    localStorage.setItem("tech-estimate-send-queue", JSON.stringify(payload));
    try {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customer.name,
          customerId: '',
          issueDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          lineItems: lineItems.map((l) => ({ description: l.description, qty: l.quantity, unitPrice: l.unitPrice })),
          notes: 'Tech estimate sent from field',
        }),
      });
      setActionMsg("Estimate sent to office/customer workflow.");
    } catch {
      setActionMsg("Estimate queued to send to customer.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-32">
      {/* Header */}
      <header
        className="bg-[var(--color-surface-1)] sticky top-0 z-10 px-4 pb-4"
        style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/tech" aria-label="Back to Jobs" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Create Estimate</h1>
            <p className="text-xs text-gray-400">{customer.name}</p>
          </div>
        </div>
      </header>

      {/* AI Estimate Builder */}
      <div className="p-4">
        <div className="bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-blue-600/50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="font-semibold">AI Estimate Builder</h3>
          </div>
          <p className="text-sm text-gray-300 mb-3">
            Describe what work needs to be done and I will generate an estimate for you.
          </p>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g., Annual inspection, pilot light won't stay lit, customer wants glass cleaned..."
            className="w-full bg-[var(--color-bg)] rounded-xl p-3 text-sm min-h-[80px] border border-gray-700 focus:border-blue-600 outline-none resize-none"
          />
          <button
            onClick={handleAiGenerate}
            disabled={isGenerating || !aiPrompt.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 py-3 rounded-xl font-medium mt-3 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Estimate
              </>
            )}
          </button>
        </div>

        {/* Line Items */}
        {lineItems.length > 0 && (
          <div className="bg-[var(--color-surface-1)] rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Line Items</h3>
              <button
                onClick={() => setShowAddItem(true)}
                className="text-blue-600 text-sm font-medium"
              >
                + Add Item
              </button>
            </div>
            
            <div className="space-y-3">
              {lineItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 pb-3 border-b border-gray-800 last:border-0 last:pb-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-gray-400">
                      {item.quantity} x ${item.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${item.total.toFixed(2)}</p>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-xs text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tax (7%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t border-gray-700">
                <span>Total</span>
                <span className="text-blue-600">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItem && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
            <div className="bg-[var(--color-surface-1)] w-full max-w-md mx-auto rounded-t-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Add Line Item</h3>
                <button onClick={() => setShowAddItem(false)} className="text-gray-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-3">
                <input
                  type="text"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="Description"
                  className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                    placeholder="Qty"
                    min="1"
                    className="bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
                  />
                  <input
                    type="number"
                    value={newItem.unitPrice || ""}
                    onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="Unit Price"
                    min="0"
                    step="0.01"
                    className="bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleAddItem}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 py-3 rounded-xl font-medium mt-4"
              >
                Add Item
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {lineItems.length > 0 && (
          <div className="space-y-3">
            {actionMsg && <p className="text-xs" style={{ color: "#98CD00" }}>{actionMsg}</p>}
            <button onClick={sendToCustomer} className="w-full bg-gradient-to-r from-green-500 to-emerald-500 py-4 rounded-xl font-semibold flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send to Customer
            </button>
            <button onClick={saveDraft} className="w-full bg-[var(--color-surface-3)] py-3 rounded-xl font-medium border border-gray-700">
              Save as Draft
            </button>
          </div>
        )}
      </div>

      <TechBottomNav active="jobs" />
    </div>
  );
}
