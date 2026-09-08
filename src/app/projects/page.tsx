"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  PackageCheck,
  Plus,
  Receipt,
  RefreshCw,
  Truck,
} from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type ProjectStage = "new" | "parts_needed" | "parts_ordered" | "ready" | "scheduled" | "in_progress" | "complete";
type PartsStatus = "not_ordered" | "quote_requested" | "ordered" | "partial" | "received" | "backordered";

type Project = {
  id: string;
  sourceType: "estimate" | "invoice";
  sourceId: string;
  sourceNumber: string | null;
  sourceUrl: string;
  customerId: string | null;
  customerName: string;
  title: string;
  stage: ProjectStage;
  priority: "low" | "normal" | "high" | "urgent";
  totalAmount: number;
  targetDate: string | null;
  scheduledJobId: string | null;
  partsStatus: PartsStatus;
  partsOrderedAt: string | null;
  partsExpectedAt: string | null;
  partsReceivedAt: string | null;
  poNumber: string | null;
  notes: string | null;
  parts: Array<{ id: string; sku?: string | null; name?: string | null; description: string; quantity: number }>;
  updatedAt: string;
};

type InvoiceSource = {
  id: string;
  invoiceNumber?: string;
  customerName?: string;
  jobTitle?: string;
  totalAmount?: number;
  balance?: number;
  issueDate?: string;
};

type EstimateSource = {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { name?: string };
  TotalAmt?: number;
  TxnDate?: string;
  Line?: Array<{ Description?: string; SalesItemLineDetail?: { ItemRef?: { name?: string } } }>;
};

const columns: Array<{ key: ProjectStage; label: string; hint: string }> = [
  { key: "new", label: "New", hint: "Needs review" },
  { key: "parts_needed", label: "Parts Needed", hint: "Build the order" },
  { key: "parts_ordered", label: "Ordered", hint: "Waiting on parts" },
  { key: "ready", label: "Ready", hint: "Ready to schedule" },
  { key: "scheduled", label: "Scheduled", hint: "On the calendar" },
  { key: "complete", label: "Complete", hint: "Closed out" },
];

const stageLabels: Record<ProjectStage, string> = {
  new: "New",
  parts_needed: "Parts Needed",
  parts_ordered: "Parts Ordered",
  ready: "Ready",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  complete: "Complete",
};

const partsLabels: Record<PartsStatus, string> = {
  not_ordered: "Not ordered",
  quote_requested: "Quote requested",
  ordered: "Ordered",
  partial: "Partially received",
  received: "Received",
  backordered: "Backordered",
};

const stageOptions = Object.keys(stageLabels) as ProjectStage[];
const partsOptions = Object.keys(partsLabels) as PartsStatus[];

function money(value: number | undefined) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function firstEstimateLine(estimate: EstimateSource) {
  return (estimate.Line || [])
    .map((line) => line.Description || line.SalesItemLineDetail?.ItemRef?.name || "")
    .find(Boolean);
}

function sourceKey(type: "estimate" | "invoice", id: string) {
  return `${type}:${id}`;
}

