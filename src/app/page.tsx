"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Flame,
  Gauge,
  MapPinned,
  Navigation,
  Radio,
  ReceiptText,
  Route,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { LiquidPanel, StatusPill } from "@/components/ui/liquid";

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

type CustomerCenterItem = {
  id: string;
  displayName: string;
  balance: number;
  openInvoiceCount: number;
  totalRevenue: number;
  lastActivity: string | null;
};

type CustomerResp = {
  items: CustomerCenterItem[];
  moneyBar: {
    totalDue: number;
    openInvoiceCount: number;
    overdueAmount: number;
    overdueCount: number;
    revenueYTD: number;
    ytdInvoiceCount: number;
  };
};

type VendorResp = {
  totals?: {
    vendors: number;
    balance: number;
    openBills: number;
    openPOs: number;
  };
  moneyBar: {
    totalOwed: number;
    openBillCount: number;
    overdueAmount: number;
    overdueCount: number;
    openPOValue: number;
    openPOCount: number;
    ytdSpend?: number;
    ytdBillCount?: number;
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

type DashboardResp = {
  stats: {
    totalCustomers: number;
    totalOutstanding: number;
    totalOverdue: number;
    paidThisMonth: number;
    totalRevenue: number;
    totalInvoices: number;
    jobsToday: number;
    jobsCompletedToday: number;
    jobsRemainingToday: number;
    activeTechs: number;
    totalTechs: number;
  };
};

type Job = {
  id: string;
  jobNumber: string;
  title: string;
  customerName: string;
  propertyAddress: string;
  jobType: string;
  status: string;
  priority: string;
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  assignedTechs: Array<{ id: string; name: string; color: string }>;
  totalAmount: number;
};

type Activity = {
  id: string;
  type: "payment" | "invoice" | "estimate" | "bill" | "po";
  title: string;
  description: string;
  actor: string | null;
  amount: number | null;
  at: string;
  href: string;
  status: string | null;
};

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtMoneyShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return fmtMoney(n);
};

const todayIso = () => new Date().toISOString().split("T")[0];

function relativeDate(value: string | null | undefined) {
  if (!value) return "No activity";
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.round(diff / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function DashboardPage() {
  const [profit, setProfit] = useState<ProfitResp | null>(null);
  const [cust, setCust] = useState<CustomerResp | null>(null);
  const [vend, setVend] = useState<VendorResp | null>(null);
  const [dispatch, setDispatch] = useState<DispatchResp | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResp | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    const ytdSince = `${new Date().getFullYear()}-01-01`;
    const today = todayIso();

    Promise.all([
      fetch(`/api/reports/profit-by-job?since=${ytdSince}&limit=20`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/customers/center?filter=all&sort=balance&dir=desc", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/vendors?filter=all", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/dispatch?activeOnly=true", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/dashboard", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/jobs?date=${today}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/dashboard/activity?limit=8", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([p, c, v, d, dash, todayJobs, activityData]) => {
      if (p) setProfit(p);
      if (c) setCust(c);
      if (v) setVend(v);
      if (d) setDispatch(d);
      if (dash) setDashboard(dash);
      if (Array.isArray(todayJobs)) setJobs(todayJobs);
      if (activityData?.activity) setActivity(activityData.activity);
    });
  }, []);

  const ws = profit?.windowStats;
  const cm = cust?.moneyBar;
  const vm = vend?.moneyBar;
  const stats = dashboard?.stats;
  const customerItems = cust?.items || [];
  const atRisk = customerItems.filter((item) => item.balance > 0).slice(0, 3);
  const topRevenue = [...customerItems].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 4);

  return (
    <div className="app-chrome flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex w-full min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-3 pb-28 lg:px-5 lg:pb-6">
          <div className="mx-auto w-full min-w-0 max-w-[1720px] space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1">
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-muted)" }}>
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </p>
                <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight md:text-[2.35rem]">
                  Good morning, Jim.
                </h1>
              </div>
              <Link href="/jobs/new" className="ui-btn-primary hidden shrink-0 items-center gap-2 px-4 py-3 text-sm sm:inline-flex">
                <Flame size={17} />
                Quick Add
              </Link>
            </div>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
              <MetricTile
                label="Revenue YTD"
                value={ws ? fmtMoneyShort(ws.revenue) : "-"}
                sublabel={ws ? `${ws.invoiceCount.toLocaleString()} invoices` : "Loading"}
                accent="#12b76a"
                icon={<TrendingUp size={18} />}
                href="/reports/profit-by-job?preset=ytd"
                series={[18, 24, 27, 34, 33, 41, 48, 55]}
              />
              <MetricTile
                label="Profit YTD"
                value={ws ? fmtMoneyShort(ws.profit) : "-"}
                sublabel={ws?.margin != null ? `${ws.margin.toFixed(1)}% margin` : "Margin pending"}
                accent="#2563eb"
                icon={<CircleDollarSign size={18} />}
                href="/reports/profit-by-job?preset=ytd"
                series={[14, 18, 21, 20, 31, 33, 37, 42]}
              />
              <MetricTile
                label="Owed To You"
                value={cm ? fmtMoneyShort(cm.totalDue) : "-"}
                sublabel={cm ? `${cm.openInvoiceCount} open - ${cm.overdueCount} overdue` : "Loading"}
                accent="#8b5cf6"
                icon={<Users size={18} />}
                href="/reports/ar-aging"
                series={[45, 42, 39, 48, 44, 51, 57, 52]}
              />
              <MetricTile
                label="You Owe"
                value={vm ? fmtMoneyShort(vm.totalOwed) : "-"}
                sublabel={vm ? `${vm.openBillCount} open - ${vm.overdueCount} overdue` : "Loading"}
                accent="#ef4444"
                icon={<Banknote size={18} />}
                href="/vendors"
                series={[33, 28, 36, 31, 42, 39, 34, 30]}
              />
              <MetricTile
                label="Active Techs"
                value={String(dispatch?.stats?.activeTechs ?? stats?.activeTechs ?? "-")}
                sublabel={`${dispatch?.stats?.onJob ?? 0} on job`}
                accent="var(--color-ember)"
                icon={<Radio size={18} />}
                href="/dispatch"
                series={[22, 26, 24, 29, 35, 33, 38, 40]}
              />
              <MetricTile
                label="Schedule Confidence"
                value={scheduleConfidence(jobs, dispatch)}
                sublabel={`${jobs.length || stats?.jobsToday || 0} jobs today`}
                accent="#0ea5e9"
                icon={<Gauge size={18} />}
                href="/schedule"
                series={[38, 39, 41, 43, 48, 46, 52, 58]}
              />
            </section>

            <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[0.84fr_1.52fr_0.84fr]">
              <div className="grid content-start gap-4">
                <CustomerHealth customer={cust} />
                <AtRiskAccounts accounts={atRisk} />
                <CollectionsPanel customer={cust} vendor={vend} />
              </div>

              <div className="grid content-start gap-4">
                <FieldMap dispatch={dispatch} jobs={jobs} />
                <TodaySchedule jobs={jobs} />
              </div>

              <div className="grid content-start gap-4">
                <Recommendations customer={cust} vendor={vend} dispatch={dispatch} jobs={jobs} />
                <JobsByStatus jobs={jobs} />
                <ActivityRail activity={activity} />
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <RevenueOverview profit={profit} topRevenue={topRevenue} />
              <CommandDock />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function scheduleConfidence(jobs: Job[], dispatch: DispatchResp | null) {
  const total = jobs.length;
  if (!total) return "100%";
  const assigned = jobs.filter((job) => job.assignedTechs?.length).length;
  const techPressure = dispatch?.stats?.unassigned ? Math.min(18, dispatch.stats.unassigned * 3) : 0;
  return `${Math.max(62, Math.round((assigned / total) * 100) - techPressure)}%`;
}

function MetricTile({
  label,
  value,
  sublabel,
  accent,
  icon,
  href,
  series,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: string;
  icon: ReactNode;
  href: string;
  series: number[];
}) {
  const content = (
    <LiquidPanel className="liquid-metric min-h-[164px] p-4" strong>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-text-muted)" }}>
            {label}
          </p>
          <p className="mono-number mt-3 text-[1.75rem] font-semibold leading-none" style={{ color: accent }}>
            {value}
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {sublabel}
          </p>
        </div>
        <span className="glass-icon" style={{ color: accent }}>
          {icon}
        </span>
      </div>
      <Sparkline series={series} color={accent} />
    </LiquidPanel>
  );

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const points = series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * 126 + 2;
      const y = 45 - ((value - min) / Math.max(1, max - min)) * 34;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="mt-4 h-12 w-full overflow-visible" viewBox="0 0 130 52" role="img" aria-label="Trend">
      <defs>
        <linearGradient id={`spark-${labelSafe(color)}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0.08" />
          <stop offset="1" stopColor={color} stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke={`url(#spark-${labelSafe(color)})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {series.slice(-3).map((value, index) => {
        const sourceIndex = series.length - 3 + index;
        const x = (sourceIndex / (series.length - 1)) * 126 + 2;
        const y = 45 - ((value - min) / Math.max(1, max - min)) * 34;
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="2.3" fill={color} opacity="0.86" />;
      })}
    </svg>
  );
}

