"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TechBottomNav from "@/components/tech/TechBottomNav";
import { useGpsStatus } from "@/components/tech/GpsStatusContext";

type TechJob = {
  id: string;
  jobNumber: string;
  title: string;
  customerName: string;
  propertyAddress: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "on_hold";
  priority: "low" | "normal" | "high" | "urgent";
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  fireplaceUnit?: {
    brand?: string;
    model?: string;
    nickname?: string;
  };
};

type TechSession = {
  tech: {
    id: string;
    name: string;
    email: string;
  };
  jobs: TechJob[];
  activeJob: TechJob | null;
  clockEntry: {
    id: string;
    clockInAt: string;
    status: "open" | "closed";
  } | null;
  latestLocation: {
    timestamp: string;
  } | null;
  stats: {
    jobsToday: number;
    jobsCompletedToday: number;
    upcomingJobs: number;
    milesToday?: number;
  };
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatSchedule(job: TechJob) {
  const date = new Date(`${job.scheduledDate}T${job.scheduledTimeStart || "09:00"}`);
  if (Number.isNaN(date.getTime())) return `${job.scheduledDate} ${job.scheduledTimeStart}`;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fireplaceLabel(job: TechJob) {
  const brand = job.fireplaceUnit?.brand || "";
  const model = job.fireplaceUnit?.model || "";
  const nickname = job.fireplaceUnit?.nickname || "";
  return [brand, model, nickname].filter(Boolean).join(" ").trim();
}

export default function TechApp() {
  const [session, setSession] = useState<TechSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"clock" | string | null>(null);
  const [tab, setTab] = useState<"active" | "history">("active");
  const gps = useGpsStatus();

  const loadSession = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tech/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load tech workspace");
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tech workspace");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    const refresh = () => {
      void loadSession();
    };
    window.addEventListener("hearth-tech-clock-changed", refresh as EventListener);
    const intervalId = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("hearth-tech-clock-changed", refresh as EventListener);
      window.clearInterval(intervalId);
    };
  }, []);

  const upcomingJobs = useMemo(
    () => (session?.jobs || []).filter((job) => !["completed", "cancelled"].includes(job.status)),
    [session]
  );

  const completedJobs = useMemo(
    () => (session?.jobs || []).filter((job) => ["completed", "cancelled"].includes(job.status)),
    [session]
  );

  const handleClock = async () => {
    if (!session?.tech?.id) return;
    setBusyAction("clock");
    try {
      const action = session.clockEntry ? "clock_out" : "clock_in";
      const res = await fetch("/api/time/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          techId: session.tech.id,
          techName: session.tech.name,
        }),
      });
      if (!res.ok) throw new Error("Failed to update time entry");
      window.dispatchEvent(new Event("hearth-tech-clock-changed"));
      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update time entry");
    } finally {
      setBusyAction(null);
    }
  };

  const handleJobStatus = async (job: TechJob) => {
    setBusyAction(job.id);
    const nextStatus = job.status === "in_progress" ? "completed" : "in_progress";
    try {
      const res = await fetch("/api/jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, status: nextStatus }),
      });
      if (!res.ok) throw new Error("Failed to update job");
      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update job");
    } finally {
      setBusyAction(null);
    }
  };

  const handleReopenJob = async (job: TechJob) => {
    setBusyAction(job.id + "-reopen");
    try {
      const res = await fetch("/api/jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, status: "in_progress" }),
      });
      if (!res.ok) throw new Error("Failed to reopen job");
      await loadSession();
      setTab("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen job");
    } finally {
      setBusyAction(null);
    }
  };

  const isClockedIn = !!session?.clockEntry;

  // Re-fetch session when app returns from background (tab switch, phone lock, etc.)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void loadSession();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>HearthOS</h1>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              {session?.tech?.name || "Tech Dashboard"}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-xs" style={{ color: gps.isTracking ? "#15803D" : gps.error === "location_denied" ? "#DC2626" : "var(--color-text-muted)" }}>
              <div
                className={`w-2 h-2 rounded-full ${gps.isTracking ? "animate-pulse" : ""}`}
                style={{ background: gps.isTracking ? "#16A34A" : gps.error === "location_denied" ? "#DC2626" : "var(--color-text-muted)" }}
              />
              {gps.isTracking ? "GPS Live" : gps.error === "location_denied" ? "GPS Blocked" : "GPS Off"}
            </div>
            {gps.isTracking && gps.lastPingAt ? (
              <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                Last ping {formatTime(gps.lastPingAt)}
              </p>
            ) : gps.error === "location_denied" ? (
              <p className="text-[11px] mt-1 font-semibold" style={{ color: "#DC2626" }}>
                Allow location in browser settings
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {error ? (
          <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,68,0,0.10)", border: "1px solid rgba(255,68,0,0.22)", color: "#C2410C" }}>
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-subtle)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {isClockedIn ? "You are clocked in" : "Ready to start your shift?"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                {isClockedIn && session?.clockEntry
                  ? `Clocked in at ${formatTime(session.clockEntry.clockInAt)}`
                  : "Clock in to begin field tracking and job time."}
              </p>
            </div>
            {isClockedIn ? (
              <button
                onClick={handleClock}
                disabled={busyAction === "clock" || loading}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ background: "rgba(255,68,0,0.14)", color: "#C2410C" }}
              >
                {busyAction === "clock" ? "Saving..." : "Clock Out"}
              </button>
            ) : (
              <button
                onClick={handleClock}
                disabled={busyAction === "clock" || loading}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}
              >
                {busyAction === "clock" ? "Saving..." : "Clock In"}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today", value: session?.stats.jobsToday ?? 0 },
            { label: "Done", value: session?.stats.jobsCompletedToday ?? 0 },
            { label: "Open", value: session?.stats.upcomingJobs ?? 0 },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl p-3" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <p className="text-2xl font-bold" style={{ color: "#C2410C" }}>{stat.value}</p>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{stat.label} Jobs</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Miles Today</p>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Saved from live GPS pings while clocked in
              </p>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#C2410C" }}>
              {(session?.stats.milesToday ?? 0).toFixed(1)}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTab("active")}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: tab === "active" ? "linear-gradient(135deg, #FF6A00, #F59E0B)" : "var(--color-surface-3)",
                  color: tab === "active" ? "#fff" : "var(--color-text-muted)",
                  border: tab === "active" ? "none" : "1px solid var(--color-border)",
                }}
              >
                Active ({upcomingJobs.length})
              </button>
              <button
                onClick={() => setTab("history")}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: tab === "history" ? "linear-gradient(135deg, #FF6A00, #F59E0B)" : "var(--color-surface-3)",
                  color: tab === "history" ? "#fff" : "var(--color-text-muted)",
                  border: tab === "history" ? "none" : "1px solid var(--color-border)",
                }}
              >
                History ({completedJobs.length})
              </button>
            </div>
            <Link href="/tech/profile" className="text-sm font-medium" style={{ color: "#C2410C" }}>
              Profile
            </Link>
          </div>

          {tab === "active" && (
            <>
              {loading ? (
                <div className="rounded-2xl p-4 text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  Loading your jobs...
                </div>
              ) : upcomingJobs.length === 0 ? (
                <div className="rounded-2xl p-5 text-center" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>No jobs assigned right now</p>
                  <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                    Once dispatch assigns work to your team record, it will show here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingJobs.map((job) => {
                    const statusLabel =
                      job.status === "in_progress" ? "In Progress" :
                      job.status === "on_hold" ? "On Hold" :
                      job.status === "scheduled" ? "Scheduled" :
                      job.status;

                    return (
                      <div
                        key={job.id}
                        className="rounded-2xl p-4"
                        style={{
                          background: "var(--color-surface-1)",
                          border: "1px solid var(--color-border)",
                          boxShadow: "var(--shadow-subtle)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{job.customerName}</h3>
                            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{job.title}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex px-2 py-1 rounded-full text-[11px] font-semibold" style={{ background: "rgba(255,106,0,0.10)", color: "#C2410C" }}>
                              {statusLabel}
                            </span>
                            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{formatSchedule(job)}</p>
                          </div>
                        </div>

                        <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>{job.propertyAddress}</p>
                        {fireplaceLabel(job) ? (
                          <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
                            Unit: {fireplaceLabel(job)}
                          </p>
                        ) : null}

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/tech/job/${job.id}`}
                            className="flex-1 text-center py-2 rounded-lg text-sm font-medium transition-colors"
                            style={{
                              background: "var(--color-surface-3)",
                              color: "var(--color-text-primary)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            View Details
                          </Link>
                          <button
                            onClick={() => handleJobStatus(job)}
                            disabled={!isClockedIn || busyAction === job.id}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!isClockedIn ? "cursor-not-allowed opacity-50" : ""}`}
                            style={{
                              background: job.status === "in_progress" ? "rgba(22,163,74,0.14)" : "linear-gradient(135deg, #FF6A00, #F59E0B)",
                              color: job.status === "in_progress" ? "#15803D" : "#fff",
                            }}
                          >
                            {busyAction === job.id ? "Saving..." : job.status === "in_progress" ? "Complete Job" : "Start Job"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "history" && (
            <>
              {loading ? (
                <div className="rounded-2xl p-4 text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  Loading job history...
                </div>
              ) : completedJobs.length === 0 ? (
                <div className="rounded-2xl p-5 text-center" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>No completed jobs yet</p>
                  <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                    Completed and cancelled jobs will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-2xl p-4"
                      style={{
                        background: "var(--color-surface-1)",
                        border: "1px solid var(--color-border)",
                        opacity: job.status === "cancelled" ? 0.6 : 1,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{job.customerName}</h3>
                          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{job.title}</p>
                        </div>
                        <div className="text-right">
                          <span
                            className="inline-flex px-2 py-1 rounded-full text-[11px] font-semibold"
                            style={{
                              background: job.status === "completed" ? "rgba(22,163,74,0.12)" : "rgba(239,68,68,0.12)",
                              color: job.status === "completed" ? "#15803D" : "#DC2626",
                            }}
                          >
                            {job.status === "completed" ? "Completed" : "Cancelled"}
                          </span>
                          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{formatSchedule(job)}</p>
                        </div>
                      </div>

                      <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>{job.propertyAddress}</p>
                      {fireplaceLabel(job) ? (
                        <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                          Unit: {fireplaceLabel(job)}
                        </p>
                      ) : null}

                      <div className="flex gap-2">
                        {job.status === "completed" && (
                          <button
                            onClick={() => handleReopenJob(job)}
                            disabled={busyAction === job.id + "-reopen"}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
                            style={{
                              background: busyAction === job.id + "-reopen" ? "var(--color-surface-3)" : "rgba(234,88,12,0.12)",
                              color: busyAction === job.id + "-reopen" ? "var(--color-text-muted)" : "#EA580C",
                              border: "1px solid rgba(234,88,12,0.3)",
                            }}
                          >
                            {busyAction === job.id + "-reopen" ? "Reopening..." : "Reopen Job"}
                          </button>
                        )}
                        <Link
                          href={`/tech/job/${job.id}`}
                          className="flex-1 block text-center py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{
                            background: "var(--color-surface-3)",
                            color: "var(--color-text-primary)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <TechBottomNav active="jobs" />
    </div>
  );
}
