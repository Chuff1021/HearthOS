"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ArrowUpRight, Banknote, BriefcaseBusiness, DollarSign, MapPinned, Radio, Route, TrendingUp, Users } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import TodaysJobs from "@/components/dashboard/TodaysJobs";
import DispatchBoard from "@/components/dashboard/DispatchBoard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import QuickActions from "@/components/dashboard/QuickActions";
import { LiquidPanel, MetricCard, StatusPill } from "@/components/ui/liquid";

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

type DispatchTech = {
  id: string;
  name: string;
  initials?: string;
  status?: string;
  color?: string;
  jobsToday: number;
  jobsDone: number;
  location?: { lat: number; lng: number; timestamp: string; accuracy?: number } | null;
  currentJob?: { id: string; title: string; customer: string; address?: string } | null;
  nextJob?: { id: string; title: string; customer: string; scheduledTime: string; address?: string } | null;
};

type DispatchResp = {
  techs: DispatchTech[];
  unassignedJobs?: Array<{ id: string; title: string; customer: string; scheduledTime: string; priority: string }>;
  stats?: {
    totalTechs: number;
    activeTechs: number;
    onJob: number;
    available: number;
    unassigned: number;
  };
};

const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtMoneyShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return fmtMoney(n);
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const todayLabel = () =>
  new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export default function DashboardPage() {
  const { user } = useUser();
  const rawName = user?.firstName || user?.fullName || "there";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  const [profit, setProfit] = useState<ProfitResp | null>(null);
  const [cust, setCust] = useState<CustomerResp | null>(null);
  const [vend, setVend] = useState<VendorResp | null>(null);
  const [dispatch, setDispatch] = useState<DispatchResp | null>(null);

  useEffect(() => {
    const ytdSince = `${new Date().getFullYear()}-01-01`;
    Promise.all([
      fetch(`/api/reports/profit-by-job?since=${ytdSince}&limit=20`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/customers/center?filter=all`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/vendors?filter=all`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/dispatch?activeOnly=true`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([p, c, v, d]) => {
      if (p) setProfit(p);
      if (c) setCust(c);
      if (v) setVend(v);
      if (d) setDispatch(d);
    });
  }, []);

  const ws = profit?.windowStats;
  const cm = cust?.moneyBar;
  const vm = vend?.moneyBar;

  return (
    <div className="app-chrome flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex w-full min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-3 pb-28 lg:px-5 lg:pb-6">
          <div className="mx-auto w-full min-w-0 max-w-[1680px] space-y-5">
            <LiquidPanel className="relative p-6" strong>
              <div className="glass-sheen pointer-events-none absolute -left-24 top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent blur-xl" />
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0 flex-1 basis-[320px] max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-muted)" }}>
                    {todayLabel()}
                  </p>
                  <h1 className="mt-3 text-[2rem] font-semibold leading-[1.04] md:text-[3rem]" style={{ color: "var(--color-text-primary)" }}>
                    {greeting()}, {displayName}.
                  </h1>
                  <p
                    className="mt-3 break-words text-sm md:text-base"
                    style={{ color: "var(--color-text-secondary)", maxWidth: "min(42rem, calc(100vw - 4.5rem))" }}
                  >
                    Live command center for revenue, dispatch, invoices, customers, and QuickBooks.
                  </p>
                </div>
                <QuickActions />
              </div>
            </LiquidPanel>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Revenue YTD"
                value={ws ? fmtMoneyShort(ws.revenue) : "-"}
                sublabel={ws ? `${ws.invoiceCount.toLocaleString()} invoices` : "Loading live report"}
                accent="#12b76a"
                href="/reports/profit-by-job?preset=ytd"
                icon={<TrendingUp size={20} />}
              />
              <MetricCard
                label="Profit YTD"
                value={ws ? fmtMoneyShort(ws.profit) : "-"}
                sublabel={ws?.margin != null ? `${ws.margin.toFixed(1)}% margin` : "Margin pending"}
                accent={ws && ws.profit < 0 ? "var(--color-danger)" : "#2563eb"}
                href="/reports/profit-by-job?preset=ytd"
                icon={<DollarSign size={20} />}
              />
              <MetricCard
                label="Owed to You"
                value={cm ? fmtMoneyShort(cm.totalDue) : "-"}
                sublabel={cm ? `${cm.openInvoiceCount} open · ${cm.overdueCount} overdue` : "Loading receivables"}
                accent="#7c3aed"
                href="/reports/ar-aging"
                icon={<Users size={20} />}
              />
              <MetricCard
                label="You Owe"
                value={vm ? fmtMoneyShort(vm.totalOwed) : "-"}
                sublabel={vm ? `${vm.openBillCount} open · ${vm.overdueCount} overdue` : "Loading payables"}
                accent={vm && vm.overdueCount > 0 ? "var(--color-danger)" : "var(--color-ember)"}
                href="/vendors"
                icon={<Banknote size={20} />}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.25fr_0.75fr]">
              <FieldOpsMapPanel dispatch={dispatch} />
              <RecentActivity />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <TodaysJobs />
              <OperationsPulse dispatch={dispatch} />
            </div>

            <DispatchBoard />
          </div>
        </main>
      </div>
    </div>
  );
}

function FieldOpsMapPanel({ dispatch }: { dispatch: DispatchResp | null }) {
  const techs = dispatch?.techs || [];
  const liveTechs = techs.filter((tech) => tech.location);
  const selected = liveTechs[0] || techs[0];
  const markers = useMemo(() => {
    if (liveTechs.length === 0) return [];
    const lats = liveTechs.map((tech) => tech.location!.lat);
    const lngs = liveTechs.map((tech) => tech.location!.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return liveTechs.slice(0, 9).map((tech, index) => {
      const latSpan = Math.max(maxLat - minLat, 0.01);
      const lngSpan = Math.max(maxLng - minLng, 0.01);
      return {
        tech,
        x: 12 + ((tech.location!.lng - minLng) / lngSpan) * 76,
        y: 16 + (1 - (tech.location!.lat - minLat) / latSpan) * 68,
        index,
      };
    });
  }, [liveTechs]);

  return (
    <LiquidPanel className="min-h-[520px] p-5" strong>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned size={18} style={{ color: "var(--color-ember)" }} />
            <h2 className="text-lg font-semibold">Field Ops Map</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Live GPS, route posture, and dispatch load from existing tech/job records.
          </p>
        </div>
        <Link href="/dispatch" className="ui-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
          Open dispatch <ArrowUpRight size={15} />
        </Link>
      </div>

      <div className="grid min-h-[420px] grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="liquid-map relative overflow-hidden rounded-[1.4rem] border border-white/80">
          <div className="absolute inset-5 rounded-[1.2rem] border border-white/70" />
          <div className="absolute left-[14%] top-[22%] h-px w-[72%] rotate-[-13deg] bg-orange-400/35" />
          <div className="absolute left-[20%] top-[68%] h-px w-[62%] rotate-[18deg] bg-blue-500/20" />
          <div className="absolute left-[42%] top-[10%] h-[78%] w-px rotate-[18deg] bg-slate-400/18" />

          {markers.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
              <div>
                <Radio className="mx-auto mb-3" size={28} style={{ color: "var(--color-ember)" }} />
                <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>No live GPS pings yet</p>
                <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--color-text-muted)" }}>
                  The map will populate as tech devices report locations through the current tech runtime.
                </p>
              </div>
            </div>
          ) : (
            markers.map(({ tech, x, y, index }) => (
              <Link
                key={tech.id}
                href="/dispatch"
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white/80 py-1 pl-1 pr-3 text-xs font-semibold shadow-lg backdrop-blur-xl"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  color: "var(--color-text-primary)",
                  border: "1px solid rgba(255,255,255,0.86)",
                }}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: tech.color || (index % 2 ? "#2563eb" : "var(--color-ember)") }}
                >
                  {(tech.initials || tech.name.split(" ").map((part) => part[0]).join("")).slice(0, 2).toUpperCase()}
                </span>
                {tech.name.split(" ")[0]}
              </Link>
            ))
          )}

          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-2">
            <StatusPill tone="success">{dispatch?.stats?.activeTechs ?? 0} active</StatusPill>
            <StatusPill tone="info">{dispatch?.stats?.onJob ?? 0} on job</StatusPill>
            <StatusPill tone={(dispatch?.stats?.unassigned ?? 0) > 0 ? "warning" : "neutral"}>
              {dispatch?.stats?.unassigned ?? 0} unassigned
            </StatusPill>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-3xl bg-white/54 p-4" style={{ border: "1px solid rgba(255,255,255,0.78)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Route size={16} style={{ color: "var(--color-ember)" }} />
              Current Focus
            </div>
            {selected ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {selected.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {selected.status || "available"} · {selected.jobsDone}/{selected.jobsToday} jobs complete
                  </p>
                </div>
                {selected.currentJob ? (
                  <div className="rounded-2xl bg-white/62 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>Now</p>
                    <p className="mt-1 text-sm font-semibold">{selected.currentJob.title}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{selected.currentJob.customer}</p>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No active job selected.</p>
                )}
                {selected.nextJob && (
                  <div className="rounded-2xl bg-white/62 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>Next</p>
                    <p className="mt-1 text-sm font-semibold">{selected.nextJob.scheduledTime} · {selected.nextJob.title}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{selected.nextJob.customer}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>Dispatch has no active tech records yet.</p>
            )}
          </div>

          <div className="rounded-3xl bg-white/54 p-4" style={{ border: "1px solid rgba(255,255,255,0.78)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BriefcaseBusiness size={16} style={{ color: "var(--color-ember)" }} />
              Waiting Assignment
            </div>
            <div className="mt-3 space-y-2">
              {(dispatch?.unassignedJobs || []).slice(0, 3).map((job) => (
                <Link key={job.id} href="/dispatch" className="block rounded-2xl bg-white/62 p-3">
                  <p className="truncate text-sm font-semibold">{job.title}</p>
                  <p className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {job.scheduledTime} · {job.customer}
                  </p>
                </Link>
              ))}
              {(dispatch?.unassignedJobs || []).length === 0 && (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No scheduled jobs waiting for assignment.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </LiquidPanel>
  );
}

function OperationsPulse({ dispatch }: { dispatch: DispatchResp | null }) {
  const stats = dispatch?.stats;
  const completionPct = stats?.totalTechs ? Math.round(((stats.totalTechs - (stats.available || 0)) / stats.totalTechs) * 100) : 0;

  return (
    <LiquidPanel className="h-full p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Operations Pulse</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Live dispatch capacity and work movement.</p>
        </div>
        <Radio size={20} style={{ color: "var(--color-ember)" }} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <PulseStat label="Active Techs" value={String(stats?.activeTechs ?? 0)} />
        <PulseStat label="On Job" value={String(stats?.onJob ?? 0)} />
        <PulseStat label="Available" value={String(stats?.available ?? 0)} />
        <PulseStat label="Unassigned" value={String(stats?.unassigned ?? 0)} accent={(stats?.unassigned ?? 0) > 0 ? "var(--color-ember)" : "var(--color-success)"} />
      </div>
      <div className="mt-5 rounded-3xl bg-white/54 p-4" style={{ border: "1px solid rgba(255,255,255,0.78)" }}>
        <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>
          <span>Field Utilization</span>
          <span className="mono-number">{completionPct}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200/70">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, completionPct))}%`,
              background: "linear-gradient(90deg, var(--color-ember), #2563eb)",
            }}
          />
        </div>
      </div>
    </LiquidPanel>
  );
}

function PulseStat({ label, value, accent = "var(--color-info)" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-3xl bg-white/54 p-4" style={{ border: "1px solid rgba(255,255,255,0.78)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="mono-number mt-3 text-3xl font-semibold leading-none" style={{ color: accent }}>{value}</p>
    </div>
  );
}