function metricTone(label: string) {
  if (label.includes("Ready")) return "#16A34A";
  if (label.includes("Ordered")) return "#2563EB";
  if (label.includes("Need")) return "#F8971F";
  return "var(--color-ember)";
}

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSource[]>([]);
  const [estimates, setEstimates] = useState<EstimateSource[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sourceTab, setSourceTab] = useState<"estimate" | "invoice">("estimate");
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("12:00");
  const [message, setMessage] = useState<string | null>(null);
  const selectedProjectId = searchParams.get("project");

  const importedSources = useMemo(
    () => new Set(projects.map((project) => sourceKey(project.sourceType, project.sourceId))),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [
        project.title,
        project.customerName,
        project.sourceNumber || "",
        project.poNumber || "",
        project.partsStatus,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [projects, query]);

  const summary = useMemo(
    () => [
      { label: "Active Projects", value: projects.filter((p) => p.stage !== "complete").length },
      { label: "Parts Needed", value: projects.filter((p) => p.stage === "parts_needed").length },
      { label: "Parts Ordered", value: projects.filter((p) => p.partsStatus === "ordered" || p.partsStatus === "partial").length },
      { label: "Ready", value: projects.filter((p) => p.stage === "ready").length },
    ],
    [projects],
  );

  async function loadAll() {
    setLoading(true);
    setMessage(null);
    try {
      const [projectsRes, invoicesRes, estimatesRes] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/invoices?limit=80", { cache: "no-store" }),
        fetch("/api/estimates?limit=80", { cache: "no-store" }),
      ]);
      const projectsData = await projectsRes.json();
      const invoicesData = await invoicesRes.json();
      const estimatesData = await estimatesRes.json();
      setProjects(projectsData.projects || []);
      setInvoices(invoicesData.invoices || []);
      setEstimates(estimatesData.estimates || []);
    } catch (err) {
      console.error(err);
      setMessage("Could not load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!selectedProjectId || selected) return;
    const match = projects.find((project) => project.id === selectedProjectId);
    if (match) setSelected(match);
  }, [projects, selected, selectedProjectId]);

  async function importSource(sourceType: "estimate" | "invoice", sourceId: string) {
    setImporting(sourceKey(sourceType, sourceId));
    setMessage(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create project");
      setProjects((prev) => {
        const existing = prev.filter((project) => project.id !== data.project.id);
        return [data.project, ...existing];
      });
      setSelected(data.project);
      setMessage("Project added to the board.");
    } catch (err: any) {
      setMessage(err?.message || "Unable to add project.");
    } finally {
      setImporting(null);
    }
  }

  async function saveProject(updates: Partial<Project>) {
    const project = selected;
    if (!project) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, ...updates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update project");
      setProjects((prev) => prev.map((item) => (item.id === data.project.id ? data.project : item)));
      setSelected(data.project);
      setMessage("Project updated.");
    } catch (err: any) {
      setMessage(err?.message || "Unable to update project.");
    } finally {
      setSaving(false);
    }
  }

  async function scheduleProject(project: Project) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule_job",
          id: project.id,
          scheduledDate: scheduleDate,
          scheduledTimeStart: scheduleStart,
          scheduledTimeEnd: scheduleEnd,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to schedule project");
      setProjects((prev) => prev.map((item) => (item.id === data.project.id ? data.project : item)));
      setSelected(data.project);
      setMessage(`Scheduled as ${data.job.jobNumber}.`);
    } catch (err: any) {
      setMessage(err?.message || "Unable to schedule project.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProject(project: Project) {
    if (!window.confirm(`Remove ${project.sourceType} ${project.sourceNumber || project.sourceId} from the project board?`)) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects?id=${encodeURIComponent(project.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove project");
      setProjects((prev) => prev.filter((item) => item.id !== project.id));
      setSelected(null);
      setMessage("Project removed from the board.");
    } catch (err: any) {
      setMessage(err?.message || "Unable to remove project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden pb-24 lg:pb-0">
        <Header />

        <div className="mx-auto flex max-w-[1680px] flex-col gap-5 px-4 py-4 lg:px-6 lg:py-6">
          <section className="glass-panel rounded-[1.6rem] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--color-ember)" }}>
                  <PackageCheck size={16} />
                  Upcoming Projects
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
                  Project board
                </h1>
                <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Turn accepted estimates and active invoices into organized install projects, track parts ordering, and move them toward scheduling.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search projects, customers, PO..."
                  className="h-11 min-w-[260px] rounded-2xl px-4 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(15,23,42,0.08)", color: "var(--color-text-primary)" }}
                />
                <button
                  onClick={loadAll}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold"
                  style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(15,23,42,0.08)", color: "var(--color-text-primary)" }}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summary.map((metric) => (
                <div key={metric.label} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.62)", border: "1px solid rgba(255,255,255,0.76)" }}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-muted)" }}>{metric.label}</div>
                  <div className="mt-2 text-3xl font-bold" style={{ color: metricTone(metric.label) }}>{metric.value}</div>
                </div>
              ))}
            </div>
            {message && (
              <div className="mt-4 rounded-2xl px-4 py-3 text-sm font-medium" style={{ background: "rgba(255,255,255,0.62)", color: "var(--color-text-secondary)", border: "1px solid rgba(15,23,42,0.08)" }}>
                {message}
              </div>
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="glass-panel rounded-[1.6rem] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Add from documents</h2>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Pull estimates or invoices into projects.</p>
                </div>
                <Plus size={18} style={{ color: "var(--color-ember)" }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl p-1" style={{ background: "rgba(255,255,255,0.58)", border: "1px solid rgba(15,23,42,0.06)" }}>
                {(["estimate", "invoice"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSourceTab(tab)}
                    className="rounded-xl px-3 py-2 text-sm font-semibold"
                    style={{
                      background: sourceTab === tab ? "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))" : "transparent",
                      color: sourceTab === tab ? "#fff" : "var(--color-text-secondary)",
                    }}
                  >
                    {tab === "estimate" ? "Estimates" : "Invoices"}
                  </button>
                ))}
              </div>

              <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {sourceTab === "estimate"
                  ? estimates.slice(0, 40).map((estimate) => {
                      const imported = importedSources.has(sourceKey("estimate", estimate.Id));
                      return (
                        <SourceButton
                          key={estimate.Id}
                          icon={<FileText size={16} />}
                          title={estimate.CustomerRef?.name || "Customer"}
                          subtitle={firstEstimateLine(estimate) || `Estimate ${estimate.DocNumber || estimate.Id}`}
                          amount={money(estimate.TotalAmt)}
                          meta={estimate.DocNumber || estimate.Id}
                          imported={imported}
                          loading={importing === sourceKey("estimate", estimate.Id)}
                          onClick={() => importSource("estimate", estimate.Id)}
                        />
                      );
                    })
                  : invoices.slice(0, 40).map((invoice) => {
                      const imported = importedSources.has(sourceKey("invoice", invoice.id));
                      return (
                        <SourceButton
                          key={invoice.id}
                          icon={<Receipt size={16} />}
                          title={invoice.customerName || "Customer"}
                          subtitle={invoice.jobTitle || `Invoice ${invoice.invoiceNumber || invoice.id}`}
                          amount={money(invoice.totalAmount)}
                          meta={invoice.invoiceNumber || invoice.id}
                          imported={imported}
                          loading={importing === sourceKey("invoice", invoice.id)}
                          onClick={() => importSource("invoice", invoice.id)}
                        />
                      );
                    })}
              </div>
            </aside>

            <section className="min-w-0">
              {loading ? (
                <div className="glass-panel rounded-[1.6rem] p-8 text-center" style={{ color: "var(--color-text-muted)" }}>Loading projects...</div>
              ) : (
                <div className="grid min-h-[620px] gap-4 xl:grid-cols-3 2xl:grid-cols-6">
                  {columns.map((column) => {
                    const rows = filteredProjects.filter((project) =>
                      column.key === "scheduled"
                        ? project.stage === "scheduled" || project.stage === "in_progress"
                        : project.stage === column.key,
                    );
                    return (
                      <div key={column.key} className="glass-panel flex min-h-[360px] flex-col rounded-[1.4rem] p-3">
                        <div className="mb-3 flex items-start justify-between px-1">
                          <div>
                            <h3 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{column.label}</h3>
                            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{column.hint}</p>
                          </div>
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "rgba(255,255,255,0.68)", color: "var(--color-ember)" }}>
                            {rows.length}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {rows.map((project) => (
                            <button
                              key={project.id}
                              onClick={() => setSelected(project)}
                              className="w-full rounded-2xl p-3 text-left transition hover:-translate-y-0.5"
                              style={{
                                background: selected?.id === project.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.68)",
                                border: selected?.id === project.id ? "1px solid rgba(255,106,0,0.38)" : "1px solid rgba(255,255,255,0.78)",
                                boxShadow: "0 16px 34px rgba(39,55,82,0.08)",
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: project.sourceType === "invoice" ? "#2563EB" : "var(--color-ember)" }}>
                                    {project.sourceType} {project.sourceNumber}
                                  </div>
                                  <div className="mt-1 line-clamp-2 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{project.title}</div>
                                  <div className="mt-1 truncate text-xs" style={{ color: "var(--color-text-muted)" }}>{project.customerName}</div>
                                </div>
                                <div className="shrink-0 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{money(project.totalAmount)}</div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                <Pill label={partsLabels[project.partsStatus]} tone={project.partsStatus === "received" ? "green" : project.partsStatus === "backordered" ? "red" : "orange"} />
                                {project.targetDate && <Pill label={project.targetDate} tone="blue" />}
                                {project.poNumber && <Pill label={`PO ${project.poNumber}`} tone="gray" />}
                              </div>
                            </button>
                          ))}
                          {rows.length === 0 && (
                            <div className="rounded-2xl p-4 text-center text-xs" style={{ background: "rgba(255,255,255,0.42)", color: "var(--color-text-muted)", border: "1px dashed rgba(15,23,42,0.12)" }}>
                              No projects here.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-3 backdrop-blur-sm lg:p-5" onClick={() => setSelected(null)}>
          <section
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[1.6rem] p-5"
            style={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(255,255,255,0.92)", boxShadow: "0 28px 80px rgba(15,23,42,0.22)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--color-ember)" }}>
                  {selected.sourceType} {selected.sourceNumber}
                </div>
                <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{selected.customerName}</h2>
                <Link href={selected.sourceUrl} className="mt-1 inline-flex text-sm font-semibold" style={{ color: "#2563EB" }}>
                  Open source document
                </Link>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full px-3 py-1 text-sm" style={{ background: "var(--color-surface-2)" }}>Close</button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Project title</span>
                <input
                  value={selected.title}
                  onChange={(event) => setSelected({ ...selected, title: event.target.value })}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Stage" value={selected.stage} options={stageOptions.map((value) => ({ value, label: stageLabels[value] }))} onChange={(value) => setSelected({ ...selected, stage: value as ProjectStage })} />
                <SelectField label="Parts status" value={selected.partsStatus} options={partsOptions.map((value) => ({ value, label: partsLabels[value] }))} onChange={(value) => setSelected({ ...selected, partsStatus: value as PartsStatus })} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <DateField label="Ordered" value={selected.partsOrderedAt || ""} onChange={(value) => setSelected({ ...selected, partsOrderedAt: value || null })} />
                <DateField label="Expected" value={selected.partsExpectedAt || ""} onChange={(value) => setSelected({ ...selected, partsExpectedAt: value || null })} />
                <DateField label="Received" value={selected.partsReceivedAt || ""} onChange={(value) => setSelected({ ...selected, partsReceivedAt: value || null })} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DateField label="Target install date" value={selected.targetDate || ""} onChange={(value) => setSelected({ ...selected, targetDate: value || null })} />
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>PO / order number</span>
                  <input
                    value={selected.poNumber || ""}
                    onChange={(event) => setSelected({ ...selected, poNumber: event.target.value || null })}
                    className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                  <Truck size={16} />
                  Required parts
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl p-2" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  {selected.parts.map((part) => (
                    <div key={part.id} className="rounded-xl bg-white/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{part.sku || part.name || "Part"}</div>
                          <div className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{part.description}</div>
                        </div>
                        <div className="text-sm font-bold" style={{ color: "var(--color-ember)" }}>x{part.quantity}</div>
                      </div>
                    </div>
                  ))}
                  {selected.parts.length === 0 && <div className="p-4 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No line items found on the source document.</div>}
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Internal notes</span>
                <textarea
                  value={selected.notes || ""}
                  onChange={(event) => setSelected({ ...selected, notes: event.target.value || null })}
                  rows={4}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                />
              </label>

              <div className="rounded-2xl p-3" style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)" }}>
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#2563EB" }}>
                  <CalendarDays size={16} />
                  Create scheduled job
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="rounded-xl px-3 py-2 text-sm" style={{ background: "#fff", border: "1px solid rgba(37,99,235,0.18)" }} />
                  <input type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} className="rounded-xl px-3 py-2 text-sm" style={{ background: "#fff", border: "1px solid rgba(37,99,235,0.18)" }} />
                  <input type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} className="rounded-xl px-3 py-2 text-sm" style={{ background: "#fff", border: "1px solid rgba(37,99,235,0.18)" }} />
                </div>
                {selected.scheduledJobId ? (
                  <Link href="/jobs" className="mt-3 inline-flex text-sm font-bold" style={{ color: "#2563EB" }}>View scheduled job</Link>
                ) : (
                  <button
                    onClick={() => scheduleProject(selected)}
                    disabled={saving}
                    className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                    style={{ background: "#2563EB", opacity: saving ? 0.72 : 1 }}
                  >
                    {saving ? "Scheduling..." : "Create Job on Schedule"}
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => saveProject(selected)}
                  disabled={saving}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))", opacity: saving ? 0.72 : 1 }}
                >
                  {saving ? "Saving..." : "Save Project"}
                </button>
                <button
                  onClick={() => saveProject({ ...selected, stage: "complete" })}
                  disabled={saving}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold"
                  style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.22)" }}
                >
                  Complete
                </button>
                <button
                  onClick={() => removeProject(selected)}
                  disabled={saving}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold"
                  style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.18)" }}
                >
                  Remove
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SourceButton({
  icon,
  title,
  subtitle,
  amount,
  meta,
  imported,
  loading,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  amount: string;
  meta: string;
  imported: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={imported || loading}
      className="w-full rounded-2xl p-3 text-left"
      style={{
        background: imported ? "rgba(22,163,74,0.08)" : "rgba(255,255,255,0.66)",
        border: imported ? "1px solid rgba(22,163,74,0.24)" : "1px solid rgba(255,255,255,0.76)",
        opacity: loading ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(255,106,0,0.1)", color: "var(--color-ember)" }}>
          {imported ? <CheckCircle2 size={16} /> : icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <strong className="truncate text-sm" style={{ color: "var(--color-text-primary)" }}>{title}</strong>
            <span className="text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>{amount}</span>
          </span>
          <span className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{subtitle}</span>
          <span className="mt-2 flex items-center justify-between text-[11px] font-semibold" style={{ color: imported ? "#16A34A" : "var(--color-text-muted)" }}>
            <span>{meta}</span>
            <span>{loading ? "Adding..." : imported ? "On board" : "Add"}</span>
          </span>
        </span>
      </div>
    </button>
  );
}

function Pill({ label, tone }: { label: string; tone: "green" | "red" | "orange" | "blue" | "gray" }) {
  const colors = {
    green: { bg: "rgba(22,163,74,0.12)", fg: "#16A34A" },
    red: { bg: "rgba(220,38,38,0.12)", fg: "#DC2626" },
    orange: { bg: "rgba(248,151,31,0.14)", fg: "#B45309" },
    blue: { bg: "rgba(37,99,235,0.12)", fg: "#2563EB" },
    gray: { bg: "rgba(100,116,139,0.12)", fg: "#64748B" },
  }[tone];
  return <span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: colors.bg, color: colors.fg }}>{label}</span>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
      />
    </label>
  );
}
