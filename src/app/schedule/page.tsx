"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type ViewMode = "master" | "tech";

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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am-6pm

function getWeekDates(baseDate: Date): Date[] {
  const sunday = new Date(baseDate);
  sunday.setDate(baseDate.getDate() - baseDate.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
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

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("master");
  const [techs, setTechs] = useState<Tech[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [focusTechId, setFocusTechId] = useState<string>("");

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [draggedDuration, setDraggedDuration] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerLookup[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    jobType: "Service Call",
    customerId: "",
    customerName: "",
    propertyAddress: "",
    notes: "",
    scheduledDate: "",
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "10:00",
    techId: "",
  });

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  async function loadData() {
    setLoading(true);
    try {
      const [techRes, jobRes] = await Promise.all([
        fetch("/api/techs?activeOnly=true"),
        fetch("/api/jobs?limit=500"),
      ]);
      const techData = await techRes.json();
      const jobData = await jobRes.json();

      const loadedTechs: Tech[] = techData.techs || [];
      const loadedJobs: Job[] = jobData.jobs || [];

      setTechs(loadedTechs);
      setJobs(loadedJobs);

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
        const qbRes = await fetch(`/api/quickbooks/customers?q=${encodeURIComponent(q)}&live=true`);
        const qbData = await qbRes.json();

        if (!cancelled && !qbData.error) {
          setCustomerResults((qbData.customers || []) as CustomerLookup[]);
          return;
        }

        const localRes = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
        const localData = await localRes.json();
        if (!cancelled) {
          setCustomerResults((localData.customers || []) as CustomerLookup[]);
          if (qbData?.error) setCustomerLookupError("QuickBooks lookup unavailable, using local customers.");
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

  const weekJobs = useMemo(() => {
    return jobs.filter((j) => {
      const d = new Date(j.scheduledDate + "T00:00:00");
      return d >= weekStart && d <= weekEnd;
    });
  }, [jobs, weekStart, weekEnd]);

  const visibleJobs = useMemo(() => {
    if (viewMode === "master") {
      return weekJobs.filter((j) => j.assignedTechs.some((t) => selectedTechIds.includes(t.id)));
    }
    if (!focusTechId) return [];
    return weekJobs.filter((j) => j.assignedTechs.some((t) => t.id === focusTechId));
  }, [weekJobs, selectedTechIds, viewMode, focusTechId]);

  const monthYear = weekDates[0].toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function toggleTech(techId: string) {
    setSelectedTechIds((prev) =>
      prev.includes(techId) ? prev.filter((id) => id !== techId) : [...prev, techId]
    );
  }

  function goPrevWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }

  function goNextWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }

  function customerAddressLine(c: CustomerLookup) {
    const a = c.address;
    if (!a) return "";
    return [a.line1, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" ").trim();
  }

  function applyCustomer(c: CustomerLookup) {
    setForm((f) => ({
      ...f,
      customerId: c.id,
      customerName: c.displayName || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
      propertyAddress: customerAddressLine(c) || f.propertyAddress,
    }));
    setCustomerQuery(c.displayName || "");
    setCustomerResults([]);
    setFormErrors((prev) => ({ ...prev, customerName: "", propertyAddress: "" }));
  }

  function validateForm() {
    const errs: Record<string, string> = {};
    if (!form.jobType.trim()) errs.jobType = "Job type is required";
    if (!form.customerName.trim()) errs.customerName = "Customer is required";
    if (!form.propertyAddress.trim()) errs.propertyAddress = "Property address is required";
    if (!form.scheduledDate) errs.scheduledDate = "Date is required";
    if (!form.scheduledTimeStart) errs.scheduledTimeStart = "Start time is required";
    if (!form.scheduledTimeEnd) errs.scheduledTimeEnd = "End time is required";
    if (!form.techId) errs.techId = "Assign a technician";
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
          ? {
              line1: form.propertyAddress,
              city: "",
              state: "",
              zip: "",
            }
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
      const tech = techs.find((t) => t.id === form.techId);
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.jobType,
          jobType: "service",
          customerId: form.customerId || undefined,
          customerName: form.customerName,
          propertyAddress: form.propertyAddress,
          notes: form.notes || undefined,
          scheduledDate: form.scheduledDate,
          scheduledTimeStart: form.scheduledTimeStart,
          scheduledTimeEnd: form.scheduledTimeEnd,
          assignedTechs: tech ? [{ id: tech.id, name: tech.name, color: tech.color }] : [],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Failed to add job. Please try again.");
        return;
      }

      // Move calendar to the newly scheduled date's week so user sees the new card immediately
      setCurrentDate(new Date(form.scheduledDate + "T00:00:00"));

      setShowCreate(false);
      setCustomerQuery("");
      setCustomerResults([]);
      setForm({
        jobType: "Service Call",
        customerId: "",
        customerName: "",
        propertyAddress: "",
        notes: "",
        scheduledDate: isoDate(new Date()),
        scheduledTimeStart: "09:00",
        scheduledTimeEnd: "10:00",
        techId: techs[0]?.id || "",
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
        id: job.id,
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
      setForm((f) => ({
        ...f,
        scheduledDate: isoDate(new Date()),
        techId: f.techId || techs[0]?.id || "",
      }));
    }
  }, [showCreate, form.scheduledDate, form.techId, techs]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Master Schedule</h1>
            <button onClick={goPrevWeek} className="px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>◀</button>
            <span className="text-sm font-semibold">{monthYear}</span>
            <button onClick={goNextWeek} className="px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>▶</button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              <button onClick={() => setViewMode("master")} className="px-3 py-1.5 text-xs font-semibold" style={{ background: viewMode === "master" ? "var(--color-surface-3)" : "var(--color-surface-2)" }}>Master</button>
              <button onClick={() => setViewMode("tech")} className="px-3 py-1.5 text-xs font-semibold" style={{ background: viewMode === "tech" ? "var(--color-surface-3)" : "var(--color-surface-2)" }}>By Tech</button>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))", color: "white" }}
            >
              + Add Job
            </button>
          </div>
        </div>

        <div className="px-6 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {viewMode === "master" ? (
            <>
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Filter techs:</span>
              {techs.map((tech) => (
                <button
                  key={tech.id}
                  onClick={() => toggleTech(tech.id)}
                  className="px-2.5 py-1 rounded-lg text-xs"
                  style={{
                    border: "1px solid var(--color-border)",
                    background: selectedTechIds.includes(tech.id) ? "var(--color-surface-3)" : "transparent",
                  }}
                >
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

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8">Loading schedule...</div>
          ) : (
            <div className="min-w-[980px]">
              <div className="grid sticky top-0 z-10" style={{ gridTemplateColumns: "70px repeat(7, 1fr)", background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
                <div />
                {weekDates.map((date, i) => (
                  <div key={i} className="text-center py-2">
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{DAYS[i]}</div>
                    <div className="font-semibold">{date.getDate()}</div>
                  </div>
                ))}
              </div>

              {HOURS.map((hour) => (
                <div key={hour} className="grid" style={{ gridTemplateColumns: "70px repeat(7, 1fr)", height: 82, borderBottom: "1px solid var(--color-border)" }}>
                  <div className="text-xs pt-1 pr-2 text-right" style={{ color: "var(--color-text-muted)" }}>
                    {hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                  </div>
                  {weekDates.map((d, dayIndex) => {
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
                          background: dragOverSlot === `${d.toDateString()}-${hour}` ? "rgba(37,99,235,0.08)" : undefined,
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
                              className="absolute left-1 right-1 rounded-md p-1.5 text-white cursor-move"
                              style={{
                                top: 2,
                                height: duration * 82 - 4,
                                background: job.assignedTechs[0]?.color || "#2563EB",
                                overflow: "hidden",
                                opacity: draggedJobId === job.id ? 0.75 : 1,
                              }}
                              title="Drag to reschedule"
                            >
                              <div className="text-[10px] font-bold truncate">{job.title}</div>
                              <div className="text-[9px] opacity-90 truncate">{job.customerName}</div>
                              <div className="text-[9px] opacity-80 truncate">{job.propertyAddress}</div>
                              <button
                                onClick={() => removeJob(job.id)}
                                disabled={draggedJobId !== null}
                                className="absolute top-1 right-1 text-[9px] px-1 rounded bg-black/30"
                                style={{ opacity: draggedJobId ? 0.45 : 1, pointerEvents: draggedJobId ? "none" : "auto" }}
                                title={draggedJobId ? "Release drag first" : "Remove"}
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

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Add Scheduled Job</h2>
              <button onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="space-y-3">
              {saveError && (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.35)", color: "#FF204E" }}>
                  {saveError}
                </div>
              )}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--color-text-muted)" }}>Job Type</label>
                <select value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.jobType ? "#FF204E" : "var(--color-border)"}` }}>
                  {JOB_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {formErrors.jobType && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.jobType}</p>}
              </div>

              <div>
                <input
                  placeholder="Lookup customer (QuickBooks)"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                />
                {customerLoading && <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Looking up customers...</p>}
                {customerLookupError && <p className="text-xs mt-1" style={{ color: "#FF4400" }}>{customerLookupError}</p>}
                {customerResults.length > 0 && (
                  <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    {customerResults.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => applyCustomer(c)}
                        className="w-full text-left px-3 py-2 text-sm"
                        style={{ borderBottom: "1px solid var(--color-border)" }}
                      >
                        <div className="font-medium">{c.displayName}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{customerAddressLine(c)}</div>
                      </button>
                    ))}
                  </div>
                )}
                {!customerLoading && customerQuery.trim().length >= 2 && customerResults.length === 0 && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No matching customer found.</p>
                    <button
                      type="button"
                      onClick={createCustomerInline}
                      disabled={creatingCustomer}
                      className="px-2 py-1 rounded text-xs font-semibold"
                      style={{ background: "#2563EB", color: "white" }}
                    >
                      {creatingCustomer ? "Creating..." : "Create Customer"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <input placeholder="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.customerName ? "#FF204E" : "var(--color-border)"}` }} />
                {formErrors.customerName && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.customerName}</p>}
              </div>
              <div>
                <input placeholder="Property address" value={form.propertyAddress} onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.propertyAddress ? "#FF204E" : "var(--color-border)"}` }} />
                {formErrors.propertyAddress && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.propertyAddress}</p>}
              </div>
              <textarea placeholder="Notes for tech (access, parts, scope, etc.)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg resize-none" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.scheduledDate ? "#FF204E" : "var(--color-border)"}` }} />
                  {formErrors.scheduledDate && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.scheduledDate}</p>}
                </div>
                <div>
                  <select value={form.techId} onChange={(e) => setForm({ ...form, techId: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.techId ? "#FF204E" : "var(--color-border)"}` }}>
                    <option value="">Assign tech</option>
                    {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {formErrors.techId && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.techId}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input type="time" value={form.scheduledTimeStart} onChange={(e) => setForm({ ...form, scheduledTimeStart: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.scheduledTimeStart ? "#FF204E" : "var(--color-border)"}` }} />
                  {formErrors.scheduledTimeStart && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.scheduledTimeStart}</p>}
                </div>
                <div>
                  <input type="time" value={form.scheduledTimeEnd} onChange={(e) => setForm({ ...form, scheduledTimeEnd: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: `1px solid ${formErrors.scheduledTimeEnd ? "#FF204E" : "var(--color-border)"}` }} />
                  {formErrors.scheduledTimeEnd && <p className="text-xs mt-1" style={{ color: "#FF204E" }}>{formErrors.scheduledTimeEnd}</p>}
                </div>
              </div>
            </div>
            <button onClick={createJob} disabled={saving} className="w-full mt-4 py-2.5 rounded-lg text-white font-semibold" style={{ background: "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))" }}>
              {saving ? "Saving..." : "Add to Schedule"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
