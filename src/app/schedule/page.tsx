"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import TimeSelect from "@/components/scheduling/TimeSelect";

type ViewMode = "master" | "tech";
type CalendarView = "week" | "month";

interface Tech {
  id: string;
  name: string;
  color: string;
  initials: string;
  active: boolean;
}

interface Job {
  id: string;
  jobNumber: string;
  title: string;
  customerName: string;
  propertyAddress: string;
  notes?: string;
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "on_hold";
  priority?: string;
  assignedTechs: Array<{ id: string; name: string; color: string }>;
}

interface CustomerLookup {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

type SelectedCustomer = { id: string; name: string; address?: string } | null;

function resolveCustomerName(
  selectedCustomer: SelectedCustomer,
  formCustomerName: string,
  customerQuery: string
) {
  return (selectedCustomer?.name || formCustomerName || customerQuery || "").trim();
}

const JOB_TYPE_OPTIONS = [
  "Service Call",
  "Gas Service",
  "Wood Fireplace Service",
  "Pellet Stove Service",
  "Chimney Repair",
  "Chimney Sweep",
  "Gas Fireplace Installation",
  "Wood Stove Installation",
  "Pellet Stove Installation",
  "Inspection & Safety Check",
  "Annual Cleaning",
  "Venting/Flue Repair",
  "Cap/Damper Repair",
  "Estimate / Consultation",
];

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am-6pm

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#2563EB",
  in_progress: "#F59E0B",
  completed: "#16A34A",
  cancelled: "#9CA3AF",
  on_hold: "#8B5CF6",
};

function getWeekDates(baseDate: Date): Date[] {
  const sunday = new Date(baseDate);
  sunday.setDate(baseDate.getDate() - baseDate.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function getMonthGrid(baseDate: Date): Date[][] {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - startOffset);

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + w * 7 + d);
      week.push(day);
    }
    weeks.push(week);
  }
  return weeks;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function todayIso() {
  return isoDate(new Date());
}

function toHourFloat(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
}

