"use client";

import { useState } from "react";

const navItems = [
  {
    group: "Main",
    items: [
      { icon: "⊞", label: "Dashboard", href: "/", active: true },
      { icon: "📅", label: "Schedule", href: "/schedule", badge: "8" },
      { icon: "🔧", label: "Jobs", href: "/jobs", badge: "3" },
      { icon: "👥", label: "Customers", href: "/customers" },
      { icon: "🗺️", label: "Dispatch Map", href: "/dispatch" },
    ],
  },
  {
    group: "Billing",
    items: [
      { icon: "📄", label: "Invoices", href: "/invoices", badge: "5" },
      { icon: "💳", label: "Payments", href: "/payments" },
      { icon: "📋", label: "Estimates", href: "/estimates", badge: "2" },
    ],
  },
  {
    group: "Operations",
    items: [
      { icon: "📦", label: "Inventory", href: "/inventory" },
      { icon: "🔁", label: "Service Plans", href: "/service-plans" },
      { icon: "📊", label: "Reports", href: "/reports" },
    ],
  },
  {
    group: "Admin",
    items: [
      { icon: "👤", label: "Team", href: "/team" },
      { icon: "⚙️", label: "Settings", href: "/settings" },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-60"
      } flex-shrink-0 bg-[#1a1a2e] text-white flex flex-col transition-all duration-200 overflow-hidden`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-[#e85d04] flex items-center justify-center text-lg flex-shrink-0">
          🔥
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-sm leading-tight">HearthOS</div>
            <div className="text-[10px] text-white/40 leading-tight">
              Field Service
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-white/40 hover:text-white/80 transition-colors text-xs"
          aria-label="Toggle sidebar"
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-hide">
        {navItems.map((group) => (
          <div key={group.group} className="mb-4">
            {!collapsed && (
              <div className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {group.group}
              </div>
            )}
            {group.items.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-all ${
                  item.active
                    ? "bg-[#e85d04] text-white font-medium"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          item.active
                            ? "bg-white/20 text-white"
                            : "bg-[#e85d04] text-white"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </a>
            ))}
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#e85d04] flex items-center justify-center text-sm font-bold flex-shrink-0">
            S
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">Sarah Mitchell</div>
              <div className="text-[10px] text-white/40">Dispatcher</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
