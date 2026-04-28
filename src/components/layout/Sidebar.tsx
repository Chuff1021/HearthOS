"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useUser, SignedIn, SignedOut } from "@clerk/nextjs";
import FlameLogo from "@/components/FlameLogo";

const emptySubscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

const iconTone: Record<string, { bg: string; color: string; border: string }> = {
  "Dashboard": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "To-Do List": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Schedule": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Jobs": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Customers": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Dispatch Map": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Invoices": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Payments": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Estimates": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Inventory": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Vendors": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Reports": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Team": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "GABE Audit": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Time Admin": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
  "Settings": { bg: "rgba(255,255,255,0.04)", color: "#C7D2FE", border: "rgba(255,255,255,0.08)" },
};

const navItems = [
  {
    group: "Main",
    items: [
      {
        label: "Dashboard",
        href: "/",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm8-5a1 1 0 011 1v3.586l2.707 2.707a1 1 0 01-1.414 1.414l-3-3A1 1 0 019 10V6a1 1 0 011-1z" />
          </svg>
        ),
      },
      {
        label: "To-Do List",
        href: "/todos",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "Schedule",
        href: "/schedule",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "Jobs",
        href: "/jobs",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
            <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
          </svg>
        ),
      },
      {
        label: "Customers",
        href: "/customers",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        ),
      },
      {
        label: "Dispatch Map",
        href: "/dispatch",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
  {
    group: "Billing",
    items: [
      {
        label: "Invoices",
        href: "/invoices",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "Payments",
        href: "/payments",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "Estimates",
        href: "/estimates",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
  {
    group: "Operations",
    items: [
      {
        label: "Inventory",
        href: "/inventory",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
            <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "Vendors",
        href: "/vendors",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 5a2 2 0 012-2h3a1 1 0 010 2H5v10h10v-3a1 1 0 112 0v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
            <path d="M12 3a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V5.414l-5.293 5.293a1 1 0 01-1.414-1.414L14.586 4H13a1 1 0 01-1-1z" />
          </svg>
        ),
      },
      {
        label: "Reports",
        href: "/reports",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: "Admin",
    items: [
      {
        label: "Team",
        href: "/team",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
          </svg>
        ),
      },
      {
        label: "GABE Audit",
        href: "/admin/gabe-audit",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "Time Admin",
        href: "/admin/time",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-8V6a1 1 0 10-2 0v5a1 1 0 00.293.707l3 3a1 1 0 101.414-1.414L11 10z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "Settings",
        href: "/admin/settings",
        badge: null,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();
  const hydrated = useHydrated();

  return (
    <aside
      className={`${
        collapsed ? "w-[60px]" : "w-[220px]"
      } flex-shrink-0 flex flex-col transition-all duration-200 overflow-hidden`}
      style={{
        background: "var(--color-surface-1)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <FlameLogo size={32} />

        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm leading-tight" style={{ color: "var(--color-text-primary)" }}>
              HearthOS
            </div>
            <div className="text-[10px] leading-tight" style={{ color: "var(--color-text-muted)" }}>
              Field Service
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
          aria-label="Toggle sidebar"
        >
          {collapsed ? (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-hide">
        {navItems.map((group) => (
          <div key={group.group} className="mb-1">
            {!collapsed && (
              <div
                className="px-4 mb-1 mt-2 text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-text-muted)" }}
              >
                {group.group}
              </div>
            )}
            {group.items.map((item) => {
              const isActive = hydrated && pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    collapsed ? "justify-center" : ""
                  }`}
                  style={{
                    background: isActive ? "rgba(59,130,246,0.065)" : "transparent",
                    color: isActive ? "#BFDBFE" : "var(--color-text-secondary)",
                    fontWeight: isActive ? "600" : "400",
                    border: isActive ? "1px solid rgba(96,165,250,0.13)" : "1px solid transparent",
                    boxShadow: isActive ? "inset 2px 0 0 rgba(96,165,250,0.72)" : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.color = "var(--color-text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--color-text-secondary)";
                    }
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      background: isActive ? "rgba(59,130,246,0.16)" : (iconTone[item.label]?.bg || "rgba(148,163,184,0.08)"),
                      color: isActive ? "#DBEAFE" : (iconTone[item.label]?.color || "var(--color-text-secondary)"),
                      border: `1px solid ${isActive ? "rgba(147,197,253,0.35)" : (iconTone[item.label]?.border || "rgba(148,163,184,0.16)")}`,
                    }}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-[13px]">{item.label}</span>
                      {item.badge && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: isActive ? "rgba(248,151,31,0.28)" : "rgba(248,151,31,0.18)",
                            color: "#f8971f",
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        {/* QuickBooks Integration */}
        <div className="mb-1">
          {!collapsed && (
            <div
              className="px-4 mb-1 mt-2 text-[9px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-muted)" }}
            >
              Integrations
            </div>
          )}
          <Link
            href="/integrations/quickbooks"
            className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm transition-all ${
              collapsed ? "justify-center" : ""
            }`}
            style={{
              background: hydrated && pathname === "/integrations/quickbooks" ? "rgba(152,205,0,0.08)" : "transparent",
              color: hydrated && pathname === "/integrations/quickbooks" ? "#98CD00" : "var(--color-text-secondary)",
              border: hydrated && pathname === "/integrations/quickbooks" ? "1px solid rgba(152,205,0,0.15)" : "1px solid transparent",
              boxShadow: hydrated && pathname === "/integrations/quickbooks" ? "inset 2px 0 0 rgba(152,205,0,0.72)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!(hydrated && pathname === "/integrations/quickbooks")) {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!(hydrated && pathname === "/integrations/quickbooks")) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }
            }}
            title={collapsed ? "QuickBooks" : undefined}
          >
            {/* QuickBooks logo mark */}
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(152,205,0,0.12)", color: "#98CD00", border: "1px solid rgba(152,205,0,0.28)" }}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "#98CD00" }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
              </svg>
            </span>
            {!collapsed && (
              <>
                <span className="flex-1 text-[13px]">QuickBooks</span>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(152,205,0,0.2)", color: "#98CD00" }}
                >
                  SYNC
                </span>
              </>
            )}
          </Link>
        </div>
      </nav>

      {/* User Profile */}
      <div
        className="p-3 flex-shrink-0"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <SignedIn>
          <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={user.fullName || "User"}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full flex-shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                style={{ background: "linear-gradient(135deg, #f8971f, #eaa23f)" }}
              >
                {user?.firstName?.[0] || "U"}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                  {user?.fullName || "User"}
                </div>
                <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  {user?.primaryEmailAddress?.emailAddress || ""}
                </div>
              </div>
            )}
          </div>
        </SignedIn>
        <SignedOut>
          <Link
            href="/sign-in"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${collapsed ? "justify-center" : ""}`}
            style={{ color: "#f8971f" }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
              <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span>Sign In</span>}
          </Link>
        </SignedOut>
      </div>
    </aside>
  );
}