function labelSafe(input: string) {
  return input.replace(/[^a-z0-9]/gi, "");
}

function CustomerHealth({ customer }: { customer: CustomerResp | null }) {
  const total = customer?.items.length || 0;
  const overdue = customer?.moneyBar.overdueCount || 0;
  const healthy = Math.max(0, total - overdue);
  const pct = total ? Math.round((healthy / total) * 100) : 100;

  return (
    <LiquidPanel className="p-5" strong>
      <PanelTitle icon={<Users size={17} />} title="Customer Health" href="/customers" />
      <div className="mt-5 flex items-center gap-5">
        <Donut value={pct} accent="var(--color-ember)" label={`${pct}%`} />
        <div className="min-w-0 flex-1 space-y-3">
          <BarRow label="Healthy accounts" value={healthy} max={Math.max(total, 1)} color="#12b76a" />
          <BarRow label="Overdue accounts" value={overdue} max={Math.max(total, 1)} color="var(--color-ember)" />
          <BarRow label="Open invoices" value={customer?.moneyBar.openInvoiceCount || 0} max={Math.max(customer?.moneyBar.openInvoiceCount || 1, total)} color="#2563eb" />
        </div>
      </div>
    </LiquidPanel>
  );
}

function AtRiskAccounts({ accounts }: { accounts: CustomerCenterItem[] }) {
  return (
    <LiquidPanel className="p-5">
      <PanelTitle icon={<ReceiptText size={17} />} title="At-Risk Accounts" href="/customers?filter=with_balance" />
      <div className="mt-4 space-y-2">
        {accounts.length ? accounts.map((account) => (
          <Link key={account.id} href={`/customers/${account.id}`} className="glass-row">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{account.displayName}</span>
              <span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>{relativeDate(account.lastActivity)}</span>
            </span>
            <span className="mono-number text-sm font-semibold" style={{ color: "var(--color-ember)" }}>
              {fmtMoneyShort(account.balance)}
            </span>
          </Link>
        )) : (
          <EmptyLine label="No open-balance customer risk." />
        )}
      </div>
    </LiquidPanel>
  );
}

