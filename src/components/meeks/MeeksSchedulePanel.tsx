"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TimeSelect from "@/components/scheduling/TimeSelect";

type CalendarView = "week" | "month";
type MeeksStatus = "requested" | "scheduled" | "completed" | "cancelled";
type WorkType = "install" | "setup" | "service_warranty" | "repair";
type MeeksJobLayout = { column: number; columns: number };

type Tech = {
  id: string;
  name: string;
  color: string;
};

type MeeksJob = {
  id: string;
  requestNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  poNumber?: string;
  address: string;
  lotNumber?: string;
  city?: string;
  state?: string;
  zip?: string;
  workType: WorkType;
  appliance?: string;
  requestedDate: string;
  requestedTimeWindow?: string;
  priority: "normal" | "high" | "urgent";
  notes?: string;
  accessNotes?: string;
  poAttachment?: MeeksAttachment;
  status: MeeksStatus;
  linkedJobId?: string;
  linkedJobNumber?: string;
  scheduledDate?: string;
  scheduledTimeStart?: string;
  scheduledTimeEnd?: string;
  assignedTechs?: Tech[];
  completedAt?: string;
  linkedJob?: {
    id: string;
    jobNumber: string;
    status: string;
    notes?: string;
    completedAt?: string;
    assignedTechs?: Tech[];
    scheduledDate?: string;
    scheduledTimeStart?: string;
    scheduledTimeEnd?: string;
    photos?: Array<{ id: string; label?: string; caption?: string; uri?: string; timestamp?: string }>;
  } | null;
};

type MeeksAttachment = {
  id: string;
  storageId?: string;
  fileName: string;
  contentType: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
};

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 12 }, (_, index) => index + 7);

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  install: "Install",
  setup: "Setup",
  service_warranty: "Service / Warranty",
  repair: "Repair",
};

const STATUS_COLORS: Record<MeeksStatus, string> = {
  requested: "#ff6a00",
  scheduled: "#2563eb",
  completed: "#12b76a",
  cancelled: "#ef4444",
};
const MAX_PO_ATTACHMENT_BYTES = 3 * 1024 * 1024;

function isoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function todayIso() {
  return isoDate(new Date());
}

function getWeekDates(baseDate: Date) {
  const sunday = new Date(baseDate);
  sunday.setDate(baseDate.getDate() - baseDate.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return date;
  });
}

function getMonthGrid(baseDate: Date) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + weekIndex * 7 + dayIndex);
      return day;
    })
  );
}