function toHHMM(hourFloat: number) {
  const h = Math.floor(hourFloat);
  const m = Math.round((hourFloat - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTime12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

function formatTimeRange(start: string, end: string) {
  return `${formatTime12(start)} – ${formatTime12(end)}`;
}

function addMinutes(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = Math.min((hours * 60) + minutes + minutesToAdd, 23 * 60 + 45);
  const nextHours = Math.floor(total / 60);
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

export default function SchedulePage() {
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("master");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [techs, setTechs] = useState<Tech[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [timeOff, setTimeOff] = useState<Array<{
    id: string;
    techId: string;
    techName?: string;
    type: string;
    startDate: string;
    endDate: string;
    reason?: string;
    status: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [focusTechId, setFocusTechId] = useState<string>("");

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [draggedDuration, setDraggedDuration] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerLookup[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    jobType: "service",
    priority: "normal",
    customerId: "",
    customerName: "",
    propertyAddress: "",
    linkedInvoiceId: "",
    linkedEstimateId: "",
    linkedDocumentNumber: "",
    notes: "",
    scheduledDate: "",
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "10:00",
    assignedTechs: [] as string[],
  });

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const monthGrid = useMemo(() => getMonthGrid(currentDate), [currentDate]);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const today = todayIso();

  // ────────────────── Data loading ──────────────────

  async function loadData() {
    setLoading(true);
    try {
      const [techRes, jobRes, torRes] = await Promise.all([
        fetch("/api/techs?activeOnly=true"),
        fetch("/api/jobs?limit=1000"),
        fetch("/api/time-off-requests?status=approved").catch(() => null),
      ]);
      const techData = await techRes.json();
      const jobData = await jobRes.json();
      const torData = torRes ? await torRes.json().catch(() => ({ requests: [] })) : { requests: [] };

      const loadedTechs: Tech[] = techData.techs || [];
      const loadedJobs: Job[] = jobData.jobs || [];

      setTechs(loadedTechs);
      setJobs(loadedJobs);
      setTimeOff(torData.requests || []);

      if (loadedTechs.length && selectedTechIds.length === 0) {
        setSelectedTechIds(loadedTechs.map((t) => t.id));
        setFocusTechId(loadedTechs[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to current hour on first week view load
  useEffect(() => {
    if (calendarView !== "week" || loading) return;
    const now = new Date();
    const currentHour = now.getHours();
    const targetHour = Math.max(7, Math.min(currentHour, 17));
    const rowIndex = targetHour - 7;
    if (scrollRef.current && rowIndex > 0) {
      scrollRef.current.scrollTop = rowIndex * 90;
    }
  }, [calendarView, loading]);

  useEffect(() => {
    if (searchParams.get("create") !== "1") return;

    const customerId = searchParams.get("customerId") || "";
    const customerName = searchParams.get("customerName") || "";
    const address = searchParams.get("address") || "";
    const title = searchParams.get("title") || "";
    const jobType = searchParams.get("jobType") || "installation";
    const scheduledDate = searchParams.get("scheduledDate") || isoDate(new Date());
    const linkedInvoiceId = searchParams.get("linkedInvoiceId") || "";
    const linkedEstimateId = searchParams.get("linkedEstimateId") || "";
    const linkedDocumentNumber = searchParams.get("linkedDocumentNumber") || "";

    setShowCreate(true);
    setSelectedCustomer(customerId || customerName ? { id: customerId, name: customerName, address } : null);
    setCustomerQuery("");
    setCurrentDate(new Date(`${scheduledDate}T00:00:00`));
    setForm((prev) => ({
      ...prev,
      title: title || prev.title,
      jobType,
      customerId,
      customerName,
      propertyAddress: address || prev.propertyAddress,
      scheduledDate,
      linkedInvoiceId,
      linkedEstimateId,
      linkedDocumentNumber,
    }));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      setCustomerLookupError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCustomerLoading(true);
      setCustomerLookupError(null);
      try {
        const res = await fetch(`/api/customer-lookup?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) {
          setCustomerResults((data.customers || []) as CustomerLookup[]);
          setCustomerLookupError(data.source === "local" ? "QuickBooks lookup unavailable, using local customers." : null);
        }
      } catch {
        if (!cancelled) setCustomerLookupError("Customer lookup failed.");
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerQuery]);

  // ────────────────── Filtered jobs ──────────────────

  const weekJobs = useMemo(() => {
    return jobs.filter((j) => {
      const d = new Date(j.scheduledDate + "T00:00:00");
      return d >= weekStart && d <= weekEnd;
    });
  }, [jobs, weekStart, weekEnd]);

  const visibleJobs = useMemo(() => {
    if (viewMode === "master") {
      return weekJobs.filter((j) => !j.assignedTechs.length || j.assignedTechs.some((t) => selectedTechIds.includes(t.id)));
    }
    if (!focusTechId) return [];
    return weekJobs.filter((j) => j.assignedTechs.some((t) => t.id === focusTechId));
  }, [weekJobs, selectedTechIds, viewMode, focusTechId]);

  // Jobs for month view — all jobs in the visible month range
  const monthJobs = useMemo(() => {
    if (calendarView !== "month") return [];
    const first = monthGrid[0][0];
    const last = monthGrid[monthGrid.length - 1][6];
    return jobs.filter((j) => {
      const d = new Date(j.scheduledDate + "T00:00:00");
      return d >= first && d <= last;
    });
  }, [jobs, monthGrid, calendarView]);

  // ────────────────── Navigation ──────────────────

  function goPrev() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - (calendarView === "month" ? 30 : 7));
    setCurrentDate(d);
  }

  function goNext() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (calendarView === "month" ? 30 : 7));
    setCurrentDate(d);
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  const headerLabel = calendarView === "month"
    ? currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // ────────────────── Tech filter ──────────────────

  function toggleTech(techId: string) {
    setSelectedTechIds((prev) =>
      prev.includes(techId) ? prev.filter((id) => id !== techId) : [...prev, techId]
    );
  }

  // ────────────────── Day stats for week view ──────────────────

  function dayStats(date: Date) {
    const iso = isoDate(date);
    const dayJobs = visibleJobs.filter((j) => j.scheduledDate === iso);
    const totalHours = dayJobs.reduce((sum, j) => {
      return sum + Math.max(0, toHourFloat(j.scheduledTimeEnd) - toHourFloat(j.scheduledTimeStart));
    }, 0);
    const techIds = new Set<string>();
    dayJobs.forEach((j) => j.assignedTechs.forEach((t) => techIds.add(t.id)));
    return { count: dayJobs.length, hours: totalHours, techCount: techIds.size };
  }

  // ────────────────── Customer helpers ──────────────────

  function customerAddressLine(c: CustomerLookup) {
    const a = c.address;
    if (!a) return "";
    return [a.line1, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" ").trim();
  }

  function applyCustomer(c: CustomerLookup) {
    const address = customerAddressLine(c);
    setSelectedCustomer({
      id: c.id,
      name: c.displayName || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
      address,
    });
    setForm((f) => ({
      ...f,
      customerId: c.id,
      customerName: c.displayName || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
      propertyAddress: address || f.propertyAddress,
    }));
    setCustomerQuery("");
    setCustomerResults([]);
    setFormErrors((prev) => ({ ...prev, customerName: "", propertyAddress: "" }));
  }

  // ────────────────── Form validation & CRUD ──────────────────

  function validateForm() {
    const errs: Record<string, string> = {};
    const customerName = resolveCustomerName(selectedCustomer, form.customerName, customerQuery);
    if (!form.title.trim()) errs.title = "Job title is required";
    if (!form.jobType.trim()) errs.jobType = "Job type is required";
    if (!customerName) errs.customerName = "Customer is required";
    if (!form.propertyAddress.trim()) errs.propertyAddress = "Property address is required";
    if (!form.scheduledDate) errs.scheduledDate = "Date is required";
    if (!form.scheduledTimeStart) errs.scheduledTimeStart = "Start time is required";
    if (!form.scheduledTimeEnd) errs.scheduledTimeEnd = "End time is required";
    if (form.scheduledTimeStart && form.scheduledTimeEnd && form.scheduledTimeEnd <= form.scheduledTimeStart) {
      errs.scheduledTimeEnd = "End time must be after start time";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function createCustomerInline() {
    const name = customerQuery.trim() || form.customerName.trim();
    if (!name) {
      setCustomerLookupError("Enter a customer name first.");
      return;
    }

    setCreatingCustomer(true);
    setCustomerLookupError(null);
    try {
      const [firstName, ...rest] = name.split(" ");
      const lastName = rest.join(" ") || "Customer";
      const payload = {
        displayName: name,
        firstName: firstName || "New",
        lastName,
        address: form.propertyAddress
          ? { line1: form.propertyAddress, city: "", state: "", zip: "" }
          : undefined,
        active: true,
      };

      let created: CustomerLookup | null = null;
      const qbRes = await fetch("/api/quickbooks/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const qbData = await qbRes.json();
      if (qbRes.ok && qbData?.customer) created = qbData.customer;

      if (!created) {
        const localRes = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const localData = await localRes.json();
        if (localRes.ok && localData?.customer) created = localData.customer;
      }

      if (created) {
        applyCustomer(created);
        setCustomerLookupError(null);
      } else {
        setCustomerLookupError("Could not create customer.");
      }
    } catch {
      setCustomerLookupError("Could not create customer.");
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function createJob() {
    if (!validateForm()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const customerName = resolveCustomerName(selectedCustomer, form.customerName, customerQuery);
      const assignedTechs = techs
        .filter((t) => form.assignedTechs.includes(t.id))
        .map((t) => ({ id: t.id, name: t.name, color: t.color }));
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          jobType: form.jobType,
          priority: form.priority,
          customerId: selectedCustomer?.id || form.customerId || undefined,
          customerName,
          propertyAddress: form.propertyAddress,
          linkedInvoiceId: form.linkedInvoiceId || undefined,
          linkedEstimateId: form.linkedEstimateId || undefined,
          linkedDocumentNumber: form.linkedDocumentNumber || undefined,
          notes: form.notes || undefined,
          scheduledDate: form.scheduledDate,
          scheduledTimeStart: form.scheduledTimeStart,
          scheduledTimeEnd: form.scheduledTimeEnd,
          assignedTechs,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Failed to add job. Please try again.");
        return;
      }

      setCurrentDate(new Date(form.scheduledDate + "T00:00:00"));
      setShowCreate(false);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setCustomerResults([]);
      setForm({
        title: "",
        jobType: "service",
        priority: "normal",
        customerId: "",
        customerName: "",
        propertyAddress: "",
        linkedInvoiceId: "",
        linkedEstimateId: "",
        linkedDocumentNumber: "",
        notes: "",
        scheduledDate: isoDate(new Date()),
        scheduledTimeStart: "09:00",
        scheduledTimeEnd: "10:00",
        assignedTechs: [],
      });
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function removeJob(id: string) {
    if (!confirm("Remove this scheduled job?")) return;
    await fetch(`/api/jobs?id=${id}`, { method: "DELETE" });
    await loadData();
  }

  async function moveJobToSlot(jobIdRaw: string, targetDate: Date, targetHour: number) {
    const jobId = (jobIdRaw || "").trim();
    if (!jobId) {
      setSaveError("Could not move job: invalid job id.");
      return;
    }

    const job = jobs.find((j) => j.id === jobId);
    const duration = job
      ? Math.max(0.5, toHourFloat(job.scheduledTimeEnd) - toHourFloat(job.scheduledTimeStart))
      : Math.max(0.5, draggedDuration || 1);

    const newStart = targetHour;
    const newEnd = Math.min(23.5, newStart + duration);

    const res = await fetch("/api/jobs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: jobId,
        scheduledDate: isoDate(targetDate),
        scheduledTimeStart: toHHMM(newStart),
        scheduledTimeEnd: toHHMM(newEnd),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(data.error || "Failed to move job. Please try again.");
      return;
    }

    await loadData();
  }

  useEffect(() => {
    if (showCreate) {
      setFormErrors({});
      setSaveError(null);
    }
    if (showCreate && !form.scheduledDate) {
      setForm((f) => ({ ...f, scheduledDate: isoDate(new Date()) }));
    }
  }, [showCreate, form.scheduledDate]);

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        {/* ── Toolbar ── */}
        <div className="px-6 py-3 flex items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Schedule</h1>
            <div className="flex items-center gap-1">
              <button onClick={goPrev} className="px-2 py-1 rounded hover:bg-black/5 transition-colors" style={{ border: "1px solid var(--color-border)" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={goToday} className="px-3 py-1 rounded text-xs font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                Today
              </button>
              <button onClick={goNext} className="px-2 py-1 rounded hover:bg-black/5 transition-colors" style={{ border: "1px solid var(--color-border)" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{headerLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Calendar view toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              <button onClick={() => setCalendarView("week")} className="px-3 py-1.5 text-xs font-semibold transition-colors" style={{ background: calendarView === "week" ? "#2563EB" : "var(--color-surface-2)", color: calendarView === "week" ? "#fff" : "var(--color-text-secondary)" }}>Week</button>
              <button onClick={() => setCalendarView("month")} className="px-3 py-1.5 text-xs font-semibold transition-colors" style={{ background: calendarView === "month" ? "#2563EB" : "var(--color-surface-2)", color: calendarView === "month" ? "#fff" : "var(--color-text-secondary)" }}>Month</button>
            </div>
            {/* Master / Tech toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              <button onClick={() => setViewMode("master")} className="px-3 py-1.5 text-xs font-semibold transition-colors" style={{ background: viewMode === "master" ? "var(--color-surface-3)" : "var(--color-surface-2)" }}>Master</button>
              <button onClick={() => setViewMode("tech")} className="px-3 py-1.5 text-xs font-semibold transition-colors" style={{ background: viewMode === "tech" ? "var(--color-surface-3)" : "var(--color-surface-2)" }}>By Tech</button>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "white" }}
            >
              + New Job
            </button>
          </div>
        </div>

        {/* ── Time-off banner: techs out in the visible week ── */}
        {(() => {
          const visibleStart = calendarView === "month" ? new Date(currentDate.getFullYear(), currentDate.getMonth(), 1) : weekStart;
          const visibleEnd = calendarView === "month" ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0) : weekEnd;
          visibleStart.setHours(0, 0, 0, 0);
          visibleEnd.setHours(23, 59, 59, 999);
          const inRange = timeOff.filter((t) => {
            const s = new Date(t.startDate); s.setHours(0, 0, 0, 0);
            const e = new Date(t.endDate); e.setHours(0, 0, 0, 0);
            return e >= visibleStart && s <= visibleEnd;
          });
          if (inRange.length === 0) return null;
          const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const TYPE_LABELS: Record<string, string> = {
            paid_vacation: "Paid PTO",
            unpaid_vacation: "Unpaid PTO",
            unpaid_appointment_time: "Appt",
          };
          return (
            <div className="px-6 py-2 flex items-start gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)", background: "rgba(248,151,31,0.06)" }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide pt-1" style={{ color: "#9a5d12" }}>Out:</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {inRange.map((t) => {
                  const tech = techs.find((x) => x.id === t.techId);
                  const name = tech?.name || t.techName || `Tech ${t.techId.slice(0, 6)}`;
                  return (
                    <span
                      key={t.id}
                      title={`${TYPE_LABELS[t.type] || t.type}: ${t.startDate} → ${t.endDate}${t.reason ? "\n" + t.reason : ""}`}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(22,163,74,0.14)", border: "1px solid rgba(22,163,74,0.4)", color: "#16A34A" }}
                    >
                      <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: tech?.color || "#16A34A" }} />
                      <span className="font-semibold">{name}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>·</span>
                      <span>{fmtDay(t.startDate)}{t.startDate !== t.endDate ? ` – ${fmtDay(t.endDate)}` : ""}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>·</span>
                      <span style={{ color: "#9a5d12" }}>{TYPE_LABELS[t.type] || t.type}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Tech filter bar ── */}
        <div className="px-6 py-2 flex items-center gap-2 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {viewMode === "master" ? (
            <>
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Techs:</span>
              {techs.map((tech) => (
                <button
                  key={tech.id}
                  onClick={() => toggleTech(tech.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    border: selectedTechIds.includes(tech.id) ? `2px solid ${tech.color}` : "1px solid var(--color-border)",
                    background: selectedTechIds.includes(tech.id) ? `${tech.color}15` : "transparent",
                    color: selectedTechIds.includes(tech.id) ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: tech.color }} />
                  {tech.name}
                </button>
              ))}
            </>
          ) : (
            <>
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Tech schedule:</span>
              <select
                value={focusTechId}
                onChange={(e) => setFocusTechId(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-3)" }}
              >
                {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
        </div>

        {saveError && (
          <div className="mx-6 mt-3 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.35)", color: "#FF204E" }}>
            {saveError}
          </div>
        )}

        {/* ════════════════════ CALENDAR BODY ════════════════════ */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center" style={{ color: "var(--color-text-muted)" }}>Loading schedule...</div>
          ) : calendarView === "month" ? (
            /* ─────────── MONTH VIEW ─────────── */
            <div className="p-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES_SHORT.map((d) => (
                  <div key={d} className="text-center text-xs font-semibold py-2" style={{ color: "var(--color-text-muted)" }}>{d}</div>
                ))}
              </div>
              {/* Weeks */}
              {monthGrid.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7" style={{ minHeight: 120 }}>
                  {week.map((date, di) => {
                    const iso = isoDate(date);
                    const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                    const isToday = iso === today;
                    const dayJobs = monthJobs
                      .filter((j) => j.scheduledDate === iso)
                      .sort((a, b) => a.scheduledTimeStart.localeCompare(b.scheduledTimeStart));

                    return (
                      <div
                        key={di}
                        onClick={() => { setCurrentDate(new Date(date)); setCalendarView("week"); }}
                        className="border-t border-l p-1.5 cursor-pointer hover:bg-black/[0.03] transition-colors"
                        style={{
                          borderColor: "var(--color-border)",
                          background: isToday ? "rgba(37,99,235,0.06)" : undefined,
                          opacity: isCurrentMonth ? 1 : 0.4,
                          borderRight: di === 6 ? "1px solid var(--color-border)" : undefined,
                          borderBottom: wi === monthGrid.length - 1 ? "1px solid var(--color-border)" : undefined,
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-xs font-semibold leading-none ${isToday ? "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center" : ""}`}
                            style={{ color: isToday ? undefined : "var(--color-text-primary)" }}
                          >
                            {date.getDate()}
                          </span>
                          {dayJobs.length > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>
                              {dayJobs.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {dayJobs.map((job) => (
                            <div
                              key={job.id}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight truncate"
                              style={{
                                background: `${job.assignedTechs[0]?.color || "#2563EB"}18`,
                                borderLeft: `3px solid ${job.assignedTechs[0]?.color || "#2563EB"}`,
                              }}
                            >
                              <span className="font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                                {formatTime12(job.scheduledTimeStart).replace(/ (AM|PM)/, "")}
                              </span>
                              <span className="truncate" style={{ color: "var(--color-text-secondary)" }}>
                                {job.customerName}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            /* ─────────── WEEK VIEW ─────────── */
            <div className="min-w-[980px]">
              {/* Day headers */}
              <div className="grid sticky top-0 z-10" style={{ gridTemplateColumns: "70px repeat(7, 1fr)", background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
                <div />
                {weekDates.map((date, i) => {
                  const iso = isoDate(date);
                  const isToday = iso === today;
                  const isWeekend = i === 0 || i === 6;
                  const stats = dayStats(date);
                  return (
                    <div
                      key={i}
                      className="text-center py-2 border-l"
                      style={{
                        borderColor: "var(--color-border)",
                        background: isToday ? "rgba(37,99,235,0.06)" : isWeekend ? "rgba(0,0,0,0.02)" : undefined,
                      }}
                    >
                      <div className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
                        {DAY_NAMES_FULL[i]}
                      </div>
                      <div className="flex items-center justify-center gap-1.5 mt-0.5">
                        <span
                          className={`text-lg font-bold leading-none ${isToday ? "bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center" : ""}`}
                          style={{ color: isToday ? undefined : "var(--color-text-primary)" }}
                        >
                          {date.getDate()}
                        </span>
                      </div>
                      {/* Day stats */}
                      <div className="flex items-center justify-center gap-2 mt-1">
                        {stats.count > 0 ? (
                          <>
                            <span className="text-[10px] font-medium" style={{ color: "#2563EB" }}>{stats.count} jobs</span>
                            <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{stats.hours.toFixed(1)}h</span>
                          </>
                        ) : (
                          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>No jobs</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Time grid rows */}
              {HOURS.map((hour) => (
                <div key={hour} className="grid" style={{ gridTemplateColumns: "70px repeat(7, 1fr)", minHeight: 90, borderBottom: "1px solid var(--color-border)" }}>
                  <div className="text-xs pt-2 pr-3 text-right font-medium" style={{ color: "var(--color-text-muted)" }}>
                    {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
                  </div>
                  {weekDates.map((d, dayIndex) => {
                    const iso = isoDate(d);
                    const isToday = iso === today;
                    const isWeekend = dayIndex === 0 || dayIndex === 6;
                    const dayJobs = visibleJobs.filter((j) => {
                      const jd = new Date(j.scheduledDate + "T00:00:00");
                      return jd.toDateString() === d.toDateString() && Math.floor(toHourFloat(j.scheduledTimeStart)) === hour;
                    });

                    return (
                      <div
                        key={dayIndex}
                        className="relative border-l"
                        style={{
                          borderColor: "var(--color-border)",
                          background: dragOverSlot === `${d.toDateString()}-${hour}`
                            ? "rgba(37,99,235,0.10)"
                            : isToday
                              ? "rgba(37,99,235,0.03)"
                              : isWeekend
                                ? "rgba(0,0,0,0.015)"
                                : undefined,
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverSlot(`${d.toDateString()}-${hour}`);
                        }}
                        onDragLeave={() => setDragOverSlot(null)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          const droppedId = (e.dataTransfer.getData("text/plain") || draggedJobId || "").trim();
                          setDragOverSlot(null);
                          if (!droppedId) return;
                          await moveJobToSlot(droppedId, d, hour);
                          setDraggedJobId(null);
                          setDraggedDuration(null);
                        }}
                      >
                        {dayJobs.map((job) => {
                          const start = toHourFloat(job.scheduledTimeStart);
                          const end = toHourFloat(job.scheduledTimeEnd);
                          const duration = Math.max(0.5, end - start);
                          const techColor = job.assignedTechs[0]?.color || "#2563EB";
                          const isHighPriority = job.priority === "high" || job.priority === "urgent";

                          return (
                            <div
                              key={job.id}
                              draggable
                              onDragStart={(e) => {
                                setSaveError(null);
                                setDraggedJobId(job.id);
                                setDraggedDuration(duration);
                                e.dataTransfer.setData("text/plain", job.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggedJobId(null);
                                setDraggedDuration(null);
                                setDragOverSlot(null);
                              }}
                              onClick={() => setSelectedJob(job)}
                              className="absolute left-1 right-1 rounded-lg cursor-pointer overflow-hidden"
                              style={{
                                top: 2,
                                height: Math.max(duration * 90 - 4, 42),
                                background: "var(--color-surface-1)",
                                border: `1px solid ${isHighPriority ? "#F59E0B" : "var(--color-border)"}`,
                                borderLeft: `4px solid ${isHighPriority ? "#F59E0B" : techColor}`,
                                opacity: draggedJobId === job.id ? 0.6 : 1,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                              }}
                              title={`${job.title}\n${job.customerName}\n${job.propertyAddress}\n${formatTimeRange(job.scheduledTimeStart, job.scheduledTimeEnd)}`}
                            >
                              <div className="px-2 py-1.5 h-full flex flex-col">
                                {/* Time + status */}
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[job.status] || "#9CA3AF" }} />
                                  <span className="text-[11px] font-bold truncate" style={{ color: "var(--color-text-primary)" }}>
                                    {formatTime12(job.scheduledTimeStart)}
                                  </span>
                                </div>
                                {/* Customer */}
                                <div className="text-xs font-semibold truncate mt-0.5" style={{ color: "var(--color-text-primary)" }}>
                                  {job.customerName}
                                </div>
                                {/* Title */}
                                <div className="text-[11px] truncate" style={{ color: "var(--color-text-secondary)" }}>
                                  {job.title}
                                </div>
                                {/* Address — only show if card is tall enough */}
                                {duration >= 1 && (
                                  <div className="text-[10px] truncate mt-auto" style={{ color: "var(--color-text-muted)" }}>
                                    {job.propertyAddress}
                                  </div>
                                )}
                                {/* Tech pills */}
                                {duration >= 1.5 && job.assignedTechs.length > 0 && (
                                  <div className="flex gap-1 mt-1">
                                    {job.assignedTechs.map((t) => (
                                      <span key={t.id} className="text-[9px] font-medium px-1.5 py-0.5 rounded-full text-white" style={{ background: t.color }}>
                                        {t.name.split(" ")[0]}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* Remove button */}
                              <button
                                onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
                                disabled={draggedJobId !== null}
                                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded text-[10px] transition-opacity hover:bg-red-500/20"
                                style={{
                                  color: "var(--color-text-muted)",
                                  opacity: draggedJobId ? 0.3 : 0.6,
                                  pointerEvents: draggedJobId ? "none" : "auto",
                                }}
                                title="Remove job"
                              >
                                ✕
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
          )}
        </div>
      </div>

      {/* ════════════════════ CREATE JOB MODAL ════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Add Scheduled Job</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              {saveError && (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.35)", color: "#FF204E" }}>
                  {saveError}
                </div>
              )}
              <div>
                <input
                  placeholder="Search customers..."
                  value={selectedCustomer?.name || customerQuery}
                  onChange={(e) => {
                    setSelectedCustomer(null);
                    setCustomerQuery(e.target.value);
                    setForm((f) => ({ ...f, customerId: "", customerName: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.customerName ? "#FF204E" : "var(--color-border)"}` }}
                />
                {formErrors.customerName && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.customerName}</p>}
                {customerLoading && <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Looking up customers...</p>}
                {customerLookupError && <p className="text-xs mt-1" style={{ color: "#f8971f" }}>{customerLookupError}</p>}
                {customerResults.length > 0 && !selectedCustomer && (
                  <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    {customerResults.slice(0, 6).map((c) => (
                      <button key={c.id} type="button" onClick={() => applyCustomer(c)} className="w-full text-left px-3 py-2 text-sm" style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <div className="font-medium">{c.displayName}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{customerAddressLine(c)}</div>
                      </button>
                    ))}
                  </div>
                )}
                {!customerLoading && customerQuery.trim().length >= 2 && customerResults.length === 0 && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No matching customer found.</p>
                    <button type="button" onClick={createCustomerInline} disabled={creatingCustomer} className="px-2 py-1 rounded text-xs font-semibold" style={{ background: "#2563EB", color: "white" }}>
                      {creatingCustomer ? "Creating..." : "Create Customer"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <input placeholder="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.title ? "#FF204E" : "var(--color-border)"}` }} />
                {formErrors.title && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.title}</p>}
              </div>
              <div>
                <input placeholder="Property address" value={form.propertyAddress} onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.propertyAddress ? "#FF204E" : "var(--color-border)"}` }} />
                {formErrors.propertyAddress && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.propertyAddress}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <select value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.jobType ? "#FF204E" : "var(--color-border)"}` }}>
                    <optgroup label="Service">
                      <option value="service">Gas Service</option>
                      <option value="wood-service">Wood Fireplace Service</option>
                      <option value="pellet-service">Pellet Stove Service</option>
                    </optgroup>
                    <optgroup label="Installation">
                      <option value="installation">Fireplace Installation</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="inspection">Inspection</option>
                      <option value="cleaning">Chimney Sweep / Cleaning</option>
                      <option value="repair">Repair</option>
                      <option value="estimate">Estimate / Consultation</option>
                    </optgroup>
                  </select>
                  {formErrors.jobType && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.jobType}</p>}
                </div>
                <div>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.scheduledDate ? "#FF204E" : "var(--color-border)"}` }} />
                  {formErrors.scheduledDate && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.scheduledDate}</p>}
                </div>
                <div>
                  <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={1} className="w-full px-3 py-2 rounded-lg resize-none" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <TimeSelect value={form.scheduledTimeStart} onChange={(value) => setForm({ ...form, scheduledTimeStart: value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.scheduledTimeStart ? "#FF204E" : "var(--color-border)"}` }} />
                  {formErrors.scheduledTimeStart && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.scheduledTimeStart}</p>}
                </div>
                <div>
                  <TimeSelect value={form.scheduledTimeEnd} onChange={(value) => setForm({ ...form, scheduledTimeEnd: value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.scheduledTimeEnd ? "#FF204E" : "var(--color-border)"}` }} />
                  {formErrors.scheduledTimeEnd && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.scheduledTimeEnd}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Duration</span>
                {[60, 120, 180].map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setForm({ ...form, scheduledTimeEnd: addMinutes(form.scheduledTimeStart, minutes) })}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold"
                    style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                  >
                    {minutes === 60 ? "1 hr" : minutes === 120 ? "2 hr" : "3 hr"}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  {techs.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                      <input
                        type="checkbox"
                        checked={form.assignedTechs.includes(t.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            assignedTechs: e.target.checked
                              ? [...form.assignedTechs, t.id]
                              : form.assignedTechs.filter((id) => id !== t.id),
                          })
                        }
                      />
                      <span className="text-sm">{t.name}</span>
                    </label>
                  ))}
                </div>
                {formErrors.assignedTechs && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.assignedTechs}</p>}
              </div>
            </div>
            <button onClick={createJob} disabled={saving} className="w-full mt-4 py-2.5 rounded-lg text-white font-semibold" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)" }}>
              {saving ? "Saving..." : "Create Job"}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════ JOB DETAIL MODAL ════════════════════ */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedJob(null)}>
          <div
            className="w-full max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto"
            style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with color bar */}
            <div className="rounded-t-2xl px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)", borderLeft: `5px solid ${selectedJob.assignedTechs[0]?.color || "#2563EB"}` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{selectedJob.title}</h2>
                  <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{selectedJob.customerName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      background: `${STATUS_COLORS[selectedJob.status] || "#9CA3AF"}20`,
                      color: STATUS_COLORS[selectedJob.status] || "#9CA3AF",
                    }}
                  >
                    {selectedJob.status === "in_progress" ? "In Progress" : selectedJob.status === "on_hold" ? "On Hold" : selectedJob.status.charAt(0).toUpperCase() + selectedJob.status.slice(1)}
                  </span>
                  <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Schedule */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(37,99,235,0.1)" }}>
                  <svg className="w-5 h-5" style={{ color: "#2563EB" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {new Date(selectedJob.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {formatTimeRange(selectedJob.scheduledTimeStart, selectedJob.scheduledTimeEnd)}
                    {" · "}
                    {(() => {
                      const dur = toHourFloat(selectedJob.scheduledTimeEnd) - toHourFloat(selectedJob.scheduledTimeStart);
                      const hrs = Math.floor(dur);
                      const mins = Math.round((dur - hrs) * 60);
                      return hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ""}` : `${mins}m`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Address */}
              {selectedJob.propertyAddress && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(245,158,11,0.1)" }}>
                    <svg className="w-5 h-5" style={{ color: "#F59E0B" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>{selectedJob.propertyAddress}</p>
                    <a
                      href={`https://maps.apple.com/?q=${encodeURIComponent(selectedJob.propertyAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium mt-0.5 inline-block"
                      style={{ color: "#2563EB" }}
                    >
                      Open in Maps
                    </a>
                  </div>
                </div>
              )}

              {/* Assigned Techs */}
              {selectedJob.assignedTechs.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(22,163,74,0.1)" }}>
                    <svg className="w-5 h-5" style={{ color: "#16A34A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedJob.assignedTechs.map((t) => (
                      <span key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: `${t.color}15`, border: `1px solid ${t.color}40` }}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Job Number */}
              {selectedJob.jobNumber && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.1)" }}>
                    <svg className="w-5 h-5" style={{ color: "#8B5CF6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                  </div>
                  <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>Job #{selectedJob.jobNumber}</p>
                </div>
              )}

              {/* Priority */}
              {selectedJob.priority && selectedJob.priority !== "normal" && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: selectedJob.priority === "urgent" ? "rgba(220,38,38,0.1)" : "rgba(245,158,11,0.1)" }}>
                    <svg className="w-5 h-5" style={{ color: selectedJob.priority === "urgent" ? "#DC2626" : "#F59E0B" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: selectedJob.priority === "urgent" ? "#DC2626" : "#F59E0B" }}>
                    {selectedJob.priority.charAt(0).toUpperCase() + selectedJob.priority.slice(1)} Priority
                  </p>
                </div>
              )}

              {/* Notes */}
              {selectedJob.notes && (
                <div className="rounded-lg p-3" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>Notes</p>
                  <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>{selectedJob.notes}</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 flex gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
              <a
                href={`/jobs?highlight=${selectedJob.id}`}
                className="flex-1 text-center py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: "var(--color-surface-3)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              >
                Open in Jobs
              </a>
              <button
                onClick={() => { removeJob(selectedJob.id); setSelectedJob(null); }}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
