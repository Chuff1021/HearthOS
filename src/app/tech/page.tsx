"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TechBottomNav from "@/components/tech/TechBottomNav";

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
  }, []);

  const upcomingJobs = useMemo(
    () => (session?.jobs || []).filter((job) => !["completed", "cancelled"].includes(job.status)),
    [session]
  );

  const handleClock = async () => {
    if (!session?.tech?.id) return;
    setBusyAction("clock");
    try {
      const res = await fetch("/api/time/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: session.clockEntry ? "clock_out" : "clock_in",
          techId: session.tech.id,
          techName: session.tech.name,
        }),
      });
      if (!res.ok) throw new Error("Failed to update time entry");
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

  const isClockedIn = !!session?.clockEntry;

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
            <div className="flex items-center justify-end gap-1 text-xs" style={{ color: session?.latestLocation ? "#15803D" : "var(--color-text-muted)" }}>
              <div
                className={`w-2 h-2 rounded-full ${session?.latestLocation ? "animate-pulse" : ""}`}
                style={{ background: session?.latestLocation ? "#16A34A" : "var(--color-text-muted)" }}
              />
              {session?.latestLocation ? "GPS Live" : "GPS Pending"}
            </div>
            {session?.latestLocation ? (
              <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                Last ping {formatTime(session.latestLocation.timestamp)}
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
                {isClockedIn && session?.clockEntry ? `Clocked in at ${formatTime(session.clockEntry.clockInAt)}` : "Clock in to begin field tracking and job time."}
              </p>
            </div>
            <button
              onClick={handleClock}
              disabled={busyAction === "clock" || loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: isClockedIn ? "rgba(255,68,0,0.14)" : "linear-gradient(135deg, #FF6A00, #F59E0B)", color: isClockedIn ? "#C2410C" : "#fff" }}
            >
              {busyAction === "clock" ? "Saving..." : isClockedIn ? "Clock Out" : "Clock In"}
            </button>
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

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Assigned Jobs</h2>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                {loading ? "Loading jobs..." : `${upcomingJobs.length} active jobs assigned to you`}
              </p>
            </div>
            <Link href="/tech/profile" className="text-sm font-medium" style={{ color: "#C2410C" }}>
              Profile
            </Link>
          </div>

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
        </div>
      </div>

      <TechBottomNav active="jobs" />
    </div>
  );
}
