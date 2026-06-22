"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
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
  Flame,
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
import FlameLogo from "@/components/FlameLogo";

const emptySubscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

const navGroups = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/", icon: Gauge },
      { label: "To-Do List", href: "/todos", icon: ClipboardCheck },
      { label: "Schedule", href: "/schedule", icon: CalendarDays },
      { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
      { label: "Customers", href: "/customers", icon: Users },
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
      { label: "GABE", href: "/gabe", icon: Sparkles },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Team", href: "/team", icon: UserRoundCog },
      { label: "GABE Audit", href: "/admin/gabe-audit", icon: ClipboardCheck },
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
  const { user } = useUser();
  const hydrated = useHydrated();

  return (
    <>
    <aside
      className={`${collapsed ? "w-[76px]" : "w-[252px]"} relative m-4 mr-0 hidden shrink-0 flex-col overflow-hidden rounded-[1.75rem] transition-all duration-200 lg:flex`}
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.82), rgba(255,255,255,0.52))",
        border: "1px solid rgba(255,255,255,0.82)",
        boxShadow: "var(--shadow-glow)",
        backdropFilter: "blur(30px) saturate(1.55)",
        WebkitBackdropFilter: "blur(30px) saturate(1.55)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),transparent_32%),radial-gradient(circle_at_8%_18%,rgba(255,106,0,0.16),transparent_22%)]" />

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
            background: "rgba(255,255,255,0.58)",
            border: "1px solid rgba(255,255,255,0.78)",
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
              {group.items.map((item) => {
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
        <SignedIn>
          <div
            className={`flex items-center gap-3 rounded-2xl p-2.5 ${collapsed ? "justify-center" : ""}`}
            style={{
              background: "rgba(255,255,255,0.62)",
              border: "1px solid rgba(255,255,255,0.76)",
            }}
          >
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={user.fullName || "User"}
                width={38}
                height={38}
                className="h-9 w-9 shrink-0 rounded-full"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-sm font-bold text-white">
                {user?.firstName?.[0] || "U"}
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {user?.fullName || "User"}
                </div>
                <div className="truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  {user?.primaryEmailAddress?.emailAddress || "Owner"}
                </div>
              </div>
            )}
          </div>
        </SignedIn>
        <SignedOut>
          <Link
            href="/sign-in"
            className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-[13px] font-semibold ${collapsed ? "justify-center" : ""}`}
            style={{ color: "var(--color-ember)", background: "rgba(255,255,255,0.62)" }}
          >
            <Flame size={16} />
            {!collapsed && <span>Sign In</span>}
          </Link>
        </SignedOut>
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
