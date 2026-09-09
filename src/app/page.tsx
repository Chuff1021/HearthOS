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
  Gauge,
  MapPinned,
  Plus,
  Radio,
  RefreshCw,
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
import OperationsLeafletMap from "@/components/dashboard/OperationsLeafletMap";
import { assignmentCoverage, QUICK_ADD_JOB_HREF } from "@/components/dashboard/dashboard-data";
import { useDashboardResource, type DashboardResource } from "@/components/dashboard/useDashboardResource";
import { useAuthenticatedDisplayIdentity } from "@/components/layout/header-identity";
import { localDateValue } from "@/components/job-form/job-form-helpers";
import { getLocationMarkers } from "@/components/dashboard/operations-map-data";
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

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function relativeDate(value: string | null | undefined) {
  if (!value) return "No activity";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "Date unavailable";
  const days = Math.max(0, Math.round(diff / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export default function DashboardPage() {
  const [now, setNow] = useState(() => new Date());
  const queryDate = localDateValue(now);
  const profitSource = useDashboardResource<ProfitResp>("profit", `/api/reports/profit-by-job?since=${queryDate.slice(0, 4)}-01-01&limit=20`);
  const customerSource = useDashboardResource<CustomerResp>("customers", "/api/customers/center?filter=all&sort=balance&dir=desc");
  const vendorSource = useDashboardResource<VendorResp>("vendors", "/api/vendors?filter=all");
  const dispatchSource = useDashboardResource<DispatchResp>("dispatch", "/api/dispatch?activeOnly=true");
  const jobsSource = useDashboardResource<Job[]>("jobs", `/api/jobs?date=${queryDate}`);
  const activitySource = useDashboardResource<Activity[]>("activity", "/api/dashboard/activity?limit=8");
  const { data: profit } = profitSource;
  const { data: cust } = customerSource;
  const { data: vend } = vendorSource;
  const { data: dispatch } = dispatchSource;
  const jobs = jobsSource.data ?? [];
  const activity = activitySource.data ?? [];

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const ws = profit?.windowStats;
  const cm = cust?.moneyBar;
  const vm = vend?.moneyBar;
  const coverage = assignmentCoverage(jobsSource.data);
  const customerItems = cust?.items || [];
  const atRisk = customerItems.filter((item) => item.balance > 0).slice(0, 3);
  const topRevenue = [...customerItems].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 4);

  return (
    <div className="app-chrome flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex w-full min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="hearth-dashboard-main flex-1 overflow-y-auto px-3 pb-28 lg:px-5 lg:pb-6">
          <div className="hearth-dashboard liquid-dashboard mx-auto w-full min-w-0 max-w-[1720px]">
            <div className="dashboard-heading flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="dashboard-date text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </p>
                <h1 className="mt-2 font-semibold leading-tight">
                  <DashboardGreeting now={now} />
                </h1>
              </div>
              <Link href={QUICK_ADD_JOB_HREF} className="dashboard-quick-add ui-btn-primary inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm">
                <Plus size={17} />
                Quick Add
              </Link>
            </div>

            <section className="dashboard-metrics" aria-label="Business overview">
              <MetricTile
                label="Revenue YTD"
                value={ws ? fmtMoneyShort(ws.revenue) : "-"}
                sublabel={ws ? `${ws.invoiceCount.toLocaleString()} invoices` : sourceLabel(profitSource)}
                accent="#17725a"
                icon={<TrendingUp size={18} />}
                href="/reports/profit-by-job?preset=ytd"
              />
              <MetricTile
                label="Profit YTD"
                value={ws ? fmtMoneyShort(ws.profit) : "-"}
                sublabel={ws ? (ws.margin != null ? `${ws.margin.toFixed(1)}% margin` : "Margin unavailable") : sourceLabel(profitSource)}
                accent="#2868b9"
                icon={<CircleDollarSign size={18} />}
                href="/reports/profit-by-job?preset=ytd"
              />
              <MetricTile
                label="Owed To You"
                value={cm ? fmtMoneyShort(cm.totalDue) : "-"}
                sublabel={cm ? `${cm.openInvoiceCount} open - ${cm.overdueCount} overdue` : sourceLabel(customerSource)}
                accent="#754da4"
                icon={<Users size={18} />}
                href="/reports/ar-aging"
              />
              <MetricTile
                label="You Owe"
                value={vm ? fmtMoneyShort(vm.totalOwed) : "-"}
                sublabel={vm ? `${vm.openBillCount} open - ${vm.overdueCount} overdue` : sourceLabel(vendorSource)}
                accent="#b6415b"
                icon={<Banknote size={18} />}
                href="/vendors"
              />
              <MetricTile
                label="Active Techs"
                value={String(dispatch?.stats?.activeTechs ?? "-")}
                sublabel={dispatch ? `${dispatch.stats?.onJob} on job` : sourceLabel(dispatchSource)}
                accent="var(--color-ember)"
                icon={<Radio size={18} />}
                href="/dispatch"
              />
              <MetricTile
                label="Jobs Assigned"
                value={coverage === null ? "-" : `${coverage}%`}
                sublabel={jobsSource.data ? `${jobs.length} jobs today` : sourceLabel(jobsSource)}
                accent="#278591"
                icon={<Gauge size={18} />}
                href="/schedule"
              />
            </section>

            <section className="dashboard-operations">
              <div className="dashboard-column dashboard-financials">
                <DataPanel title="Open Invoices" sources={[customerSource]}><CustomerHealth customer={cust!} /></DataPanel>
                <DataPanel title="Open Balances" sources={[customerSource]}><AtRiskAccounts accounts={atRisk} /></DataPanel>
                <DataPanel title="Cash Exposure" sources={[customerSource, vendorSource]}><CollectionsPanel customer={cust!} vendor={vend!} /></DataPanel>
              </div>

              <div className="dashboard-column dashboard-field">
                <DataPanel title="Field Operations" sources={[dispatchSource]}><FieldMap dispatch={dispatch!} now={now.getTime()} /></DataPanel>
                <DataPanel title="Today's Schedule" sources={[jobsSource]}><TodaySchedule jobs={jobs} /></DataPanel>
              </div>

              <div className="dashboard-column dashboard-activity">
                <Recommendations customer={customerSource} vendor={vendorSource} dispatch={dispatchSource} />
                <DataPanel title="Jobs By Status" sources={[jobsSource]}><JobsByStatus jobs={jobs} /></DataPanel>
                <DataPanel title="Recent Activity" sources={[activitySource]}><ActivityRail activity={activity} /></DataPanel>
              </div>
            </section>

            <section className="dashboard-bottom">
              <RevenueOverview profit={profitSource} customers={customerSource} topRevenue={topRevenue} />
              <DataPanel title="Service Pipeline" sources={[jobsSource]}><ServicePipeline jobs={jobs} /></DataPanel>
            </section>
            <CommandDock />
          </div>
        </main>
      </div>
    </div>
  );
}

function DashboardGreeting({ now }: { now: Date }) {
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? <AuthenticatedGreeting now={now} />
    : <>{greetingFor(now)}.</>;
}

function AuthenticatedGreeting({ now }: { now: Date }) {
  const identity = useAuthenticatedDisplayIdentity();
  return <>{greetingFor(now)}{identity.isLoaded && identity.isSignedIn && identity.firstName ? `, ${identity.firstName}` : ""}.</>;
}

function sourceLabel(source: DashboardResource<unknown>) {
  return source.status === "loading" ? "Loading" : "Data unavailable";
}

function SourceNotice({ name, source }: { name: string; source: DashboardResource<unknown> }) {
  return <div className="dashboard-source-notice flex items-center justify-between gap-3 text-sm" role={source.status === "error" ? "alert" : "status"}>
    <span>{name}: {sourceLabel(source)}</span>
    {source.status === "error" && <button type="button" onClick={source.retry} title={`Retry ${name}`} aria-label={`Retry ${name}`} className="glass-icon shrink-0"><RefreshCw size={16} /></button>}
  </div>;
}

function DataPanel({ title, sources, children }: { title: string; sources: DashboardResource<unknown>[]; children: ReactNode }) {
  const pending = sources.filter((source) => source.status !== "ready");
  if (!pending.length) return <>{children}</>;
  return <LiquidPanel className="dashboard-panel dashboard-pending p-5" strong>
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="mt-4 space-y-3">{pending.map((source, index) => <SourceNotice key={index} name={title} source={source} />)}</div>
  </LiquidPanel>;
}

function MetricTile({
  label,
  value,
  sublabel,
  accent,
  icon,
  href,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: string;
  icon: ReactNode;
  href: string;
}) {
  const content = (
    <LiquidPanel className="dashboard-metric liquid-metric" style={{ "--dashboard-accent": accent } as CSSProperties} strong>
      <div className="dashboard-metric-top">
        <p>{label}</p>
        <span aria-hidden="true">{icon}</span>
      </div>
      <p className="dashboard-metric-value mono-number">{value}</p>
      <p className="dashboard-metric-detail">{sublabel}</p>
    </LiquidPanel>
  );

  return (
    <Link href={href} className="dashboard-metric-link block">
      {content}
    </Link>
  );
}

function CustomerHealth({ customer }: { customer: CustomerResp }) {
  const total = customer.moneyBar.openInvoiceCount;
  const overdue = customer.moneyBar.overdueCount;
  const pct = total ? Math.round((overdue / total) * 100) : null;

  return (
    <LiquidPanel className="dashboard-panel p-5" strong>
      <PanelTitle icon={<Users size={17} />} title="Open Invoices" href="/customers" />
      <div className="dashboard-health mt-5 flex items-center gap-5">
        <Donut value={pct ?? 0} accent="var(--color-ember)" label={pct === null ? "-" : `${pct}%`} />
        <div className="min-w-0 flex-1 space-y-3">
          <BarRow label="Overdue invoices" value={overdue} max={Math.max(total, 1)} color="var(--color-ember)" />
          <BarRow label="Open invoices" value={total} max={Math.max(total, 1)} color="#2563eb" />
        </div>
      </div>
    </LiquidPanel>
  );
}

function AtRiskAccounts({ accounts }: { accounts: CustomerCenterItem[] }) {
  return (
    <LiquidPanel className="dashboard-panel p-5">
      <PanelTitle icon={<ReceiptText size={17} />} title="Open Balances" href="/customers?filter=with_balance" />
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
          <EmptyLine label="No customers with an open balance." />
        )}
      </div>
    </LiquidPanel>
  );
}