function CollectionsPanel({ customer, vendor }: { customer: CustomerResp | null; vendor: VendorResp | null }) {
  const ar = customer?.moneyBar.totalDue || 0;
  const ap = vendor?.moneyBar.totalOwed || 0;
  const max = Math.max(ar, ap, 1);

  return (
    <LiquidPanel className="p-5">
      <PanelTitle icon={<WalletCards size={17} />} title="Cash Exposure" href="/reports/ar-aging" />
      <div className="mt-4 space-y-4">
        <BarRow label="Receivables" value={ar} max={max} color="#8b5cf6" money />
        <BarRow label="Payables" value={ap} max={max} color="#ef4444" money />
        <BarRow label="Open PO value" value={vendor?.moneyBar.openPOValue || 0} max={Math.max(vendor?.moneyBar.openPOValue || 0, max)} color="var(--color-ember)" money />
      </div>
    </LiquidPanel>
  );
}

function FieldMap({ dispatch, jobs }: { dispatch: DispatchResp | null; jobs: Job[] }) {
  const techs = dispatch?.techs || [];
  const markers = buildMapMarkers(techs);

  const selected = techs.find((tech) => tech.currentJob) || techs[0];

  return (
    <LiquidPanel className="p-5" strong>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelTitle icon={<MapPinned size={17} />} title="Field Operations" href="/dispatch" />
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Dispatch map, route load, GPS status, and today&apos;s active work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="success">{dispatch?.stats?.activeTechs ?? 0} active</StatusPill>
          <StatusPill tone={(dispatch?.stats?.unassigned ?? 0) ? "warning" : "neutral"}>{dispatch?.stats?.unassigned ?? 0} unassigned</StatusPill>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="liquid-map-stage relative min-h-[430px] overflow-hidden rounded-[1.55rem] border border-white/80">
          <div className="map-label left-[14%] top-[16%]">Springfield</div>
          <div className="map-label right-[14%] top-[24%]">Rogersville</div>
          <div className="map-label bottom-[18%] left-[22%]">Ozark</div>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 520" preserveAspectRatio="none" aria-hidden="true">
            <path d="M60 370 C 190 270, 250 315, 360 210 S 560 140, 740 220" className="map-road map-road-orange" />
            <path d="M90 150 C 240 220, 315 190, 420 310 S 610 430, 750 330" className="map-road map-road-blue" />
            <path d="M210 30 C 255 160, 250 260, 315 500" className="map-road map-road-muted" />
            <path d="M520 20 C 500 140, 548 248, 500 515" className="map-road map-road-muted" />
          </svg>

          {markers.map(({ tech, x, y, index, live }) => (
            <Link
              key={tech.id}
              href="/dispatch"
              className="map-marker"
              style={{ left: `${x}%`, top: `${y}%`, "--marker": tech.color || (index % 2 ? "#2563eb" : "var(--color-ember)") } as CSSProperties}
            >
              <span>{(tech.initials || initials(tech.name) || "T").slice(0, 2)}</span>
              <em>{live ? "LIVE" : tech.status || "ready"}</em>
            </Link>
          ))}

          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-2">
            <span className="map-glass-chip"><Navigation size={14} /> {jobs.length} jobs today</span>
            <span className="map-glass-chip"><Radio size={14} /> {markers.filter((m) => m.live).length} live GPS</span>
            <span className="map-glass-chip"><Route size={14} /> Route load synced</span>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="glass-nested p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} style={{ color: "var(--color-ember)" }} />
              Current Focus
            </div>
            {selected ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-base font-semibold">{selected.name}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {selected.status || "available"} - {selected.jobsDone}/{selected.jobsToday} complete
                  </p>
                </div>
                <MiniJob label="Now" job={selected.currentJob} />
                <MiniJob label="Next" job={selected.nextJob} />
              </div>
            ) : (
              <EmptyLine label="No active techs loaded." />
            )}
          </div>

          <div className="glass-nested p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock size={16} style={{ color: "var(--color-ember)" }} />
              Dispatch Queue
            </div>
            <div className="mt-3 space-y-2">
              {(dispatch?.unassignedJobs || []).slice(0, 3).map((job) => (
                <Link key={job.id} href="/dispatch" className="queue-row">
                  <span className="truncate text-sm font-semibold">{job.title}</span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{job.scheduledTime}</span>
                </Link>
              ))}
              {!(dispatch?.unassignedJobs || []).length && <EmptyLine label="No jobs waiting for assignment." />}
            </div>
          </div>
        </div>
      </div>
    </LiquidPanel>
  );
}

