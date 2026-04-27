"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import TodaysJobs from "@/components/dashboard/TodaysJobs";
import DispatchBoard from "@/components/dashboard/DispatchBoard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import QuickActions from "@/components/dashboard/QuickActions";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────
type ProfitResp = {
  windowStats: {
    invoiceCount: number;
    revenue: number;
    cogs: number;
    billable: number;
    profit: number;
    margin: number | null;
    balance: number;
    unprofitableCount: number;
  };
};

type CustomerResp = {
  moneyBar: {
    totalDue: number;
    openInvoiceCount: number;
    overdueAmount: number;
    overdueCount: number;
    revenueYTD: number;
  };
};

type VendorResp = {
  moneyBar: {
    totalOwed: number;
    openBillCount: number;
    overdueAmount: number;
    overdueCount: number;
    openPOValue: number;
    openPOCount: number;
  };
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtMoneyShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return fmtMoney(n);
};
const fmtPct = (n: number | null) => n == null ? "—" : `${n.toFixed(1)}%`;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const todayLabel = () =>
  new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useUser();
  const rawName = user?.firstName || user?.fullName || "there";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  const [profit, setProfit] = useState<ProfitResp | null>(null);
  const [cust, setCust] = useState<CustomerResp | null>(null);
  const [vend, setVend] = useState<VendorResp | null>(null);

  useEffect(() => {
    const ytdSince = `${new Date().getFullYear()}-01-01`;
    Promise.all([
      fetch(`/api/reports/profit-by-job?since=${ytdSince}&limit=20`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/customers/center?filter=all`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/vendors?filter=all`).then((r) => r.ok ? r.json() : null),
    ]).then(([p, c, v]) => {
      if (p) setProfit(p);
      if (c) setCust(c);
      if (v) setVend(v);
    });
  }, []);

  const ws = profit?.windowStats;
  const cm = cust?.moneyBar;
  const vm = vend?.moneyBar;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-6 space-y-6">

            {/* Hero card — Forge & Flame palette: pure white card on warm cream page,
                subtle ember-glow gradient bleeding from the top-left. */}
            <div
              className="rounded-xl p-8 relative overflow-hidden"
              style={{
                background:
                  "radial-gradient(circle at 0% 0%, rgba(248,151,31,0.06) 0%, rgba(248,151,31,0) 40%), var(--color-surface-1)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--color-ff-taupe)" }}>
                    {todayLabel()}
                  </p>
                  <h1
                    className="mt-2"
                    style={{
                      fontSize: "2.25rem",
                      lineHeight: 1.1,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: "var(--color-ff-charcoal)",
                    }}
                  >
                    {greeting()}, {displayName}.
                  </h1>
                  <p className="text-base mt-3 max-w-xl" style={{ color: "var(--color-text-secondary)" }}>
                    Your year-to-date pulse — revenue, profit, what&apos;s owed to you, and what you owe.
                  </p>
                </div>
                <QuickActions />
              </div>
            </div>

            {/* Premium KPI grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Revenue YTD"
                value={ws ? fmtMoneyShort(ws.revenue) : "—"}
                sublabel={ws ? `${ws.invoiceCount.toLocaleString()} invoices` : ""}
                accent="#4f7d3a"
                href="/reports/profit-by-job?preset=ytd"
              />
              <KpiCard
                label="Profit YTD"
                value={ws ? fmtMoneyShort(ws.profit) : "—"}
                sublabel={ws?.margin != null ? `${ws.margin.toFixed(1)}% margin` : ""}
                accent={ws && ws.profit < 0 ? "#c44545" : "#f8971f"}
                href="/reports/profit-by-job?preset=ytd"
              />
              <KpiCard
                label="Owed to you"
                value={cm ? fmtMoneyShort(cm.totalDue) : "—"}
                sublabel={cm ? `${cm.openInvoiceCount} open · ${cm.overdueCount} overdue` : ""}
                accent="#eaa23f"
                tone={cm && cm.overdueCount > 0 ? "warn" : undefined}
                href="/reports/ar-aging"
              />
              <KpiCard
                label="You owe"
                value={vm ? fmtMoneyShort(vm.totalOwed) : "—"}
                sublabel={vm ? `${vm.openBillCount} open · ${vm.overdueCount} overdue` : ""}
                accent="#332e2d"
                tone={vm && vm.overdueCount > 0 ? "danger" : undefined}
                href="/vendors"
              />
            </div>

            {/* Operations row: today's jobs + recent activity */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2">
                <TodaysJobs />
              </div>
              <div className="xl:col-span-1">
                <RecentActivity />
              </div>
            </div>

            {/* Dispatch */}
            <DispatchBoard />

            {/* Footer attribution */}
            <p className="text-[11px] text-center pt-4" style={{ color: "var(--color-text-muted)" }}>
              HearthOS · Heritage meets modern field service.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// KPI card
// ───────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sublabel, accent, tone, href }: { label: string; value: string; sublabel?: string; accent: string; tone?: "warn" | "danger"; href?: string }) {
  const Tag: any = href ? Link : "div";
  const props: any = href ? { href } : {};
  const accentColor = tone === "danger" ? "#c44545" : tone === "warn" ? "#eaa23f" : accent;
  return (
    <Tag
      {...props}
      className={`p-5 rounded-xl block relative transition-all ${href ? "hover:-translate-y-[1px]" : ""}`}
      style={{
        background: "var(--color-surface-1)",
        border: "1px solid var(--color-border)",
        borderTop: `3px solid ${accentColor}`,
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: "var(--color-ff-taupe)" }}>{label}</p>
      <p
        className="mt-3"
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.025em",
          color: accentColor,
        }}
      >
        {value}
      </p>
      {sublabel && <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>{sublabel}</p>}
    </Tag>
  );
}
