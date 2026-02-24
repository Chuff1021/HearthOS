"use client";

import { useState } from "react";

const actions = [
  { icon: "🔧", label: "New Job", color: "bg-[#e85d04] text-white hover:bg-[#c44d03]", primary: true },
  { icon: "👥", label: "New Customer", color: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50" },
  { icon: "📄", label: "New Invoice", color: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50" },
  { icon: "📋", label: "New Estimate", color: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50" },
];

export default function QuickActions() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-[#e85d04] text-white rounded-lg text-sm font-medium hover:bg-[#c44d03] transition-colors shadow-sm"
      >
        <span>+</span>
        <span>Quick Add</span>
        <span className="text-xs opacity-70">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          ></div>
          <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden">
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="text-base">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