function buildMapMarkers(techs: DispatchTech[]) {
  const live = techs.filter((tech) => tech.location);
  if (live.length) {
    const lats = live.map((tech) => tech.location!.lat);
    const lngs = live.map((tech) => tech.location!.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return live.slice(0, 8).map((tech, index) => ({
      tech,
      index,
      x: 14 + ((tech.location!.lng - minLng) / Math.max(0.01, maxLng - minLng)) * 72,
      y: 18 + (1 - (tech.location!.lat - minLat) / Math.max(0.01, maxLat - minLat)) * 62,
      live: true,
    }));
  }

  return techs.slice(0, 8).map((tech, index) => ({
    tech,
    index,
    x: [18, 38, 64, 78, 52, 28, 70, 44][index] || 50,
    y: [30, 19, 28, 52, 66, 72, 76, 45][index] || 50,
    live: false,
  }));
}

function TodaySchedule({ jobs }: { jobs: Job[] }) {
  return (
    <LiquidPanel className="p-5">
      <PanelTitle icon={<CalendarClock size={17} />} title="Today's Schedule" href="/schedule" />
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {jobs.slice(0, 6).map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`} className="schedule-card">
            <span className="mono-number text-xs font-semibold" style={{ color: "var(--color-ember)" }}>
              {job.scheduledTimeStart}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{job.title}</span>
              <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>{job.customerName}</span>
            </span>
            <span className="status-dot" style={{ background: statusColor(job.status) }} />
          </Link>
        ))}
        {!jobs.length && <EmptyLine label="No jobs are scheduled for today." />}
      </div>
    </LiquidPanel>
  );
}

function Recommendations({
  customer,
  vendor,
  dispatch,
  jobs,
}: {
  customer: CustomerResp | null;
  vendor: VendorResp | null;
  dispatch: DispatchResp | null;
  jobs: Job[];
}) {
  const recs = [
    customer?.moneyBar.overdueCount
      ? `${customer.moneyBar.overdueCount} overdue customer accounts need follow-up`
      : "Receivables have no overdue customer count",
    dispatch?.stats?.unassigned
      ? `${dispatch.stats.unassigned} scheduled jobs are waiting for assignment`
      : "Dispatch queue is fully assigned",
    vendor?.moneyBar.overdueCount
      ? `${vendor.moneyBar.overdueCount} vendor bills are overdue`
      : `${jobs.length} jobs are visible in today's operating plan`,
  ];

  return (
    <LiquidPanel className="p-5" strong>
      <PanelTitle icon={<Bot size={17} />} title="AI Recommendations" href="/gabe" />
      <div className="mt-4 space-y-3">
        {recs.map((rec, index) => (
          <div key={rec} className="recommendation-row">
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl text-xs font-bold text-white" style={{ background: index === 0 ? "var(--color-ember)" : "#2563eb" }}>
              {index + 1}
            </span>
            <p className="text-sm font-medium">{rec}</p>
          </div>
        ))}
      </div>
    </LiquidPanel>
  );
}

function JobsByStatus({ jobs }: { jobs: Job[] }) {
  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  const total = Math.max(1, jobs.length);
  const complete = Math.round(((counts.completed || 0) / total) * 100);

  return (
    <LiquidPanel className="p-5">
      <PanelTitle icon={<CheckCircle2 size={17} />} title="Jobs By Status" href="/jobs" />
      <div className="mt-5 flex items-center gap-5">
        <Donut value={complete} accent="#2563eb" label={`${complete}%`} />
        <div className="min-w-0 flex-1 space-y-3">
          {Object.entries({ scheduled: counts.scheduled || 0, in_progress: counts.in_progress || 0, completed: counts.completed || 0 }).map(([label, value]) => (
            <BarRow key={label} label={label.replace("_", " ")} value={value} max={total} color={statusColor(label)} />
          ))}
        </div>
      </div>
    </LiquidPanel>
  );
}

function ActivityRail({ activity }: { activity: Activity[] }) {
  return (
    <LiquidPanel className="p-5">
      <PanelTitle icon={<ReceiptText size={17} />} title="Recent Activity" href="/reports" />
      <div className="mt-4 space-y-2">
        {activity.slice(0, 5).map((item) => (
          <Link key={item.id} href={item.href} className="activity-row">
            <span className="activity-dot" style={{ background: activityColor(item.type) }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{item.title}</span>
              <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                {item.actor || "HearthOS"} - {relativeDate(item.at)}
              </span>
            </span>
            {item.amount != null && <span className="mono-number text-xs font-semibold">{fmtMoneyShort(item.amount)}</span>}
          </Link>
        ))}
        {!activity.length && <EmptyLine label="No recent synced activity loaded." />}
      </div>
    </LiquidPanel>
  );
}

function RevenueOverview({ profit, topRevenue }: { profit: ProfitResp | null; topRevenue: CustomerCenterItem[] }) {
  const ws = profit?.windowStats;
  return (
    <LiquidPanel className="p-5" strong>
      <PanelTitle icon={<TrendingUp size={17} />} title="Revenue Overview" href="/reports" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="revenue-chart">
          <svg viewBox="0 0 760 240" className="h-full w-full" preserveAspectRatio="none" aria-label="Revenue overview chart">
            <path d="M20 210 C120 170 130 120 230 132 S370 80 470 94 590 52 740 32" fill="none" stroke="var(--color-ember)" strokeWidth="5" strokeLinecap="round" />
            <path d="M20 222 C140 196 170 176 260 170 S390 142 470 150 610 122 740 104" fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />
            {[60, 180, 300, 420, 540, 660].map((x) => (
              <line key={x} x1={x} x2={x} y1="20" y2="224" stroke="rgba(71,85,105,0.08)" />
            ))}
          </svg>
          <div className="absolute left-5 top-5">
            <p className="mono-number text-2xl font-semibold">{ws ? fmtMoney(ws.revenue) : "-"}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Year-to-date revenue</p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Top Customers By Revenue</p>
          {topRevenue.map((customer, index) => (
            <Link key={customer.id} href={`/customers/${customer.id}`} className="glass-row">
              <span className="rank-badge">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{customer.displayName}</span>
              <span className="mono-number text-sm">{fmtMoneyShort(customer.totalRevenue)}</span>
            </Link>
          ))}
          {!topRevenue.length && <EmptyLine label="No customer revenue rows loaded." />}
        </div>
      </div>
    </LiquidPanel>
  );
}

function CommandDock() {
  return (
    <LiquidPanel className="bottom-copilot p-5" strong>
      <PanelTitle icon={<Sparkles size={17} />} title="GABE Command Dock" href="/gabe" />
      <div className="mt-5 rounded-[1.35rem] border border-white/80 bg-white/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="flex items-center gap-3">
          <Search size={18} style={{ color: "var(--color-ember)" }} />
          <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Ask about jobs, customers, invoices, QuickBooks, or route risk...
          </span>
          <Link href="/gabe" className="ui-btn-primary px-4 py-2 text-sm">Open</Link>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["Collections", "Dispatch gaps", "Profit leaks", "Customer risk"].map((label) => (
          <Link key={label} href="/gabe" className="glass-chip">{label}</Link>
        ))}
      </div>
    </LiquidPanel>
  );
}

function MiniJob({ label, job }: { label: string; job?: { title: string; customer: string; scheduledTime?: string } | null }) {
  return (
    <div className="rounded-2xl bg-white/58 p-3" style={{ border: "1px solid rgba(255,255,255,0.76)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      {job ? (
        <>
          <p className="mt-1 truncate text-sm font-semibold">{job.scheduledTime ? `${job.scheduledTime} - ` : ""}{job.title}</p>
          <p className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>{job.customer}</p>
        </>
      ) : (
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>No active job.</p>
      )}
    </div>
  );
}

function PanelTitle({ icon, title, href }: { icon: ReactNode; title: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span style={{ color: "var(--color-ember)" }}>{icon}</span>
        <h2 className="truncate text-base font-semibold">{title}</h2>
      </div>
      <Link href={href} className="text-xs font-semibold" style={{ color: "var(--color-ember)" }}>
        View <ArrowUpRight className="inline" size={13} />
      </Link>
    </div>
  );
}

function Donut({ value, accent, label }: { value: number; accent: string; label: string }) {
  return (
    <div className="donut-ring" style={{ "--pct": `${Math.min(100, Math.max(0, value))}%`, "--ring": accent } as CSSProperties}>
      <span className="mono-number">{label}</span>
    </div>
  );
}

function BarRow({ label, value, max, color, money }: { label: string; value: number; max: number; color: string; money?: boolean }) {
  const width = `${Math.min(100, Math.max(3, (value / Math.max(max, 1)) * 100))}%`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="capitalize" style={{ color: "var(--color-text-muted)" }}>{label}</span>
        <span className="mono-number font-semibold">{money ? fmtMoneyShort(value) : value.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200/60">
        <div className="h-full rounded-full" style={{ width, background: color }} />
      </div>
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300/50 bg-white/36 p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
      {label}
    </div>
  );
}

function statusColor(status: string) {
  if (status === "completed") return "#12b76a";
  if (status === "in_progress" || status === "on_job") return "#2563eb";
  if (status === "cancelled") return "#ef4444";
  return "var(--color-ember)";
}

function activityColor(type: Activity["type"]) {
  if (type === "payment") return "#12b76a";
  if (type === "invoice") return "#2563eb";
  if (type === "bill") return "#ef4444";
  return "var(--color-ember)";
}