function formatDate(value?: string) {
  if (!value) return "Not scheduled";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value?: string) {
  if (!value) return "";
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw || 0);
  if (Number.isNaN(hours)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatCompactTime(value?: string) {
  if (!value) return "";
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw || 0);
  if (Number.isNaN(hours)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${suffix}`;
}

function formatFileSize(size?: number) {
  const bytes = Number(size || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toHourFloat(value?: string) {
  const [hoursRaw, minutesRaw] = (value || "09:00").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw || 0);
  return (Number.isNaN(hours) ? 9 : hours) + (Number.isNaN(minutes) ? 0 : minutes / 60);
}

function calendarDate(job: MeeksJob) {
  return job.scheduledDate || job.requestedDate || todayIso();
}

function calendarStart(job: MeeksJob) {
  return (job.scheduledTimeStart || "09:00").slice(0, 5);
}

function calendarEnd(job: MeeksJob) {
  return (job.scheduledTimeEnd || "10:00").slice(0, 5);
}

function layoutOverlappingMeeksJobs(dayJobs: MeeksJob[]) {
  const sortedJobs = [...dayJobs].sort((a, b) => {
    const startDiff = toHourFloat(calendarStart(a)) - toHourFloat(calendarStart(b));
    if (startDiff !== 0) return startDiff;
    return toHourFloat(calendarEnd(b)) - toHourFloat(calendarEnd(a));
  });

  const layouts = new Map<string, MeeksJobLayout>();
  let group: MeeksJob[] = [];
  let groupEnd = -Infinity;

  function flushGroup() {
    if (!group.length) return;

    const activeColumns: Array<{ column: number; end: number }> = [];
    const assignedColumns = new Map<string, number>();
    let maxColumns = 1;

    for (const job of group) {
      const start = toHourFloat(calendarStart(job));
      const end = Math.max(start + 0.5, toHourFloat(calendarEnd(job)));
      for (let index = activeColumns.length - 1; index >= 0; index -= 1) {
        if (activeColumns[index].end <= start) activeColumns.splice(index, 1);
      }

      const usedColumns = new Set(activeColumns.map((item) => item.column));
      let column = 0;
      while (usedColumns.has(column)) column += 1;
      assignedColumns.set(job.id, column);
      activeColumns.push({ column, end });
      maxColumns = Math.max(maxColumns, column + 1, activeColumns.length);
    }

    for (const job of group) {
      layouts.set(job.id, {
        column: assignedColumns.get(job.id) ?? 0,
        columns: maxColumns,
      });
    }

    group = [];
    groupEnd = -Infinity;
  }

  for (const job of sortedJobs) {
    const start = toHourFloat(calendarStart(job));
    const end = Math.max(start + 0.5, toHourFloat(calendarEnd(job)));
    if (group.length && start >= groupEnd) flushGroup();
    group.push(job);
    groupEnd = Math.max(groupEnd, end);
  }
  flushGroup();

  return layouts;
}

function statusTone(status: MeeksStatus) {
  const color = STATUS_COLORS[status];
  if (status === "completed") return { bg: "rgba(18,183,106,0.12)", color, label: "Completed" };
  if (status === "scheduled") return { bg: "rgba(37,99,235,0.12)", color, label: "Scheduled" };
  if (status === "cancelled") return { bg: "rgba(239,68,68,0.12)", color, label: "Cancelled" };
  return { bg: "rgba(255,106,0,0.12)", color, label: "Requested" };
}

function fullAddress(job: MeeksJob) {
  return [
    job.address,
    job.lotNumber ? `Lot ${job.lotNumber}` : "",
    [job.city, job.state, job.zip].filter(Boolean).join(", ").replace(/, (\w{2}|\d{5})$/, " $1"),
  ].filter(Boolean).join(", ");
}

function meeksJobsPath(params: Record<string, string> = {}) {
  if (typeof window === "undefined") return "/api/meeks/jobs";
  const query = new URLSearchParams();
  const token = new URLSearchParams(window.location.search).get("token");
  if (token) query.set("token", token);
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return `/api/meeks/jobs${query.size ? `?${query.toString()}` : ""}`;
}

function emptyForm() {
  return {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    poNumber: "",
    address: "",
    lotNumber: "",
    city: "",
    state: "MO",
    zip: "",
    workType: "install" as WorkType,
    appliance: "",
    requestedDate: todayIso(),
    requestedTimeWindow: "Morning preferred",
    priority: "normal",
    notes: "",
    accessNotes: "",
    poAttachment: undefined as MeeksAttachment | undefined,
  };
}

export default function MeeksSchedulePanel({ internal = false }: { internal?: boolean }) {
  const [jobs, setJobs] = useState<MeeksJob[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MeeksStatus>("all");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [selectedJob, setSelectedJob] = useState<MeeksJob | null>(null);
  const [moveForms, setMoveForms] = useState<Record<string, { scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] }>>({});

  async function load() {
    setLoading(true);
    try {
      const [jobsRes, techRes] = await Promise.all([
        fetch(meeksJobsPath(), { cache: "no-store" }),
        internal ? fetch("/api/techs?activeOnly=true", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const jobsData = await jobsRes.json();
      if (!jobsRes.ok) {
        setMessage(jobsData.error || "Could not load Meeks jobs.");
        setJobs([]);
      } else {
        setJobs(jobsData.jobs || []);
      }
      if (techRes) {
        const techData = await techRes.json();
        setTechs((techData.techs || []).map((tech: any) => ({ id: tech.id, name: tech.name, color: tech.color || "#2563EB" })));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 45_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internal]);

  useEffect(() => {
    setMoveForms((current) => {
      const next = { ...current };
      for (const job of jobs) {
        if (!next[job.id]) {
          next[job.id] = {
            scheduledDate: job.scheduledDate || job.requestedDate || todayIso(),
            scheduledTimeStart: job.scheduledTimeStart || "09:00",
            scheduledTimeEnd: job.scheduledTimeEnd || "11:00",
            assignedTechIds: job.assignedTechs?.map((tech) => tech.id) || [],
          };
        }
      }
      return next;
    });
  }, [jobs]);

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const monthGrid = useMemo(() => getMonthGrid(currentDate), [currentDate]);
  const today = todayIso();

  const summary = useMemo(() => ({
    requested: jobs.filter((job) => job.status === "requested").length,
    scheduled: jobs.filter((job) => job.status === "scheduled").length,
    completed: jobs.filter((job) => job.status === "completed").length,
  }), [jobs]);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const haystack = [
        job.requestNumber,
        job.linkedJobNumber,
        job.poNumber,
        job.poAttachment?.fileName,
        job.lotNumber,
        job.customerName,
        job.customerPhone,
        job.customerEmail,
        fullAddress(job),
        WORK_TYPE_LABELS[job.workType],
        job.appliance,
        job.notes,
        job.accessNotes,
        job.linkedJob?.notes,
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [jobs, searchQuery, statusFilter]);

  const weekJobs = useMemo(() => {
    const start = new Date(`${isoDate(weekDates[0])}T00:00:00`);
    const end = new Date(`${isoDate(weekDates[6])}T23:59:59`);
    return filteredJobs.filter((job) => {
      const date = new Date(`${calendarDate(job)}T12:00:00`);
      return date >= start && date <= end;
    });
  }, [filteredJobs, weekDates]);

  const monthJobs = useMemo(() => {
    const first = monthGrid[0][0];
    const last = monthGrid[monthGrid.length - 1][6];
    return filteredJobs.filter((job) => {
      const date = new Date(`${calendarDate(job)}T12:00:00`);
      return date >= first && date <= last;
    });
  }, [filteredJobs, monthGrid]);

  const visibleListJobs = useMemo(() => {
    const source = calendarView === "month" ? monthJobs : weekJobs;
    return [...source].sort((a, b) => `${calendarDate(a)} ${calendarStart(a)}`.localeCompare(`${calendarDate(b)} ${calendarStart(b)}`));
  }, [calendarView, monthJobs, weekJobs]);

  const headerLabel = calendarView === "month"
    ? currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  function goPrev() {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - (calendarView === "month" ? 30 : 7));
    setCurrentDate(date);
  }

  function goNext() {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + (calendarView === "month" ? 30 : 7));
    setCurrentDate(date);
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  async function submitRequest() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(meeksJobsPath(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not submit request.");
        return;
      }
      setForm(emptyForm());
      setCurrentDate(new Date(`${data.request?.requestedDate || todayIso()}T00:00:00`));
      setCalendarView("week");
      setMessage(`Request ${data.request?.requestNumber || ""} submitted.`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function attachPoFile(file?: File | null) {
    if (!file) return;
    setMessage("");
    if (file.size > MAX_PO_ATTACHMENT_BYTES) {
      setMessage("PO attachment must be 3 MB or smaller.");
      return;
    }
    const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    if (!allowedTypes.has(file.type)) {
      setMessage("PO attachment must be a PDF or image file.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read PO attachment."));
      reader.readAsDataURL(file);
    });

    setForm((current) => ({
      ...current,
      poAttachment: {
        id: `po-${Date.now()}`,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      },
    }));
  }

  async function moveToMainCalendar(job: MeeksJob) {
    const move = moveForms[job.id];
    if (!move) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/meeks/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move_to_calendar", id: job.id, ...move }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not move this request.");
        return;
      }
      setMessage(`${job.requestNumber} moved to main calendar as ${data.job?.jobNumber || "a job"}.`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteRequest(job: MeeksJob) {
    const prompt = job.linkedJobId
      ? `Delete ${job.requestNumber} from the Meeks portal? This will not cancel the linked HearthOS job ${job.linkedJobNumber || ""} on the main calendar.`
      : `Delete ${job.requestNumber} from the Meeks portal?`;
    if (!window.confirm(prompt)) return;

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(meeksJobsPath({ id: job.id }), { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not delete this request.");
        return;
      }
      setJobs((current) => current.filter((item) => item.id !== job.id));
      if (selectedJob?.id === job.id) setSelectedJob(null);
      setMessage(`${job.requestNumber} deleted.${data.linkedJobPreserved ? " Linked HearthOS job was left on the main calendar." : ""}`);
    } finally {
      setSaving(false);
    }
  }

  function updateMove(jobId: string, patch: Partial<{ scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] }>) {
    setMoveForms((current) => ({
      ...current,
      [jobId]: {
        scheduledDate: current[jobId]?.scheduledDate || todayIso(),
        scheduledTimeStart: current[jobId]?.scheduledTimeStart || "09:00",
        scheduledTimeEnd: current[jobId]?.scheduledTimeEnd || "11:00",
        assignedTechIds: current[jobId]?.assignedTechIds || [],
        ...patch,
      },
    }));
  }

  return (
    <section className={internal ? "min-w-[980px] p-4" : "mx-auto max-w-[1760px] space-y-5 px-4 py-6"}>
      <div className={internal ? "grid gap-4" : "grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"}>
        <div className={internal ? "rounded-2xl p-5" : "rounded-[2rem] p-6"} style={glassPanel}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-ember)" }}>Meeks Installed Services</p>
              <h2 className="mt-1 text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>{internal ? "Meeks Calendar Intake" : "Scheduling Portal"}</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                {internal ? "Review Meeks requests, then move approved work onto the main HearthOS schedule." : "Submit install, setup, service, warranty, and repair work requests."}
              </p>
            </div>
            {internal && (
              <Link href="/meeks" className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.2)" }}>
                Open portal
              </Link>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <Metric label="Requested" value={summary.requested} color="#ff6a00" />
            <Metric label="Scheduled" value={summary.scheduled} color="#2563eb" />
            <Metric label="Complete" value={summary.completed} color="#12b76a" />
          </div>

          {!internal && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Customer name" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} required />
                <Field label="Phone" value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })} />
              </div>
              <Field label="Email" value={form.customerEmail} onChange={(value) => setForm({ ...form, customerEmail: value })} />
              <Field label="PO number" value={form.poNumber} onChange={(value) => setForm({ ...form, poNumber: value })} />
              <label className="block">
                <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>PO attachment</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(event) => {
                    attachPoFile(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </label>
              {form.poAttachment && (
                <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.56)", border: "1px solid rgba(255,255,255,0.82)", color: "var(--color-text-secondary)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{form.poAttachment.fileName}</span>
                    <span>{formatFileSize(form.poAttachment.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, poAttachment: undefined }))}
                    className="mt-2 text-xs font-semibold"
                    style={{ color: "#ef4444" }}
                  >
                    Remove PO attachment
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                <Field label="Street address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} required />
                <Field label="Lot number" value={form.lotNumber} onChange={(value) => setForm({ ...form, lotNumber: value })} />
              </div>
              <div className="grid grid-cols-[1fr_88px_112px] gap-3">
                <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
                <Field label="State" value={form.state} onChange={(value) => setForm({ ...form, state: value })} />
                <Field label="Zip" value={form.zip} onChange={(value) => setForm({ ...form, zip: value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Work type</span>
                  <select value={form.workType} onChange={(event) => setForm({ ...form, workType: event.target.value as WorkType })} className="mt-1 w-full rounded-xl px-3 py-2 text-sm" style={inputStyle}>
                    <option value="install">Install</option>
                    <option value="setup">Setup</option>
                    <option value="service_warranty">Service / Warranty</option>
                    <option value="repair">Repair</option>
                  </select>
                </label>
                <Field label="Appliance / model" value={form.appliance} onChange={(value) => setForm({ ...form, appliance: value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Requested date</span>
                  <input type="date" value={form.requestedDate} onChange={(event) => setForm({ ...form, requestedDate: event.target.value })} className="mt-1 w-full rounded-xl px-3 py-2 text-sm" style={inputStyle} />
                </label>
                <Field label="Requested window" value={form.requestedTimeWindow} onChange={(value) => setForm({ ...form, requestedTimeWindow: value })} />
              </div>
              <Textarea label="Access notes" value={form.accessNotes} onChange={(value) => setForm({ ...form, accessNotes: value })} />
              <Textarea label="Job notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
              <button onClick={submitRequest} disabled={saving || !form.customerName || !form.address || !form.requestedDate} className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--color-ember), #f59e0b)", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Submitting..." : "Submit Meeks Job"}
              </button>
            </div>
          )}

          {message && <p className="mt-4 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(255,106,0,0.1)", color: "var(--color-ember)", border: "1px solid rgba(255,106,0,0.2)" }}>{message}</p>}
        </div>

        <div className="rounded-[2rem] overflow-hidden" style={glassPanel}>
          <MeeksToolbar
            calendarView={calendarView}
            headerLabel={headerLabel}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            saving={saving}
            onPrev={goPrev}
            onToday={goToday}
            onNext={goNext}
            onRefresh={load}
            onViewChange={setCalendarView}
            onSearch={setSearchQuery}
            onStatus={setStatusFilter}
          />

          {loading ? (
            <div className="p-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading Meeks calendar...</div>
          ) : calendarView === "month" ? (
            <MeeksMonthView
              currentDate={currentDate}
              monthGrid={monthGrid}
              jobs={monthJobs}
              today={today}
              onSelectWeek={(date) => {
                setCurrentDate(date);
                setCalendarView("week");
              }}
              onSelectJob={setSelectedJob}
              onDelete={deleteRequest}
              saving={saving}
            />
          ) : (
            <MeeksWeekView
              weekDates={weekDates}
              jobs={weekJobs}
              today={today}
              onSelectJob={setSelectedJob}
              onDelete={deleteRequest}
              saving={saving}
            />
          )}

          <div className="border-t p-4" style={{ borderColor: "var(--color-border)" }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {calendarView === "month" ? "Jobs in this month" : "Jobs this week"}
                </h3>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Showing {visibleListJobs.length} of {jobs.length} Meeks job{jobs.length === 1 ? "" : "s"}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <Legend color="#ff6a00" label="Requested" />
                <Legend color="#2563eb" label="Scheduled" />
                <Legend color="#12b76a" label="Completed" />
              </div>
            </div>

            {visibleListJobs.length === 0 ? (
              <div className="rounded-2xl p-8 text-center text-sm" style={{ background: "rgba(255,255,255,0.54)", border: "1px dashed var(--color-border)", color: "var(--color-text-muted)" }}>
                No Meeks jobs match this view.
              </div>
            ) : (
              <div className={internal ? "grid gap-3 xl:grid-cols-2" : "grid gap-3 lg:grid-cols-2"}>
                {visibleListJobs.map((job) => (
                  <MeeksJobCard
                    key={job.id}
                    job={job}
                    internal={internal}
                    techs={techs}
                    move={moveForms[job.id]}
                    saving={saving}
                    onMoveChange={(patch) => updateMove(job.id, patch)}
                    onMove={() => moveToMainCalendar(job)}
                    onDelete={() => deleteRequest(job)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedJob && (
        <MeeksJobModal
          job={selectedJob}
          internal={internal}
          techs={techs}
          move={moveForms[selectedJob.id]}
          saving={saving}
          onMoveChange={(patch) => updateMove(selectedJob.id, patch)}
          onMove={() => moveToMainCalendar(selectedJob)}
          onDelete={() => deleteRequest(selectedJob)}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </section>
  );
}

function MeeksToolbar({
  calendarView,
  headerLabel,
  searchQuery,
  statusFilter,
  saving,
  onPrev,
  onToday,
  onNext,
  onRefresh,
  onViewChange,
  onSearch,
  onStatus,
}: {
  calendarView: CalendarView;
  headerLabel: string;
  searchQuery: string;
  statusFilter: "all" | MeeksStatus;
  saving: boolean;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  onRefresh: () => void;
  onViewChange: (view: CalendarView) => void;
  onSearch: (value: string) => void;
  onStatus: (value: "all" | MeeksStatus) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Meeks Schedule</h3>
          <div className="flex items-center gap-1">
            <button onClick={onPrev} className="rounded px-2 py-1 transition-colors hover:bg-black/5" style={{ border: "1px solid var(--color-border)" }} aria-label="Previous">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={onToday} className="rounded px-3 py-1 text-xs font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Today</button>
            <button onClick={onNext} className="rounded px-2 py-1 transition-colors hover:bg-black/5" style={{ border: "1px solid var(--color-border)" }} aria-label="Next">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{headerLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg" style={{ border: "1px solid var(--color-border)" }}>
            <button onClick={() => onViewChange("week")} className="px-3 py-1.5 text-xs font-semibold transition-colors" style={{ background: calendarView === "week" ? "#2563EB" : "var(--color-surface-2)", color: calendarView === "week" ? "#fff" : "var(--color-text-secondary)" }}>Week</button>
            <button onClick={() => onViewChange("month")} className="px-3 py-1.5 text-xs font-semibold transition-colors" style={{ background: calendarView === "month" ? "#2563EB" : "var(--color-surface-2)", color: calendarView === "month" ? "#fff" : "var(--color-text-secondary)" }}>Month</button>
          </div>
          <button onClick={onRefresh} disabled={saving} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", opacity: saving ? 0.65 : 1 }}>Refresh</button>
        </div>
      </div>
      <div className="grid gap-2 px-5 py-3 md:grid-cols-[1fr_180px]" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <input
          value={searchQuery}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search jobs, PO numbers, customers, addresses..."
          className="rounded-xl px-3 py-2 text-sm"
          style={inputStyle}
        />
        <select value={statusFilter} onChange={(event) => onStatus(event.target.value as "all" | MeeksStatus)} className="rounded-xl px-3 py-2 text-sm" style={inputStyle}>
          <option value="all">All jobs</option>
          <option value="requested">Requested</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
    </div>
  );
}

function MeeksWeekView({
  weekDates,
  jobs,
  today,
  onSelectJob,
  onDelete,
  saving,
}: {
  weekDates: Date[];
  jobs: MeeksJob[];
  today: string;
  onSelectJob: (job: MeeksJob) => void;
  onDelete: (job: MeeksJob) => void;
  saving: boolean;
}) {
  const jobLayouts = useMemo(() => {
    const layouts = new Map<string, Map<string, MeeksJobLayout>>();
    for (const date of weekDates) {
      const iso = isoDate(date);
      layouts.set(iso, layoutOverlappingMeeksJobs(jobs.filter((job) => calendarDate(job) === iso)));
    }
    return layouts;
  }, [jobs, weekDates]);

  const concurrentJobCount = useMemo(() => {
    let count = 0;
    jobLayouts.forEach((dayLayouts) => {
      dayLayouts.forEach((layout) => {
        if (layout.columns > 1) count += 1;
      });
    });
    return count;
  }, [jobLayouts]);

  return (
    <div>
      {concurrentJobCount > 0 && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-2.5" style={{ borderColor: "rgba(37,99,235,0.14)", background: "rgba(37,99,235,0.06)" }}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold" style={{ background: "rgba(37,99,235,0.12)", color: "#2563eb" }}>II</span>
            <p className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              {concurrentJobCount} concurrent appointment{concurrentJobCount === 1 ? "" : "s"} shown side by side.
            </p>
          </div>
          <span className="hidden text-[11px] sm:inline" style={{ color: "var(--color-text-muted)" }}>Select any appointment for full details</span>
        </div>
      )}
      <div className="overflow-auto">
      <div className="min-w-[1180px]">
        <div className="grid sticky top-0 z-10" style={{ gridTemplateColumns: "70px repeat(7, 1fr)", background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
          <div className="sticky left-0 z-20" style={{ background: "var(--color-surface-1)" }} />
          {weekDates.map((date, index) => {
            const iso = isoDate(date);
            const isToday = iso === today;
            const dayJobs = jobs.filter((job) => calendarDate(job) === iso);
            return (
              <div key={iso} className="border-l py-2 text-center" style={{ borderColor: "var(--color-border)", background: isToday ? "rgba(37,99,235,0.06)" : index === 0 || index === 6 ? "rgba(0,0,0,0.02)" : undefined }}>
                <div className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>{DAY_NAMES_FULL[index]}</div>
                <div className="mt-0.5 flex items-center justify-center gap-1.5">
                  <span className={`text-lg font-bold leading-none ${isToday ? "flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white" : ""}`} style={{ color: isToday ? undefined : "var(--color-text-primary)" }}>{date.getDate()}</span>
                </div>
                <div className="mt-1 flex items-center justify-center gap-2">
                  {dayJobs.length ? <span className="text-[10px] font-medium" style={{ color: "#2563EB" }}>{dayJobs.length} jobs</span> : <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>No jobs</span>}
                </div>
              </div>
            );
          })}
        </div>

        {HOURS.map((hour) => (
          <div key={hour} className="grid" style={{ gridTemplateColumns: "70px repeat(7, 1fr)", minHeight: 90, borderBottom: "1px solid var(--color-border)" }}>
            <div className="sticky left-0 z-[5] pr-3 pt-2 text-right text-xs font-medium" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-1)" }}>
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
            </div>
            {weekDates.map((date, dayIndex) => {
              const iso = isoDate(date);
              const isToday = iso === today;
              const isWeekend = dayIndex === 0 || dayIndex === 6;
              const dayJobs = jobs
                .filter((job) => calendarDate(job) === iso && Math.floor(toHourFloat(calendarStart(job))) === hour)
                .sort((a, b) => calendarStart(a).localeCompare(calendarStart(b)));
              return (
                <div key={iso} className="relative border-l" style={{ borderColor: "var(--color-border)", background: isToday ? "rgba(37,99,235,0.03)" : isWeekend ? "rgba(0,0,0,0.015)" : undefined }}>
                  {dayJobs.map((job) => {
                    const start = toHourFloat(calendarStart(job));
                    const end = Math.max(start + 0.5, toHourFloat(calendarEnd(job)));
                    const duration = Math.max(0.5, end - start);
                    const color = STATUS_COLORS[job.status] || "#2563eb";
                    const layout = jobLayouts.get(iso)?.get(job.id) || { column: 0, columns: 1 };
                    const laneGap = 5;
                    const totalGap = (layout.columns - 1) * laneGap;
                    const laneWidth = `calc(${100 / layout.columns}% - ${(8 + totalGap) / layout.columns}px)`;
                    const laneLeft = `calc(${(layout.column * 100) / layout.columns}% + ${4 + (layout.column * laneGap) - ((layout.column * (8 + totalGap)) / layout.columns)}px)`;
                    const compact = layout.columns > 1;
                    return (
                      <div
                        key={job.id}
                        onClick={() => onSelectJob(job)}
                        className="group absolute cursor-pointer overflow-hidden rounded-lg"
                        style={{
                          top: ((start - hour) * 90) + 2,
                          left: laneLeft,
                          width: laneWidth,
                          height: Math.max(duration * 90 - 4, 42),
                          background: "var(--color-surface-1)",
                          border: `1px solid ${job.priority === "urgent" || job.priority === "high" ? "#F59E0B" : "var(--color-border)"}`,
                          borderLeft: `4px solid ${color}`,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                        }}
                        title={`${job.requestNumber}\n${job.customerName}\n${fullAddress(job)}`}
                      >
                          <div className="flex h-full min-w-0 flex-col px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-[11px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                              {compact ? formatCompactTime(calendarStart(job)) : formatTime(calendarStart(job))}
                            </span>
                          </div>
                          <div className={compact ? "mt-0.5 line-clamp-2 break-words text-[10px] font-semibold leading-3" : "mt-0.5 truncate text-xs font-semibold"} style={{ color: "var(--color-text-primary)" }}>{job.customerName}</div>
                          {!compact && (
                            <div className="truncate text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                              {WORK_TYPE_LABELS[job.workType]}{job.appliance ? ` - ${job.appliance}` : ""}
                            </div>
                          )}
                          {!compact && (job.poNumber || job.lotNumber) && duration >= 1 && <div className="mt-auto truncate text-[10px]" style={{ color: "var(--color-ember)" }}>{[job.poNumber ? `PO ${job.poNumber}` : "", job.lotNumber ? `Lot ${job.lotNumber}` : ""].filter(Boolean).join(" · ")}</div>}
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(job);
                          }}
                          disabled={saving}
                          className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded text-[10px] opacity-0 transition-opacity hover:bg-red-500/20 group-hover:opacity-70 focus:opacity-70 disabled:opacity-30"
                          style={{ color: "var(--color-text-muted)" }}
                          title="Delete Meeks request"
                        >
                          x
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function MeeksMonthView({
  currentDate,
  monthGrid,
  jobs,
  today,
  onSelectWeek,
  onSelectJob,
  onDelete,
  saving,
}: {
  currentDate: Date;
  monthGrid: Date[][];
  jobs: MeeksJob[];
  today: string;
  onSelectWeek: (date: Date) => void;
  onSelectJob: (job: MeeksJob) => void;
  onDelete: (job: MeeksJob) => void;
  saving: boolean;
}) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES_SHORT.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>{day}</div>
        ))}
      </div>
      {monthGrid.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7" style={{ minHeight: 120 }}>
          {week.map((date, dayIndex) => {
            const iso = isoDate(date);
            const isCurrentMonth = date.getMonth() === currentDate.getMonth();
            const isToday = iso === today;
            const dayJobs = jobs.filter((job) => calendarDate(job) === iso).sort((a, b) => calendarStart(a).localeCompare(calendarStart(b)));
            return (
              <div
                key={iso}
                onClick={() => onSelectWeek(new Date(date))}
                className="cursor-pointer border-l border-t p-1.5 transition-colors hover:bg-black/[0.03]"
                style={{
                  borderColor: "var(--color-border)",
                  background: isToday ? "rgba(37,99,235,0.06)" : undefined,
                  opacity: isCurrentMonth ? 1 : 0.4,
                  borderRight: dayIndex === 6 ? "1px solid var(--color-border)" : undefined,
                  borderBottom: weekIndex === monthGrid.length - 1 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className={`text-xs font-semibold leading-none ${isToday ? "flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white" : ""}`} style={{ color: isToday ? undefined : "var(--color-text-primary)" }}>{date.getDate()}</span>
                  {dayJobs.length > 0 && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>{dayJobs.length}</span>}
                </div>
                <div className="space-y-0.5">
                  {dayJobs.slice(0, 4).map((job) => (
                    <div
                      key={job.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectJob(job);
                      }}
                      className="group flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-tight"
                      style={{ background: `${STATUS_COLORS[job.status]}18`, borderLeft: `3px solid ${STATUS_COLORS[job.status]}` }}
                    >
                      <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{formatTime(calendarStart(job)).replace(/ (AM|PM)/, "")}</span>
                      <span className="truncate" style={{ color: "var(--color-text-secondary)" }}>{job.customerName}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(job);
                        }}
                        disabled={saving}
                        className="ml-auto hidden px-1 text-[10px] group-hover:inline"
                        style={{ color: "#ef4444", opacity: saving ? 0.5 : 1 }}
                        title="Delete Meeks request"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {dayJobs.length > 4 && <div className="px-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>+{dayJobs.length - 4} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MeeksJobCard({
  job,
  internal,
  techs,
  move,
  saving,
  onMoveChange,
  onMove,
  onDelete,
}: {
  job: MeeksJob;
  internal: boolean;
  techs: Tech[];
  move?: { scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] };
  saving: boolean;
  onMoveChange: (patch: Partial<{ scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] }>) => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const tone = statusTone(job.status);
  const photos = job.linkedJob?.photos || [];
  const techNames = (job.linkedJob?.assignedTechs || job.assignedTechs || []).map((tech) => tech.name).join(", ");
  return (
    <article className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 12px 34px rgba(36,56,92,0.08)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: tone.bg, color: tone.color }}>{tone.label}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{job.requestNumber}</span>
            {job.poNumber && <span className="text-[10px] font-semibold" style={{ color: "var(--color-ember)" }}>PO {job.poNumber}</span>}
            {job.poAttachment && <span className="text-[10px] font-semibold" style={{ color: "#2563eb" }}>PO file</span>}
            {job.lotNumber && <span className="text-[10px] font-semibold" style={{ color: "var(--color-ember)" }}>Lot {job.lotNumber}</span>}
            {job.linkedJobNumber && <span className="text-[10px] font-semibold" style={{ color: "#2563eb" }}>{job.linkedJobNumber}</span>}
          </div>
          <h4 className="mt-2 text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>{job.customerName}</h4>
          <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>{WORK_TYPE_LABELS[job.workType]}{job.appliance ? ` - ${job.appliance}` : ""}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{fullAddress(job)}</p>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--color-text-muted)" }}>
          <div>{formatDate(calendarDate(job))}</div>
          <div>{job.scheduledTimeStart ? `${formatTime(job.scheduledTimeStart)} - ${formatTime(job.scheduledTimeEnd)}` : job.requestedTimeWindow || "Requested"}</div>
        </div>
      </div>

      <JobDetails job={job} techNames={techNames} photos={photos} />

      {internal && job.status === "requested" && (
        <MoveToCalendarControls
          techs={techs}
          move={move}
          requestedDate={job.requestedDate}
          saving={saving}
          onMoveChange={onMoveChange}
          onMove={onMove}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {job.linkedJobId && (
          <Link href={`/tech/job/${job.linkedJobId}`} className="inline-flex rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.2)" }}>
            Open tech job
          </Link>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className="inline-flex rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.18)", opacity: saving ? 0.65 : 1 }}
        >
          Delete request
        </button>
      </div>
    </article>
  );
}

function JobDetails({ job, techNames, photos }: { job: MeeksJob; techNames: string; photos: NonNullable<MeeksJob["linkedJob"]>["photos"] }) {
  return (
    <>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2" style={{ color: "var(--color-text-secondary)" }}>
        {job.customerPhone && <a href={`tel:${job.customerPhone}`} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.56)" }}>{job.customerPhone}</a>}
        {job.customerEmail && <a href={`mailto:${job.customerEmail}`} className="rounded-xl px-3 py-2 truncate" style={{ background: "rgba(255,255,255,0.56)" }}>{job.customerEmail}</a>}
      </div>

      {job.poAttachment && (
        <a
          href={job.poAttachment.storageId
            ? `/api/meeks/attachments/${job.poAttachment.storageId}`
            : job.poAttachment.dataUrl}
          download={job.poAttachment.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.18)" }}
        >
          PO attachment: {job.poAttachment.fileName} {formatFileSize(job.poAttachment.size) ? `(${formatFileSize(job.poAttachment.size)})` : ""}
        </a>
      )}

      {(job.notes || job.accessNotes) && (
        <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "rgba(255,255,255,0.5)", color: "var(--color-text-secondary)", border: "1px solid rgba(255,255,255,0.74)" }}>
          {job.accessNotes && <p><strong>Access:</strong> {job.accessNotes}</p>}
          {job.notes && <p className="mt-1"><strong>Notes:</strong> {job.notes}</p>}
        </div>
      )}

      {techNames && <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>Assigned techs: <strong>{techNames}</strong></p>}

      {job.status === "completed" && (
        <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(18,183,106,0.08)", border: "1px solid rgba(18,183,106,0.18)" }}>
          <p className="text-xs font-semibold" style={{ color: "#12b76a" }}>Completed {job.linkedJob?.completedAt ? new Date(job.linkedJob.completedAt).toLocaleString() : ""}</p>
          {job.linkedJob?.notes && <p className="mt-2 whitespace-pre-line text-xs" style={{ color: "var(--color-text-secondary)" }}>{job.linkedJob.notes}</p>}
          {photos && photos.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.slice(0, 6).map((photo) => (
                <a key={photo.id} href={photo.uri || "#"} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-xl" style={{ background: "rgba(255,255,255,0.72)" }}>
                  {photo.uri ? <img src={photo.uri} alt={photo.label || photo.caption || "Job photo"} className="h-full w-full object-cover" /> : null}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MoveToCalendarControls({
  techs,
  move,
  requestedDate,
  saving,
  onMoveChange,
  onMove,
}: {
  techs: Tech[];
  move?: { scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] };
  requestedDate: string;
  saving: boolean;
  onMoveChange: (patch: Partial<{ scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] }>) => void;
  onMove: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl p-3" style={{ background: "rgba(247,250,255,0.72)", border: "1px solid var(--color-border)" }}>
      <div className="grid grid-cols-3 gap-2">
        <input type="date" value={move?.scheduledDate || requestedDate} onChange={(event) => onMoveChange({ scheduledDate: event.target.value })} className="rounded-xl px-2 py-2 text-xs" style={inputStyle} />
        <TimeSelect value={move?.scheduledTimeStart || "09:00"} onChange={(value) => onMoveChange({ scheduledTimeStart: value })} className="rounded-xl px-2 py-2 text-xs" style={inputStyle} />
        <TimeSelect value={move?.scheduledTimeEnd || "11:00"} onChange={(value) => onMoveChange({ scheduledTimeEnd: value })} className="rounded-xl px-2 py-2 text-xs" style={inputStyle} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {techs.map((tech) => {
          const selected = (move?.assignedTechIds || []).includes(tech.id);
          return (
            <button
              key={tech.id}
              type="button"
              onClick={() => {
                const ids = move?.assignedTechIds || [];
                onMoveChange({ assignedTechIds: selected ? ids.filter((id) => id !== tech.id) : [...ids, tech.id] });
              }}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: selected ? tech.color : "rgba(255,255,255,0.68)",
                color: selected ? "white" : "var(--color-text-secondary)",
                border: `1px solid ${selected ? tech.color : "var(--color-border)"}`,
              }}
            >
              {tech.name}
            </button>
          );
        })}
      </div>
      <button onClick={onMove} disabled={saving} className="mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold text-white" style={{ background: "#2563eb", opacity: saving ? 0.7 : 1 }}>
        Move to Main Calendar
      </button>
    </div>
  );
}

function MeeksJobModal({
  job,
  internal,
  techs,
  move,
  saving,
  onMoveChange,
  onMove,
  onDelete,
  onClose,
}: {
  job: MeeksJob;
  internal: boolean;
  techs: Tech[];
  move?: { scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] };
  saving: boolean;
  onMoveChange: (patch: Partial<{ scheduledDate: string; scheduledTimeStart: string; scheduledTimeEnd: string; assignedTechIds: string[] }>) => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const tone = statusTone(job.status);
  const photos = job.linkedJob?.photos || [];
  const techNames = (job.linkedJob?.assignedTechs || job.assignedTechs || []).map((tech) => tech.name).join(", ");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", boxShadow: "0 26px 90px rgba(15,23,42,0.28)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: tone.bg, color: tone.color }}>{tone.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{job.requestNumber}</span>
              {job.poNumber && <span className="text-[10px] font-semibold" style={{ color: "var(--color-ember)" }}>PO {job.poNumber}</span>}
              {job.poAttachment && <span className="text-[10px] font-semibold" style={{ color: "#2563eb" }}>PO file</span>}
              {job.lotNumber && <span className="text-[10px] font-semibold" style={{ color: "var(--color-ember)" }}>Lot {job.lotNumber}</span>}
            </div>
            <h3 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>{job.customerName}</h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{WORK_TYPE_LABELS[job.workType]}{job.appliance ? ` - ${job.appliance}` : ""}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{formatDate(calendarDate(job))} · {job.scheduledTimeStart ? `${formatTime(job.scheduledTimeStart)} - ${formatTime(job.scheduledTimeEnd)}` : job.requestedTimeWindow || "Requested"}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Close</button>
        </div>
        <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.56)", color: "var(--color-text-secondary)" }}>{fullAddress(job)}</p>
        <JobDetails job={job} techNames={techNames} photos={photos} />
        {internal && job.status === "requested" && (
          <MoveToCalendarControls techs={techs} move={move} requestedDate={job.requestedDate} saving={saving} onMoveChange={onMoveChange} onMove={onMove} />
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onDelete} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.18)", opacity: saving ? 0.65 : 1 }}>
            Delete request
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.86)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>{label}{required ? " *" : ""}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl px-3 py-2 text-sm" style={inputStyle} />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-xl px-3 py-2 text-sm" style={inputStyle} />
    </label>
  );
}

const glassPanel = {
  background: "rgba(255,255,255,0.66)",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "0 24px 70px rgba(35,55,90,0.1)",
  backdropFilter: "blur(26px)",
};

const inputStyle = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
};
