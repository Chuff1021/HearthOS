"use client";

import { useEffect, useMemo, useState } from "react";
import TechBottomNav from "@/components/tech/TechBottomNav";

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

type TechSession = {
  tech: { id: string; name: string; email: string };
  clockEntry: { id: string; clockInAt: string } | null;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
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

export default function TechTimeHistoryPage() {
  const [session, setSession] = useState<TechSession | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [showEditRequest, setShowEditRequest] = useState<TimeEntry | null>(null);
  const [editRequestForm, setEditRequestForm] = useState({ clockInAt: "", clockOutAt: "", reason: "" });
  const [requestStatus, setRequestStatus] = useState("");

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
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }, [weekDates]);

  async function loadData() {
    setLoading(true);
    try {
      const sessionRes = await fetch("/api/tech/me", { cache: "no-store" });
      const sessionData = await sessionRes.json();
      setSession(sessionData);

      if (sessionData?.tech?.id) {
        const weekIso = isoDate(currentWeek);
        const entryRes = await fetch(`/api/time/entries?techId=${sessionData.tech.id}&weekOf=${weekIso}`);
        const entryData = await entryRes.json();
        setEntries(entryData.entries || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeek]);

  const dailyData = useMemo(() => {
    return weekDates.map((date) => {
      const dayIso = isoDate(date);
      const dayEntries = entries.filter((e) => {
        try { return new Date(e.clockInAt).toISOString().startsWith(dayIso); } catch { return false; }
      });
      const totalMin = dayEntries.reduce((sum, e) => {
        if (e.status === "open") {
          return sum + Math.round((Date.now() - new Date(e.clockInAt).getTime()) / 60000);
        }
        return sum + (e.totalMinutes || 0);
      }, 0);
      return { date: dayIso, dayName: DAYS[weekDates.indexOf(date)], entries: dayEntries, totalMinutes: totalMin };
    });
  }, [entries, weekDates]);

  const weekTotal = dailyData.reduce((sum, d) => sum + d.totalMinutes, 0);
  const isOvertime = weekTotal / 60 >= 40;

  function openEditRequest(entry: TimeEntry) {
    setShowEditRequest(entry);
    setEditRequestForm({
      clockInAt: entry.clockInAt ? new Date(entry.clockInAt).toISOString().slice(0, 16) : "",
      clockOutAt: entry.clockOutAt ? new Date(entry.clockOutAt).toISOString().slice(0, 16) : "",
      reason: "",
    });
    setRequestStatus("");
  }

  async function submitEditRequest() {
    if (!showEditRequest || !editRequestForm.reason || !session?.tech) return;
    try {
      const res = await fetch("/api/time/edit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          techId: session.tech.id,
          techName: session.tech.name,
          entryId: showEditRequest.id,
          requestedClockIn: editRequestForm.clockInAt ? new Date(editRequestForm.clockInAt).toISOString() : undefined,
          requestedClockOut: editRequestForm.clockOutAt ? new Date(editRequestForm.clockOutAt).toISOString() : undefined,
          reason: editRequestForm.reason,
        }),
      });
      if (res.ok) {
        setRequestStatus("Edit request submitted. Your manager will review it.");
        setTimeout(() => setShowEditRequest(null), 2000);
      } else {
        setRequestStatus("Failed to submit request. Try again.");
      }
    } catch {
      setRequestStatus("Failed to submit request.");
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-32">
      <header
        className="sticky top-0 z-10 px-4 pb-4"
        style={{
          paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))",
          background: "color-mix(in srgb, var(--color-surface-1) 92%, #fff)",
          borderBottom: "1px solid rgba(255,106,0,0.12)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Time History</h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{session?.tech?.name || "Loading..."}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { const d = new Date(currentWeek); d.setDate(d.getDate() - 7); setCurrentWeek(getWeekStart(d)); }} className="px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => setCurrentWeek(getWeekStart(new Date()))} className="px-2 py-1 rounded text-[10px] font-semibold" style={{ border: "1px solid var(--color-border)" }}>Now</button>
            <button onClick={() => { const d = new Date(currentWeek); d.setDate(d.getDate() + 7); setCurrentWeek(getWeekStart(d)); }} className="px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
        <p className="text-xs mt-1 text-center" style={{ color: "var(--color-text-muted)" }}>{weekLabel}</p>
      </header>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</div>
        ) : (
          <>
            {/* Week summary */}
            <div className="rounded-2xl p-4" style={{ background: "var(--color-surface-1)", border: `1px solid ${isOvertime ? "rgba(220,38,38,0.3)" : "var(--color-border)"}` }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Weekly Total</p>
                  {isOvertime && <p className="text-[10px] font-bold" style={{ color: "#DC2626" }}>OVERTIME</p>}
                </div>
                <p className="text-2xl font-bold" style={{ color: isOvertime ? "#DC2626" : "#C2410C" }}>{minutesToDecimal(weekTotal)}h</p>
              </div>
              <div className="w-full h-2 rounded-full mt-2" style={{ background: "var(--color-surface-3)" }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, (weekTotal / 60 / 40) * 100)}%`,
                  background: isOvertime ? "#DC2626" : weekTotal / 60 >= 35 ? "#F59E0B" : "#16A34A",
                }} />
              </div>
              <p className="text-[10px] mt-1 text-right" style={{ color: "var(--color-text-muted)" }}>{minutesToDecimal(weekTotal)} / 40.0 hours</p>
            </div>

            {/* Daily breakdown */}
            {dailyData.map((day) => {
              const isToday = day.date === isoDate(new Date());
              return (
                <div key={day.date} className="rounded-2xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: isToday ? "1px solid rgba(37,99,235,0.3)" : "1px solid var(--color-border)" }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ background: isToday ? "rgba(37,99,235,0.06)" : undefined }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{day.dayName}</span>
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#2563EB", color: "#fff" }}>Today</span>}
                    </div>
                    <span className="text-sm font-bold" style={{ color: day.totalMinutes > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                      {day.totalMinutes > 0 ? `${minutesToDecimal(day.totalMinutes)}h` : "—"}
                    </span>
                  </div>
                  {day.entries.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {day.entries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between py-1.5">
                          <div>
                            <span className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {formatTime(entry.clockInAt)} → {entry.clockOutAt ? formatTime(entry.clockOutAt) : <span style={{ color: "#F59E0B" }}>Active</span>}
                            </span>
                            {entry.edited && <span className="text-[10px] ml-1.5" style={{ color: "#F59E0B" }}>(edited)</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                              {entry.totalMinutes ? formatHours(entry.totalMinutes) : "..."}
                            </span>
                            {entry.status === "closed" && (
                              <button onClick={() => openEditRequest(entry)} className="text-[10px] px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)", color: "#2563EB" }}>
                                Request Edit
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Edit Request Modal */}
      {showEditRequest && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end">
          <div className="w-full max-w-md mx-auto rounded-t-2xl p-4" style={{ background: "var(--color-surface-1)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Request Time Edit</h3>
              <button onClick={() => setShowEditRequest(null)} style={{ color: "var(--color-text-muted)" }}>✕</button>
            </div>
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Current: {formatTime(showEditRequest.clockInAt)} → {showEditRequest.clockOutAt ? formatTime(showEditRequest.clockOutAt) : "Active"}
              </p>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Corrected Clock In</label>
                <input type="datetime-local" value={editRequestForm.clockInAt} onChange={(e) => setEditRequestForm({ ...editRequestForm, clockInAt: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Corrected Clock Out</label>
                <input type="datetime-local" value={editRequestForm.clockOutAt} onChange={(e) => setEditRequestForm({ ...editRequestForm, clockOutAt: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Reason (required)</label>
                <input type="text" value={editRequestForm.reason} onChange={(e) => setEditRequestForm({ ...editRequestForm, reason: e.target.value })} placeholder="Why does this need to be changed?" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              </div>
              {requestStatus && <p className="text-xs" style={{ color: requestStatus.includes("submitted") ? "#16A34A" : "#DC2626" }}>{requestStatus}</p>}
            </div>
            <button onClick={submitEditRequest} disabled={!editRequestForm.reason} className="w-full mt-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
              Submit Edit Request
            </button>
          </div>
        </div>
      )}

      <TechBottomNav active="profile" />
    </div>
  );
}
