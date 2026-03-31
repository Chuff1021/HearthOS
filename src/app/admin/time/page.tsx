"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type TimeEntry = {
  id: string;
  techId: string;
  techName?: string;
  clockInAt: string;
  clockOutAt?: string;
  totalMinutes?: number;
  status: "open" | "closed";
  edited?: boolean;
  editNote?: string;
};

type Tech = { id: string; name: string; color: string };

type TimeOffRequest = {
  id: string;
  techId: string;
  techName?: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: "pending" | "approved" | "denied";
};

type EditRequest = {
  id: string;
  tech_id: string;
  tech_name?: string;
  entry_id: string;
  requested_clock_in?: string;
  requested_clock_out?: string;
  reason: string;
  status: string;
  created_at: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function minutesToDecimal(minutes: number) {
  return (minutes / 60).toFixed(1);
}

export default function AdminTimePage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ techId: string; date: string } | null>(null);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editForm, setEditForm] = useState({ clockInAt: "", clockOutAt: "", editNote: "" });
  const [saving, setSaving] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualForm, setManualForm] = useState({ techId: "", date: "", clockIn: "08:00", clockOut: "17:00", note: "" });
  const [activeTab, setActiveTab] = useState<"timesheet" | "requests" | "time-off">("timesheet");
  const [reminders, setReminders] = useState<Array<{ id: string; tech_name: string; type: string; message: string; created_at: string }>>([]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeek);
      d.setDate(currentWeek.getDate() + i);
      return d;
    });
  }, [currentWeek]);

  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }, [weekDates]);

  async function loadData() {
    setLoading(true);
    try {
      const weekIso = isoDate(currentWeek);
      const [entryRes, techRes, torRes, erRes] = await Promise.all([
        fetch(`/api/time/entries?weekOf=${weekIso}`),
        fetch("/api/techs?activeOnly=true"),
        fetch("/api/time-off-requests"),
        fetch("/api/time/edit-requests?status=pending"),
      ]);
      const entryData = await entryRes.json();
      const techData = await techRes.json();
      const torData = await torRes.json().catch(() => ({ requests: [] }));
      const erData = await erRes.json().catch(() => ({ requests: [] }));

      setEntries(entryData.entries || []);
      setTechs(techData.techs || []);
      setTimeOffRequests(torData.requests || []);
      setEditRequests(erData.requests || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeek]);

  // Build the weekly grid data
  const [tick, setTick] = useState(0);

  // Auto-refresh running totals every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const todayIso = isoDate(new Date());

  const gridData = useMemo(() => {
    return techs.map((tech) => {
      const techEntries = entries.filter((e) => e.techId === tech.id);
      const isClockedIn = techEntries.some((e) => e.status === "open");

      // Helper: check if a clockInAt string falls on a given YYYY-MM-DD date
      const isOnDate = (clockInAt: string, dateStr: string) => {
        try {
          return new Date(clockInAt).toISOString().startsWith(dateStr);
        } catch { return false; }
      };

      const todayEntries = techEntries.filter((e) => isOnDate(e.clockInAt, todayIso));
      const todayMinutes = todayEntries.reduce((sum, e) => {
        if (e.status === "open") return sum + Math.round((Date.now() - new Date(e.clockInAt).getTime()) / 60000);
        return sum + (e.totalMinutes || 0);
      }, 0);

      const dailyMinutes = weekDates.map((date) => {
        const dayIso = isoDate(date);
        const dayEntries = techEntries.filter((e) => isOnDate(e.clockInAt, dayIso));
        const totalMin = dayEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0);
        const openEntries = dayEntries.filter((e) => e.status === "open");
        const openMin = openEntries.reduce((sum, e) => {
          return sum + Math.round((Date.now() - new Date(e.clockInAt).getTime()) / 60000);
        }, 0);
        return { date: dayIso, minutes: totalMin + openMin, entryCount: dayEntries.length, hasOpen: openEntries.length > 0 };
      });
      const weekTotal = dailyMinutes.reduce((sum, d) => sum + d.minutes, 0);
      return { tech, dailyMinutes, weekTotal, isClockedIn, todayMinutes };
    });
  }, [techs, entries, weekDates, tick, todayIso]);

  function goPrevWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(getWeekStart(d));
  }

  function goNextWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(getWeekStart(d));
  }

  function goThisWeek() {
    setCurrentWeek(getWeekStart(new Date()));
  }

  function openEdit(entry: TimeEntry) {
    setEditEntry(entry);
    setEditForm({
      clockInAt: entry.clockInAt ? new Date(entry.clockInAt).toISOString().slice(0, 16) : "",
      clockOutAt: entry.clockOutAt ? new Date(entry.clockOutAt).toISOString().slice(0, 16) : "",
      editNote: "",
    });
  }

  async function saveEdit() {
    if (!editEntry) return;
    setSaving(true);
    try {
      await fetch("/api/time/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editEntry.id,
          clockInAt: editForm.clockInAt ? new Date(editForm.clockInAt).toISOString() : undefined,
          clockOutAt: editForm.clockOutAt ? new Date(editForm.clockOutAt).toISOString() : undefined,
          editNote: editForm.editNote || "Edited by admin",
        }),
      });
      setEditEntry(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function addManualEntry() {
    if (!manualForm.techId || !manualForm.date) return;
    setSaving(true);
    try {
      const clockInAt = new Date(`${manualForm.date}T${manualForm.clockIn}:00`).toISOString();
      const clockOutAt = new Date(`${manualForm.date}T${manualForm.clockOut}:00`).toISOString();
      const tech = techs.find((t) => t.id === manualForm.techId);
      await fetch("/api/time/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_entry",
          techId: manualForm.techId,
          techName: tech?.name,
          clockInAt,
          clockOutAt,
          editNote: manualForm.note || "Manual entry by admin",
        }),
      });
      setShowManualEntry(false);
      setManualForm({ techId: "", date: "", clockIn: "08:00", clockOut: "17:00", note: "" });
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleEditRequest(id: string, status: "approved" | "denied") {
    await fetch("/api/time/edit-requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reviewedBy: "admin" }),
    });
    await loadData();
  }

  async function handleTimeOff(id: string, status: "approved" | "denied") {
    await fetch("/api/time-off-requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await loadData();
  }

  const selectedEntries = selectedCell
    ? entries.filter((e) => {
        if (e.techId !== selectedCell.techId) return false;
        try { return new Date(e.clockInAt).toISOString().startsWith(selectedCell.date); } catch { return false; }
      })
    : [];

  const grandTotal = gridData.reduce((sum, row) => sum + row.weekTotal, 0);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        {/* Toolbar */}
        <div className="px-6 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Time Management</h1>
            <div className="flex items-center gap-1">
              <button onClick={goPrevWeek} className="px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={goThisWeek} className="px-3 py-1 rounded text-xs font-semibold" style={{ border: "1px solid var(--color-border)" }}>This Week</button>
              <button onClick={goNextWeek} className="px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{weekLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {editRequests.length > 0 && (
              <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>
                {editRequests.length} pending edit{editRequests.length > 1 ? "s" : ""}
              </span>
            )}
            <button onClick={() => setShowManualEntry(true)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
              + Add Entry
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {([["timesheet", "Timesheet"], ["requests", `Edit Requests (${editRequests.length})`], ["time-off", "Time Off"]] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className="px-4 py-2.5 text-sm font-semibold transition-colors" style={{
              borderBottom: activeTab === tab ? "2px solid #2563EB" : "2px solid transparent",
              color: activeTab === tab ? "#2563EB" : "var(--color-text-muted)",
              marginBottom: -1,
            }}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="text-center py-8" style={{ color: "var(--color-text-muted)" }}>Loading timesheet...</div>
          ) : activeTab === "timesheet" ? (
            <div className="space-y-6">
              {/* Overtime Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {gridData.map((row) => {
                  const hrs = row.weekTotal / 60;
                  const pct = Math.min(100, (hrs / 40) * 100);
                  const color = hrs >= 40 ? "#DC2626" : hrs >= 35 ? "#F59E0B" : "#16A34A";
                  return (
                    <div key={row.tech.id} className="rounded-xl p-3" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${row.isClockedIn ? "animate-pulse" : ""}`} style={{ background: row.isClockedIn ? "#16A34A" : "#9CA3AF" }} />
                          <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{row.tech.name.split(" ")[0]}</span>
                        </div>
                        <span className="text-sm font-bold" style={{ color }}>{minutesToDecimal(row.weekTotal)}h</span>
                      </div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px]" style={{ color: row.isClockedIn ? "#16A34A" : "var(--color-text-muted)" }}>
                          {row.isClockedIn ? `Clocked in · ${minutesToDecimal(row.todayMinutes)}h today` : "Not clocked in"}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full" style={{ background: "var(--color-surface-3)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      {hrs >= 40 && <p className="text-[10px] font-semibold mt-1" style={{ color: "#DC2626" }}>OVERTIME</p>}
                    </div>
                  );
                })}
              </div>

              {/* Weekly Grid */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "var(--color-surface-1)" }}>
                        <th className="text-left px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)", minWidth: 140 }}>Tech</th>
                        {weekDates.map((d, i) => {
                          const isToday = isoDate(d) === isoDate(new Date());
                          return (
                            <th key={i} className="text-center px-3 py-3 text-sm" style={{ color: "var(--color-text-muted)", background: isToday ? "rgba(37,99,235,0.06)" : undefined, minWidth: 80 }}>
                              <div className="font-semibold">{DAYS[i]}</div>
                              <div className={`text-xs ${isToday ? "font-bold" : ""}`} style={{ color: isToday ? "#2563EB" : undefined }}>{d.getDate()}</div>
                            </th>
                          );
                        })}
                        <th className="text-center px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)", minWidth: 80 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gridData.map((row) => {
                        const hrs = row.weekTotal / 60;
                        const isOvertime = hrs >= 40;
                        return (
                          <tr key={row.tech.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${row.isClockedIn ? "animate-pulse" : ""}`} style={{ background: row.isClockedIn ? "#16A34A" : row.tech.color }} title={row.isClockedIn ? "Clocked in" : "Not clocked in"} />
                                <div>
                                  <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{row.tech.name}</span>
                                  {row.isClockedIn && (
                                    <span className="text-[10px] ml-2" style={{ color: "#16A34A" }}>{minutesToDecimal(row.todayMinutes)}h today</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {row.dailyMinutes.map((day, i) => {
                              const isToday = day.date === isoDate(new Date());
                              const isSelected = selectedCell?.techId === row.tech.id && selectedCell?.date === day.date;
                              return (
                                <td key={i} className="text-center px-3 py-3 cursor-pointer hover:bg-black/5 transition-colors" onClick={() => setSelectedCell({ techId: row.tech.id, date: day.date })} style={{ background: isSelected ? "rgba(37,99,235,0.1)" : isToday ? "rgba(37,99,235,0.03)" : undefined }}>
                                  {day.minutes > 0 || day.hasOpen ? (
                                    <span className="text-sm font-medium" style={{ color: day.hasOpen ? "#F59E0B" : "var(--color-text-primary)" }}>
                                      {minutesToDecimal(day.minutes)}h
                                      {day.hasOpen && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />}
                                    </span>
                                  ) : (
                                    <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="text-center px-4 py-3">
                              <span className="text-sm font-bold" style={{ color: isOvertime ? "#DC2626" : "var(--color-text-primary)" }}>
                                {minutesToDecimal(row.weekTotal)}h
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Grand total row */}
                      <tr style={{ borderTop: "2px solid var(--color-border)", background: "var(--color-surface-1)" }}>
                        <td className="px-4 py-3 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>Total</td>
                        {weekDates.map((d, i) => {
                          const dayTotal = gridData.reduce((sum, row) => sum + row.dailyMinutes[i].minutes, 0);
                          return (
                            <td key={i} className="text-center px-3 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                              {dayTotal > 0 ? `${minutesToDecimal(dayTotal)}h` : "—"}
                            </td>
                          );
                        })}
                        <td className="text-center px-4 py-3 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                          {minutesToDecimal(grandTotal)}h
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected day detail */}
              {selectedCell && (
                <div className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {techs.find((t) => t.id === selectedCell.techId)?.name} — {new Date(selectedCell.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const tech = techs.find((t) => t.id === selectedCell.techId);
                          setManualForm({ techId: selectedCell.techId, date: selectedCell.date, clockIn: "08:30", clockOut: "17:00", note: "" });
                          setShowManualEntry(true);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.2)" }}
                      >
                        + Add Entry
                      </button>
                      <button onClick={() => setSelectedCell(null)} className="text-sm" style={{ color: "var(--color-text-muted)" }}>Close</button>
                    </div>
                  </div>
                  {selectedEntries.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No entries for this day. Click "+ Add Entry" to create one.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                          <div>
                            <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {formatTime(entry.clockInAt)} → {entry.clockOutAt ? formatTime(entry.clockOutAt) : <span style={{ color: "#F59E0B" }}>Active</span>}
                            </div>
                            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                              {entry.totalMinutes ? formatHours(entry.totalMinutes) : "In progress"}
                              {entry.edited && <span className="ml-2" style={{ color: "#F59E0B" }}>(edited)</span>}
                            </div>
                          </div>
                          <button onClick={() => openEdit(entry)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                            Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === "requests" ? (
            <div className="space-y-3">
              <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>Pending Edit Requests</h2>
              {editRequests.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No pending edit requests.</p>
              ) : editRequests.map((req) => (
                <div key={req.id} className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{req.tech_name || req.tech_id}</p>
                      <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>Reason: {req.reason}</p>
                      {req.requested_clock_in && <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Requested clock in: {formatTime(req.requested_clock_in)}</p>}
                      {req.requested_clock_out && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Requested clock out: {formatTime(req.requested_clock_out)}</p>}
                      <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Submitted: {new Date(req.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEditRequest(req.id, "approved")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.2)" }}>
                        Approve
                      </button>
                      <button onClick={() => handleEditRequest(req.id, "denied")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}>
                        Deny
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>Time Off Requests</h2>
              {timeOffRequests.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No time off requests.</p>
              ) : timeOffRequests.map((req) => (
                <div key={req.id} className="rounded-xl p-4 flex items-center justify-between" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{req.techName || req.techId}</p>
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{req.type.replace(/_/g, " ")} — {req.startDate} to {req.endDate}</p>
                    {req.reason && <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{req.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {req.status === "pending" ? (
                      <>
                        <button onClick={() => handleTimeOff(req.id, "approved")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}>Approve</button>
                        <button onClick={() => handleTimeOff(req.id, "denied")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626" }}>Deny</button>
                      </>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{
                        background: req.status === "approved" ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
                        color: req.status === "approved" ? "#16A34A" : "#DC2626",
                      }}>{req.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Entry Modal */}
      {editEntry && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditEntry(null)}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4" style={{ color: "var(--color-text-primary)" }}>Edit Time Entry</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Clock In</label>
                <input type="datetime-local" value={editForm.clockInAt} onChange={(e) => setEditForm({ ...editForm, clockInAt: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Clock Out</label>
                <input type="datetime-local" value={editForm.clockOutAt} onChange={(e) => setEditForm({ ...editForm, clockOutAt: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Reason for edit</label>
                <input type="text" value={editForm.editNote} onChange={(e) => setEditForm({ ...editForm, editNote: e.target.value })} placeholder="Why is this being changed?" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              {editForm.clockInAt && editForm.clockOutAt && (
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  Total: {formatHours(Math.max(0, Math.round((new Date(editForm.clockOutAt).getTime() - new Date(editForm.clockInAt).getTime()) / 60000)))}
                </p>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => setEditEntry(null)} className="px-4 py-2.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showManualEntry && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowManualEntry(false)}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4" style={{ color: "var(--color-text-primary)" }}>Add Manual Time Entry</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Tech</label>
                <select value={manualForm.techId} onChange={(e) => setManualForm({ ...manualForm, techId: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                  <option value="">Select tech...</option>
                  {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Date</label>
                <input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Clock In</label>
                  <input type="time" value={manualForm.clockIn} onChange={(e) => setManualForm({ ...manualForm, clockIn: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Clock Out</label>
                  <input type="time" value={manualForm.clockOut} onChange={(e) => setManualForm({ ...manualForm, clockOut: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Note</label>
                <input type="text" value={manualForm.note} onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })} placeholder="Reason for manual entry" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addManualEntry} disabled={saving || !manualForm.techId || !manualForm.date} className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
                {saving ? "Saving..." : "Add Entry"}
              </button>
              <button onClick={() => setShowManualEntry(false)} className="px-4 py-2.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
