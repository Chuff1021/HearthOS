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
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "on_hold";
  assignedTechs: Array<{ id: string; name: string; color: string }>;
}

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
  const [form, setForm] = useState({
    title: "",
    customerName: "",
    propertyAddress: "",
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

  async function createJob() {
    if (!form.title || !form.customerName || !form.propertyAddress || !form.scheduledDate || !form.techId) return;
    setSaving(true);
    try {
      const tech = techs.find((t) => t.id === form.techId);
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          customerName: form.customerName,
          propertyAddress: form.propertyAddress,
          scheduledDate: form.scheduledDate,
          scheduledTimeStart: form.scheduledTimeStart,
          scheduledTimeEnd: form.scheduledTimeEnd,
          assignedTechs: tech ? [{ id: tech.id, name: tech.name, color: tech.color }] : [],
        }),
      });
      setShowCreate(false);
      setForm({
        title: "",
        customerName: "",
        propertyAddress: "",
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

  useEffect(() => {
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
                      <div key={dayIndex} className="relative border-l" style={{ borderColor: "var(--color-border)" }}>
                        {dayJobs.map((job) => {
                          const start = toHourFloat(job.scheduledTimeStart);
                          const end = toHourFloat(job.scheduledTimeEnd);
                          const duration = Math.max(0.5, end - start);
                          return (
                            <div
                              key={job.id}
                              className="absolute left-1 right-1 rounded-md p-1.5 text-white"
                              style={{
                                top: 2,
                                height: duration * 82 - 4,
                                background: job.assignedTechs[0]?.color || "#2563EB",
                                overflow: "hidden",
                              }}
                            >
                              <div className="text-[10px] font-bold truncate">{job.title}</div>
                              <div className="text-[9px] opacity-90 truncate">{job.customerName}</div>
                              <div className="text-[9px] opacity-80 truncate">{job.propertyAddress}</div>
                              <button
                                onClick={() => removeJob(job.id)}
                                className="absolute top-1 right-1 text-[9px] px-1 rounded bg-black/30"
                                title="Remove"
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
              <input placeholder="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              <input placeholder="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              <input placeholder="Property address" value={form.propertyAddress} onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                <select value={form.techId} onChange={(e) => setForm({ ...form, techId: e.target.value })} className="px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                  <option value="">Assign tech</option>
                  {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="time" value={form.scheduledTimeStart} onChange={(e) => setForm({ ...form, scheduledTimeStart: e.target.value })} className="px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                <input type="time" value={form.scheduledTimeEnd} onChange={(e) => setForm({ ...form, scheduledTimeEnd: e.target.value })} className="px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
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
