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

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [editError, setEditError] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualForm, setManualForm] = useState({ techId: "", date: "", clockIn: "08:00", clockOut: "17:00", note: "" });
  const [activeTab, setActiveTab] = useState<"timesheet" | "approval" | "requests" | "time-off">("timesheet");
  const [reminders, setReminders] = useState<Array<{ id: string; tech_name: string; type: string; message: string; created_at: string }>>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [payrollSent, setPayrollSent] = useState(false);
  const [sendingPayroll, setSendingPayroll] = useState(false);
  const [payrollResult, setPayrollResult] = useState<string>("");

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

      // Payroll fetch separate so it can't break the main load
      let payrollData = { approvals: [] as any[], reports: [] as any[] };
      try {
        const payrollRes = await fetch(`/api/time/payroll?weekStart=${weekIso}`);
        if (payrollRes.ok) payrollData = await payrollRes.json();
      } catch {}

      setEntries(entryData.entries || []);
      setTechs(techData.techs || []);
      setTimeOffRequests(torData.requests || []);
      setEditRequests(erData.requests || []);

      // Build approval map
      const approvalMap: Record<string, boolean> = {};
      for (const a of payrollData.approvals || []) {
        approvalMap[a.tech_id] = true;
      }
      setApprovals(approvalMap);
      setPayrollSent((payrollData.reports || []).length > 0);
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
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const todayIso = isoDate(new Date());

  const gridData = useMemo(() => {
    return techs.map((tech) => {
      const techEntries = entries.filter((e) => e.techId === tech.id);
      const isClockedIn = techEntries.some((e) => e.status === "open");

      const isOnDate = (clockInAt: string, dateStr: string) => {
        try { return new Date(clockInAt).toISOString().startsWith(dateStr); } catch { return false; }
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
    setEditError("");
    setEditForm({
      clockInAt: entry.clockInAt ? toLocalDatetimeInput(entry.clockInAt) : "",
      clockOutAt: entry.clockOutAt ? toLocalDatetimeInput(entry.clockOutAt) : "",
      editNote: "",
    });
  }

  async function saveEdit() {
    if (!editEntry) return;
    if (!editForm.clockInAt) {
      setEditError("Clock in time is required.");
      return;
    }
    if (editForm.clockOutAt) {
      const inMs = new Date(editForm.clockInAt).getTime();
      const outMs = new Date(editForm.clockOutAt).getTime();
      if (outMs <= inMs) {
        setEditError("Clock out must be after clock in.");
        return;
      }
    }
    setEditError("");
    setSaving(true);
    try {
      const res = await fetch("/api/time/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editEntry.id,
          clockInAt: new Date(editForm.clockInAt).toISOString(),
          clockOutAt: editForm.clockOutAt ? new Date(editForm.clockOutAt).toISOString() : undefined,
          editNote: editForm.editNote || "Edited by admin",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Save failed. Try again.");
        return;
      }
      setEditEntry(null);
      await loadData();
    } catch {
      setEditError("Network error. Try again.");
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

  async function approveTech(techId: string, techName: string, totalMinutes: number) {
    const weekIso = isoDate(currentWeek);
    await fetch("/api/time/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", techId, techName, weekStart: weekIso, totalMinutes }),
    });
    setApprovals((prev) => ({ ...prev, [techId]: true }));
  }

  async function sendPayrollReport() {
    const weekIso = isoDate(currentWeek);
    const approvedTechs = gridData
      .filter((row) => approvals[row.tech.id] && !row.tech.name.toLowerCase().includes("salaried"))
      .map((row) => ({ techId: row.tech.id, techName: row.tech.name, totalMinutes: row.weekTotal }));

    if (approvedTechs.length === 0) {
      setPayrollResult("No techs approved yet. Approve each tech's hours first.");
      return;
    }

    setSendingPayroll(true);
    setPayrollResult("");
    try {
      const res = await fetch("/api/time/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_report", weekStart: weekIso, approvals: approvedTechs }),
      });
      const data = await res.json();

      if (data.csv) {
        // Download CSV
        const blob = new Blob([data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payroll-${weekIso}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }

      if (data.emailSent) {
        setPayrollResult(`Report sent to ${data.sentTo} and downloaded.`);
      } else {
        setPayrollResult("Report downloaded. Email delivery not configured yet — forward the CSV manually.");
      }
      setPayrollSent(true);
    } catch {
      setPayrollResult("Failed to generate report. Try again.");
    } finally {
      setSendingPayroll(false);
    }
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
          {([["timesheet", "Timesheet"], ["approval", "Weekly Approval"], ["requests", `Edit Requests (${editRequests.length})`], ["time-off", "Time Off"]] as const).map(([tab, label]) => (
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
                          {row.isClockedIn
                            ? `Clocked in · ${minutesToDecimal(row.todayMinutes)}h today`
                            : "Not clocked in"}
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
                                  {row.isClockedIn ? (
                                    <span className="text-[10px] ml-2" style={{ color: "#16A34A" }}>{minutesToDecimal(row.todayMinutes)}h today</span>
                                  ) : null}
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
          ) : activeTab === "approval" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>Weekly Time Approval</h2>
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Review and approve each employee's hours for {weekLabel}</p>
                </div>
                <div className="flex items-center gap-3">
                  {payrollResult && (
                    <span className="text-xs font-medium" style={{ color: payrollResult.includes("sent") || payrollResult.includes("downloaded") ? "#16A34A" : "#DC2626" }}>
                      {payrollResult}
                    </span>
                  )}
                  <button
                    onClick={sendPayrollReport}
                    disabled={sendingPayroll || Object.keys(approvals).length === 0}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}
                  >
                    {sendingPayroll ? "Generating..." : payrollSent ? "Resend Payroll Report" : "Send Payroll Report"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "var(--color-surface-1)" }}>
                      <th className="text-left px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Employee</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Regular Hours</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Overtime</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Total</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Status</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridData.map((row) => {
                      const totalHrs = row.weekTotal / 60;
                      const regularHrs = Math.min(totalHrs, 40);
                      const overtimeHrs = Math.max(0, totalHrs - 40);
                      const isApproved = approvals[row.tech.id];

                      return (
                        <tr key={row.tech.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ background: row.tech.color }} />
                              <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{row.tech.name}</span>
                            </div>
                          </td>
                          <td className="text-center px-4 py-3 text-sm" style={{ color: "var(--color-text-primary)" }}>
                            {regularHrs.toFixed(1)}h
                          </td>
                          <td className="text-center px-4 py-3 text-sm font-semibold" style={{ color: overtimeHrs > 0 ? "#DC2626" : "var(--color-text-muted)" }}>
                            {overtimeHrs > 0 ? `${overtimeHrs.toFixed(1)}h` : "—"}
                          </td>
                          <td className="text-center px-4 py-3 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                            {totalHrs.toFixed(1)}h
                          </td>
                          <td className="text-center px-4 py-3">
                            {isApproved ? (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}>Approved</span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>Pending</span>
                            )}
                          </td>
                          <td className="text-right px-4 py-3">
                            {isApproved ? (
                              <button onClick={() => approveTech(row.tech.id, row.tech.name, row.weekTotal)} className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                Re-approve
                              </button>
                            ) : (
                              <button
                                onClick={() => approveTech(row.tech.id, row.tech.name, row.weekTotal)}
                                disabled={row.weekTotal === 0}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                                style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.2)" }}
                              >
                                Approve Hours
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {Object.keys(approvals).length > 0 && Object.keys(approvals).length === gridData.filter(r => r.weekTotal > 0).length && (
                <div className="rounded-xl p-4 text-center" style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)" }}>
                  <p className="text-sm font-semibold" style={{ color: "#16A34A" }}>All hours approved for {weekLabel}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Click "Send Payroll Report" to email the report to Shelly and download the CSV.</p>
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
            <div className="space-y-5">
              <TimeOffCalendar requests={timeOffRequests} techs={techs} />
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setEditEntry(null); setEditError(""); }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Edit Time Entry</h2>
            <p className="text-sm mb-4 mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {techs.find((t) => t.id === editEntry.techId)?.name || editEntry.techId}
              {" — "}
              {new Date(editEntry.clockInAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Clock In</label>
                <input type="datetime-local" value={editForm.clockInAt} onChange={(e) => { setEditForm({ ...editForm, clockInAt: e.target.value }); setEditError(""); }} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  Clock Out{editEntry.status === "open" && <span className="ml-1 text-yellow-500">(currently open — set a time to close)</span>}
                </label>
                <input type="datetime-local" value={editForm.clockOutAt} onChange={(e) => { setEditForm({ ...editForm, clockOutAt: e.target.value }); setEditError(""); }} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Reason for edit</label>
                <input type="text" value={editForm.editNote} onChange={(e) => setEditForm({ ...editForm, editNote: e.target.value })} placeholder="e.g. forgot to clock out" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              {editForm.clockInAt && editForm.clockOutAt && new Date(editForm.clockOutAt) > new Date(editForm.clockInAt) && (
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  Total: {formatHours(Math.max(0, Math.round((new Date(editForm.clockOutAt).getTime() - new Date(editForm.clockInAt).getTime()) / 60000)))}
                </p>
              )}
              {editError && (
                <p className="text-sm font-semibold" style={{ color: "#DC2626" }}>{editError}</p>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => { setEditEntry(null); setEditError(""); }} className="px-4 py-2.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Cancel</button>
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

// ─── Time-off calendar grid ───────────────────────────────────────────────
// Visualizes approved + pending time-off across all techs for the next 56 days.
// Each tech is a row, each day is a 24px column. Bars for ranges; weekends are
// shaded; today is marked with a vertical accent.
function TimeOffCalendar({ requests, techs }: { requests: TimeOffRequest[]; techs: Tech[] }) {
  const DAY_W = 24;
  const NAME_W = 180;
  const ROW_H = 36;
  const DAYS = 56;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() + i); return d;
  });

  // Group active (non-denied) requests by techId
  const active = requests.filter((r) => r.status !== "denied");
  const byTech = new Map<string, TimeOffRequest[]>();
  for (const r of active) {
    const arr = byTech.get(r.techId) || [];
    arr.push(r);
    byTech.set(r.techId, arr);
  }

  // Show every active tech, plus any tech that has time-off requests (in case a
  // tech becomes inactive but still has pending requests we should see)
  const techIds = new Set(techs.map((t) => t.id));
  for (const id of byTech.keys()) techIds.add(id);
  const techList = [...techIds].map((id) => {
    const t = techs.find((x) => x.id === id);
    return { id, name: t?.name || `Tech ${id.slice(0, 6)}`, color: t?.color || "#6b7280" };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const TYPE_LABELS: Record<string, string> = {
    paid_vacation: "Paid PTO",
    unpaid_vacation: "Unpaid PTO",
    unpaid_appointment_time: "Appt",
  };

  const colors = (status: string) => status === "approved"
    ? { bg: "rgba(22,163,74,0.16)", border: "1px solid rgba(22,163,74,0.45)", text: "#16A34A" }
    : status === "pending"
    ? { bg: "rgba(248,151,31,0.18)", border: "1px dashed rgba(248,151,31,0.55)", text: "#9a5d12" }
    : { bg: "rgba(120,120,120,0.12)", border: "1px solid rgba(120,120,120,0.3)", text: "#666" };

  const monthLabels: Array<{ left: number; label: string }> = [];
  let lastMonth = -1;
  days.forEach((d, i) => {
    if (d.getMonth() !== lastMonth) {
      monthLabels.push({ left: NAME_W + i * DAY_W, label: d.toLocaleDateString("en-US", { month: "short", year: i === 0 ? undefined : undefined }) });
      lastMonth = d.getMonth();
    }
  });

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>Vacation &amp; Time-Off Schedule</h2>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          <span className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(22,163,74,0.3)", border: "1px solid rgba(22,163,74,0.55)" }} />Approved</span>
          <span className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(248,151,31,0.25)", border: "1px dashed rgba(248,151,31,0.6)" }} />Pending</span>
          <span>Next 8 weeks</span>
        </div>
      </div>

      {techList.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No active techs.</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: NAME_W + DAYS * DAY_W, position: "relative" }}>
            {/* Month strip */}
            <div style={{ height: 18, position: "relative", marginBottom: 4 }}>
              {monthLabels.map((m, i) => (
                <div key={i} className="text-[10px] font-semibold uppercase tracking-wide absolute" style={{ left: m.left, color: "var(--color-text-muted)" }}>{m.label}</div>
              ))}
            </div>
            {/* Day-of-week strip */}
            <div className="flex" style={{ height: 18 }}>
              <div style={{ width: NAME_W }} />
              {days.map((d, i) => (
                <div key={i} className="text-[9px] text-center" style={{ width: DAY_W, color: i === 0 ? "var(--color-ember)" : "var(--color-text-muted)", fontWeight: i === 0 ? 700 : 400 }}>
                  {d.getDate()}
                </div>
              ))}
            </div>

            {/* Tech rows */}
            {techList.map((t) => (
              <div key={t.id} className="flex items-center" style={{ height: ROW_H, position: "relative", borderTop: "1px solid var(--color-border)" }}>
                <div className="text-sm font-medium truncate pr-2" style={{ width: NAME_W, color: "var(--color-text-primary)" }}>
                  <span className="inline-block rounded-full mr-2" style={{ width: 8, height: 8, background: t.color, verticalAlign: "middle" }} />
                  {t.name}
                </div>
                {/* Background grid (weekend shading) */}
                <div style={{ display: "flex" }}>
                  {days.map((d, i) => (
                    <div key={i} style={{
                      width: DAY_W,
                      height: ROW_H,
                      background: d.getDay() === 0 || d.getDay() === 6 ? "var(--color-surface-2)" : "transparent",
                      borderLeft: i === 0 ? "1px solid var(--color-border)" : "none",
                      borderRight: "1px solid var(--color-border)",
                    }} />
                  ))}
                </div>
                {/* Today marker */}
                <div style={{ position: "absolute", top: 0, bottom: 0, left: NAME_W, width: 2, background: "var(--color-ember)", opacity: 0.5 }} />
                {/* Time-off bars */}
                {(byTech.get(t.id) || []).map((req) => {
                  const start = new Date(req.startDate); start.setHours(0, 0, 0, 0);
                  const end = new Date(req.endDate); end.setHours(0, 0, 0, 0);
                  const startIdx = Math.floor((start.getTime() - today.getTime()) / 86400000);
                  const endIdx = Math.floor((end.getTime() - today.getTime()) / 86400000);
                  if (endIdx < 0 || startIdx >= DAYS) return null;
                  const cs = Math.max(0, startIdx);
                  const ce = Math.min(DAYS - 1, endIdx);
                  const span = ce - cs + 1;
                  const left = NAME_W + cs * DAY_W + 1;
                  const width = span * DAY_W - 2;
                  const c = colors(req.status);
                  return (
                    <div
                      key={req.id}
                      title={`${TYPE_LABELS[req.type] || req.type}: ${req.startDate} → ${req.endDate} (${req.status})${req.reason ? "\n" + req.reason : ""}`}
                      className="absolute rounded text-[10px] font-medium px-1.5 truncate flex items-center"
                      style={{ left, width, top: 4, height: ROW_H - 8, background: c.bg, border: c.border, color: c.text }}
                    >
                      {TYPE_LABELS[req.type] || req.type}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
