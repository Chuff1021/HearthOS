"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, ChevronDown, FilePlus2, Plus, Receipt, UserPlus } from "lucide-react";

const actions = [
  { label: "New Job", href: "/jobs", icon: BriefcaseBusiness, tone: "var(--color-info)" },
  { label: "New Customer", href: "/customers", icon: UserPlus, tone: "var(--color-ember)" },
  { label: "New Invoice", href: "/invoices", icon: Receipt, tone: "var(--color-success)" },
  { label: "New Estimate", href: "/tech/estimate", icon: FilePlus2, tone: "#7c3aed" },
];

export default function QuickActions() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleAction = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="ui-btn-primary flex items-center gap-2 rounded-2xl px-5 py-3 text-sm"
      >
        <Plus size={17} />
        <span>Quick Add</span>
        <ChevronDown size={15} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} aria-label="Close quick actions" />
          <div className="liquid-panel absolute right-0 top-full z-20 mt-3 w-60 overflow-hidden rounded-3xl p-2" style={{ boxShadow: "var(--shadow-elevated)" }}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => handleAction(action.href)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm hover:bg-white/60"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      color: action.tone,
                      background: "rgba(255,255,255,0.66)",
                      border: "1px solid rgba(255,255,255,0.8)",
                    }}
                  >
                    <Icon size={17} />
                  </span>
                  <span className="font-semibold">{action.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
