"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gauge,
  MapPinned,
  NotebookTabs,
  PackageCheck,
  PlugZap,
  Receipt,
  Settings,
  Sparkles,
  Users,
  UserRoundCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import FlameLogo from "@/components/FlameLogo";
import type { OrganizationFeature } from "@/lib/tenant/features";
import { useOrganizationFeatures } from "@/lib/tenant/use-organization-features";

const emptySubscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  feature?: OrganizationFeature;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/", icon: Gauge },
      { label: "To-Do List", href: "/todos", icon: ClipboardCheck },
      { label: "Schedule", href: "/schedule", icon: CalendarDays },
      { label: "Meeks Portal", href: "/meeks", icon: CalendarDays, feature: "meeksPortal" },
      { label: "Projects", href: "/projects", icon: PackageCheck },
      { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Service Map", href: "/service-map", icon: MapPinned },
      { label: "Dispatch Map", href: "/dispatch", icon: MapPinned },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Invoices", href: "/invoices", icon: Receipt },
      { label: "Payments", href: "/payments", icon: CreditCard },
      { label: "Estimates", href: "/estimates", icon: FileText },
      { label: "Purchase Orders", href: "/purchase-orders", icon: PackageCheck },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Inventory", href: "/inventory", icon: Boxes },
      { label: "Vendors", href: "/vendors", icon: NotebookTabs },
      { label: "Banking", href: "/banking", icon: Banknote },
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "GABE", href: "/gabe", icon: Sparkles, feature: "gabe" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Team", href: "/team", icon: UserRoundCog },
      { label: "GABE Audit", href: "/admin/gabe-audit", icon: ClipboardCheck, feature: "gabeAudit" },
      { label: "Time Admin", href: "/admin/time", icon: CalendarDays },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const hydrated = useHydrated();
  const features = useOrganizationFeatures();

  return (
    <>
    <aside
	      className={`${collapsed ? "w-[76px]" : "w-[228px]"} liquid-rail glass-shell relative m-3 mr-0 hidden shrink-0 flex-col overflow-hidden rounded-[1.9rem] transition-all duration-200 lg:flex`}
	      style={{
	        background: "linear-gradient(160deg, rgba(255,255,255,0.96), rgba(247,250,255,0.78))",
	        border: "1px solid rgba(255,255,255,0.98)",
	        boxShadow: "0 28px 70px rgba(39,55,82,0.12), inset 0 1px 0 rgba(255,255,255,1)",
	        backdropFilter: "blur(26px) saturate(1.14)",
	        WebkitBackdropFilter: "blur(26px) saturate(1.14)",
	      }}
	    >
	      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.74),transparent_34%),radial-gradient(circle_at_8%_18%,rgba(255,106,0,0.08),transparent_22%)]" />

      <div className="relative flex shrink-0 items-center gap-3 px-4 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_rgba(255,106,0,0.18)]">
          <FlameLogo size={31} />
        </div>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-tight" style={{ color: "var(--color-text-primary)" }}>
              HearthOS
            </div>
            <div className="text-[11px] leading-tight" style={{ color: "var(--color-text-muted)" }}>
              Field Service
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
	          style={{
	            color: "var(--color-text-muted)",
	            background: "rgba(255,255,255,0.76)",
	            border: "1px solid rgba(15,23,42,0.06)",
	          }}
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3 pb-3 scrollbar-hide">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <div
                className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.items.filter((item) => !item.feature || features[item.feature]).map((item) => {
                const active = hydrated && isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${collapsed ? "justify-center" : ""}`}
                    style={{
                      color: "var(--color-ember)",
                      fontWeight: active ? 680 : 560,
                      background: active
                        ? "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,255,255,0.64))"
                        : "transparent",
                      border: active ? "1px solid rgba(255,255,255,0.92)" : "1px solid transparent",
                      boxShadow: active
                        ? "0 14px 34px rgba(31,41,55,0.08), inset 3px 0 0 var(--color-ember)"
                        : "none",
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        color: active ? "#fff" : "var(--color-ember)",
                        background: active
                          ? "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))"
                          : "rgba(255,106,0,0.1)",
                        border: active ? "1px solid rgba(255,255,255,0.48)" : "1px solid rgba(255,106,0,0.18)",
                        boxShadow: active ? "0 10px 24px rgba(255,106,0,0.22)" : "none",
                      }}
                    >
                      <Icon size={16} strokeWidth={2.2} />
                    </span>
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mb-3">
          {!collapsed && (
            <div
              className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Integrations
            </div>
          )}
          <Link
            href="/integrations/quickbooks"
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${collapsed ? "justify-center" : ""}`}
            style={{
              color: "var(--color-qb)",
              background: hydrated && isActivePath(pathname, "/integrations/quickbooks") ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.32)",
              border: "1px solid rgba(255,255,255,0.68)",
            }}
            title={collapsed ? "QuickBooks" : undefined}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <PlugZap size={16} />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate font-semibold">QuickBooks</span>
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[9px] font-bold text-green-600">SYNC</span>
              </>
            )}
          </Link>
        </div>
      </nav>

      <div className="relative shrink-0 p-3">
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-2xl p-2.5 ${collapsed ? "justify-center" : ""}`}
          style={{
	            background: "rgba(255,255,255,0.62)",
	            border: "1px solid rgba(15,23,42,0.06)",
	            boxShadow: "0 12px 28px rgba(39,55,82,0.06), inset 0 1px 0 rgba(255,255,255,0.92)",
	          }}
        >
	          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-sm font-bold text-white">
	            CH
	          </div>
	          {!collapsed && (
	            <div className="min-w-0 flex-1">
	              <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
	                Colton
	              </div>
              <div className="truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                Owner
              </div>
            </div>
          )}
        </Link>
      </div>
    </aside>
    <MobileDock pathname={hydrated ? pathname : null} />
    </>
  );
}

function MobileDock({ pathname }: { pathname: string | null }) {
  const items = [
    { label: "Home", href: "/", icon: Gauge },
    { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
    { label: "Map", href: "/dispatch", icon: MapPinned },
    { label: "Money", href: "/invoices", icon: Receipt },
    { label: "Team", href: "/team", icon: UserRoundCog },
  ];

  return (
    <nav
      className="fixed bottom-3 left-3 right-3 z-40 flex items-center justify-between rounded-[1.4rem] p-1.5 lg:hidden"
      style={{
        background: "rgba(255,255,255,0.82)",
        border: "1px solid rgba(255,255,255,0.86)",
        boxShadow: "0 20px 60px rgba(31,41,55,0.18)",
        backdropFilter: "blur(28px) saturate(1.5)",
        WebkitBackdropFilter: "blur(28px) saturate(1.5)",
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-2 text-[10px] font-semibold"
            style={{
              color: active ? "#fff" : "var(--color-ember)",
              background: active ? "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))" : "transparent",
            }}
          >
            <Icon size={17} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
