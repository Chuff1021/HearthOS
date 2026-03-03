"use client";

import { useState } from "react";
import Link from "next/link";

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

  const customer = {
    name: "Johnson Residence",
    address: "123 Oak Street, Springfield, IL 62701",
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    
    // Simulate AI generation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Mock AI-generated line items based on prompt
    const mockItems: LineItem[] = [
      { id: "1", description: "Annual Inspection Service", quantity: 1, unitPrice: 89, total: 89 },
      { id: "2", description: "Thermocouple Replacement", quantity: 1, unitPrice: 45, total: 45 },
      { id: "3", description: "Glass Cleaning", quantity: 1, unitPrice: 35, total: 35 },
      { id: "4", description: "Pilot Assembly Cleaning", quantity: 1, unitPrice: 25, total: 25 },
    ];
    
    setLineItems(mockItems);
    setIsGenerating(false);
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

  return (
    <div className="ui-page-mobile flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="ui-mobile-header p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/tech" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Create Estimate</h1>
            <p className="text-xs text-[var(--color-text-muted)]">{customer.name}</p>
          </div>
        </div>
      </header>

      {/* AI Estimate Builder */}
      <div className="p-4">
        <div className="bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-[rgba(10,132,255,0.35)] rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-r from-[var(--color-ember)] to-[var(--color-ember-dark)] rounded-full flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="font-semibold">AI Estimate Builder</h3>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-3">
            Describe what work needs to be done and I will generate an estimate for you.
          </p>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g., Annual inspection, pilot light won't stay lit, customer wants glass cleaned..."
            className="w-full bg-[var(--color-bg)] rounded-xl p-3 text-sm min-h-[80px] border border-[var(--color-border)]  outline-none resize-none"
          />
          <button
            onClick={handleAiGenerate}
            disabled={isGenerating || !aiPrompt.trim()}
            className="ui-btn-primary w-full py-3 mt-3 disabled:opacity-50 flex items-center justify-center gap-2"
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
          <div className="ui-card p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Line Items</h3>
              <button
                onClick={() => setShowAddItem(true)}
                className="text-[var(--color-ember)] text-sm font-medium"
              >
                + Add Item
              </button>
            </div>
            
            <div className="space-y-3">
              {lineItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 pb-3 border-b border-[var(--color-border)] last:border-0 last:pb-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
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
            <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Tax (7%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t border-[var(--color-border)]">
                <span>Total</span>
                <span className="text-[var(--color-ember)]">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItem && (
          <div className="fixed inset-0 bg-slate-900/45 z-50 flex items-end">
            <div className="bg-[var(--color-surface-1)] w-full max-w-md mx-auto rounded-t-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Add Line Item</h3>
                <button onClick={() => setShowAddItem(false)} className="text-[var(--color-text-muted)]">
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
                  className="ui-input w-full px-4 py-3 text-sm"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                    placeholder="Qty"
                    min="1"
                    className="bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-[var(--color-border)]  outline-none"
                  />
                  <input
                    type="number"
                    value={newItem.unitPrice || ""}
                    onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="Unit Price"
                    min="0"
                    step="0.01"
                    className="bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-[var(--color-border)]  outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleAddItem}
                className="ui-btn-primary w-full py-3 mt-4"
              >
                Add Item
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {lineItems.length > 0 && (
          <div className="space-y-3">
            <button className="w-full bg-gradient-to-r from-green-500 to-emerald-500 py-4 rounded-xl font-semibold flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send to Customer
            </button>
            <button className="w-full bg-[var(--color-surface-3)] py-3 rounded-xl font-medium border border-[var(--color-border)]">
              Save as Draft
            </button>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface-1)] border-t border-[var(--color-border)] z-20">
        <div className="max-w-md mx-auto flex justify-around py-3">
          <Link href="/tech" className="flex flex-col items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Jobs</span>
          </Link>
          <Link href="/tech/manuals" className="flex flex-col items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs mt-1">Manuals</span>
          </Link>
          <Link href="/tech/gabe" className="flex flex-col items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs mt-1">GABE</span>
          </Link>
          <Link href="/tech/profile" className="flex flex-col items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