function CollectionsPanel({ customer, vendor }: { customer: CustomerResp; vendor: VendorResp }) {
  const ar = customer.moneyBar.totalDue;
  const ap = vendor.moneyBar.totalOwed;
  const max = Math.max(ar, ap, 1);

  return (
    <LiquidPanel className="dashboard-panel p-5">
      <PanelTitle icon={<WalletCards size={17} />} title="Cash Exposure" href="/reports/ar-aging" />
      <div className="mt-4 space-y-4">
        <BarRow label="Receivables" value={ar} max={max} color="#8b5cf6" money />
        <BarRow label="Payables" value={ap} max={max} color="#ef4444" money />
        <BarRow label="Open PO value" value={vendor.moneyBar.openPOValue} max={Math.max(vendor.moneyBar.openPOValue, max)} color="var(--color-ember)" money />
      </div>
    </LiquidPanel>
  );
}

function FieldMap({ dispatch, now }: { dispatch: DispatchResp; now: number }) {
  const techs = dispatch.techs;
  const selected = techs.find((tech) => tech.currentJob) || techs[0];
  const hasLocations = getLocationMarkers(techs, now).length > 0;

  return (
    <LiquidPanel className="dashboard-panel dashboard-map-panel" strong>
      <div className="dashboard-map-heading">
        <div className="min-w-0">
          <PanelTitle icon={<MapPinned size={17} />} title="Field Operations" href="/dispatch" />
          <p className="dashboard-map-description mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Last-reported technician locations and dispatch assignments.
          </p>
        </div>
        <div className="dashboard-map-status flex flex-wrap gap-2">
          <StatusPill tone="neutral">{dispatch.stats?.activeTechs} active</StatusPill>
          <StatusPill tone={dispatch.stats?.unassigned ? "warning" : "neutral"}>{dispatch.stats?.unassigned} unassigned</StatusPill>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="dashboard-map-stage liquid-map-stage relative overflow-hidden" style={{ minHeight: hasLocations ? 360 : 180 }}>
          <OperationsLeafletMap techs={techs} now={now} />
        </div>

        <div className="dashboard-dispatch-details">
          <div className="dashboard-dispatch-section">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} style={{ color: "var(--color-ember)" }} />
              Current Focus
            </div>
            {selected ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-base font-semibold">{selected.name}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {selected.status || "Status unavailable"} - {selected.jobsDone}/{selected.jobsToday} complete
                  </p>
                </div>
                <MiniJob label="Now" job={selected.currentJob} />
                <MiniJob label="Next" job={selected.nextJob} />
              </div>
            ) : (
              <EmptyLine label="No active techs loaded." />
            )}
          </div>

          <div className="dashboard-dispatch-section">
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

function TodaySchedule({ jobs }: { jobs: Job[] }) {
  return (
    <LiquidPanel className="dashboard-panel dashboard-schedule p-5">
      <PanelTitle icon={<CalendarClock size={17} />} title="Today's Schedule" href="/schedule" />
      <div className="dashboard-schedule-list mt-4">
        {jobs.slice(0, 6).map((job) => (
          <Link key={job.id} href={`/jobs?id=${encodeURIComponent(job.id)}`} className="schedule-card">
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
}: {
  customer: DashboardResource<CustomerResp>;
  vendor: DashboardResource<VendorResp>;
  dispatch: DashboardResource<DispatchResp>;
}) {
  const recs: Array<{ name: string; source: DashboardResource<unknown>; text: string | null }> = [
    { name: "Receivables", source: customer, text: customer.data ? `${customer.data.moneyBar.overdueCount} overdue invoices need follow-up` : null },
    { name: "Dispatch", source: dispatch, text: dispatch.data ? `${dispatch.data.stats?.unassigned} scheduled jobs are waiting for assignment` : null },
    { name: "Payables", source: vendor, text: vendor.data ? `${vendor.data.moneyBar.overdueCount} vendor bills are overdue` : null },
  ];

  return (
    <LiquidPanel className="dashboard-panel p-5" strong>
      <PanelTitle icon={<Bot size={17} />} title="Operations Follow-Up" href="/gabe" />
      <div className="mt-4 space-y-3">
        {recs.map((rec, index) => (
          <div key={rec.name} className="recommendation-row">
            <span className="dashboard-priority-number flex h-8 w-8 items-center justify-center text-xs font-semibold" style={{ color: index === 0 ? "var(--color-ember)" : "#2868b9" }}>
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">{rec.text ? <p className="text-sm font-medium">{rec.text}</p> : <SourceNotice name={rec.name} source={rec.source} />}</div>
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
    <LiquidPanel className="dashboard-panel p-5">
      <PanelTitle icon={<CheckCircle2 size={17} />} title="Jobs By Status" href="/jobs" />
      <div className="dashboard-health mt-5 flex items-center gap-5">
        <Donut value={complete} accent="#2563eb" label={jobs.length ? `${complete}%` : "-"} />
        <div className="min-w-0 flex-1 space-y-3">
          {Object.entries({ scheduled: 0, in_progress: 0, completed: 0, ...counts }).map(([label, value]) => (
            <BarRow key={label} label={label.replace("_", " ")} value={value} max={total} color={statusColor(label)} />
          ))}
        </div>
      </div>
    </LiquidPanel>
  );
}

function ActivityRail({ activity }: { activity: Activity[] }) {
  return (
    <LiquidPanel className="dashboard-panel p-5">
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
        {!activity.length && <EmptyLine label="No recent activity." />}
      </div>
    </LiquidPanel>
  );
}

function RevenueOverview({ profit, customers, topRevenue }: { profit: DashboardResource<ProfitResp>; customers: DashboardResource<CustomerResp>; topRevenue: CustomerCenterItem[] }) {
  const ws = profit.data?.windowStats;
  return (
    <LiquidPanel className="dashboard-panel dashboard-revenue p-5" strong>
      <PanelTitle icon={<TrendingUp size={17} />} title="Revenue Overview" href="/reports" />
      <div className="dashboard-revenue-grid">
        <div className="dashboard-revenue-summary min-w-0 space-y-5">
          <p className="dashboard-revenue-value mono-number font-semibold">{ws ? fmtMoney(ws.revenue) : "-"}</p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Year-to-date revenue</p>
          {ws ? <>
            <BarRow label="Revenue" value={ws.revenue} max={Math.max(ws.revenue, ws.cogs + ws.billable, 1)} color="var(--color-ember)" money />
            <BarRow label="Costs" value={ws.cogs + ws.billable} max={Math.max(ws.revenue, ws.cogs + ws.billable, 1)} color="#2563eb" money />
          </> : <SourceNotice name="Revenue" source={profit} />}
        </div>
        <div className="dashboard-revenue-customers space-y-2">
          <p className="text-sm font-semibold">Top Customers By Revenue</p>
          {topRevenue.map((customer, index) => (
            <Link key={customer.id} href={`/customers/${customer.id}`} className="glass-row">
              <span className="rank-badge">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{customer.displayName}</span>
              <span className="mono-number text-sm">{fmtMoneyShort(customer.totalRevenue)}</span>
            </Link>
          ))}
          {customers.status !== "ready" ? <SourceNotice name="Customer revenue" source={customers} /> : !topRevenue.length && <EmptyLine label="No customer revenue rows." />}
        </div>
      </div>
    </LiquidPanel>
  );
}

function ServicePipeline({ jobs }: { jobs: Job[] }) {
  const total = Math.max(1, jobs.length);
  const rows = [
    { label: "Scheduled", value: jobs.filter((job) => job.status === "scheduled").length, color: "var(--color-ember)" },
    { label: "In Progress", value: jobs.filter((job) => job.status === "in_progress").length, color: "#2563eb" },
    { label: "Completed", value: jobs.filter((job) => job.status === "completed").length, color: "#12b76a" },
    { label: "Assigned", value: jobs.filter((job) => job.assignedTechs?.length).length, color: "#8b5cf6" },
  ];

  return (
    <LiquidPanel className="dashboard-panel dashboard-pipeline p-5" strong>
      <PanelTitle icon={<Route size={17} />} title="Service Pipeline" href="/jobs" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="service-stat">
            <span className="mono-number" style={{ color: row.color }}>{row.value}</span>
            <small>{row.label}</small>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <BarRow key={row.label} label={row.label} value={row.value} max={total} color={row.color} />
        ))}
      </div>
    </LiquidPanel>
  );
}

function CommandDock() {
  return (
    <LiquidPanel className="dashboard-command-dock bottom-copilot glass-dock p-3" strong>
      <div className="dashboard-command-grid">
        <Link href="/gabe" className="flex min-w-0 items-center gap-3 px-3 py-2">
          <span className="copilot-orb"><Sparkles size={22} /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">HearthOS Copilot</span>
            <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>Your AI operations assistant</span>
          </span>
        </Link>
        <Link href="/gabe" className="copilot-input">
          <Search size={17} style={{ color: "var(--color-text-muted)" }} />
          <span>Ask anything about your business...</span>
          <span className="copilot-mic">AI</span>
        </Link>
        <div className="flex flex-wrap justify-end gap-2">
          {["Summarize today", "Top customers", "Jobs by tech", "Revenue by service"].map((label) => (
            <Link key={label} href="/gabe" className="glass-chip">{label}</Link>
          ))}
        </div>
      </div>
    </LiquidPanel>
  );
}

function MiniJob({ label, job }: { label: string; job?: { title: string; customer: string; scheduledTime?: string } | null }) {
  return (
    <div className="dashboard-mini-job" style={{ color: "var(--color-text-primary)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>{label}</p>
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
    <div className="dashboard-panel-title flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0" style={{ color: "var(--color-ember)" }}>{icon}</span>
        <h2 className="min-w-0 break-words text-base font-semibold leading-snug">{title}</h2>
      </div>
      <Link href={href} aria-label={`View ${title}`} className="shrink-0 whitespace-nowrap text-xs font-semibold" style={{ color: "var(--color-ember)" }}>
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
  const width = `${Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100))}%`;
  return (
    <div className="dashboard-bar-row">
      <div className="dashboard-bar-label mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="capitalize" style={{ color: "var(--color-text-muted)" }}>{label}</span>
        <span className="mono-number font-semibold">{money ? fmtMoneyShort(value) : value.toLocaleString()}</span>
      </div>
      <div className="dashboard-bar-track h-2 overflow-hidden rounded-full bg-slate-200/60">
        <div className="h-full rounded-full" style={{ width, background: color }} />
      </div>
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <div className="dashboard-empty border border-dashed p-4 text-sm" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
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
