"use client";

import { useState, useEffect } from "react";

type JobStatus =
  | "completed"
  | "in_progress"
  | "en_route"
  | "scheduled"
  | "callback";

interface Job {
  id: string;
  jobNumber: string;
  time: string;
  duration: string;
  type: string;
  typeColor: string;
  typeBg: string;
  status: JobStatus;
  customer: string;
  address: string;
  city: string;
  unit: string;
  tech: string;
  techInitials: string;
  techColor: string;
  priority?: "emergency" | "high";
  checklistPct?: number;
  photosCount?: number;
  notes?: string;
}

// Map API job to UI format
function mapJobToUI(job: {
  id: string;
  jobNumber: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  jobType: string;
  status: string;
  customerName: string;
  propertyAddress: string;
  fireplaceUnit?: { brand: string; model: string; nickname?: string };
  assignedTechs: Array<{ name: string; color: string }>;
  priority: string;
  notes?: string;
}): Job {
  const typeColors: Record<string, { color: string; bg: string }> = {
    cleaning: { color: "#2563EB", bg: "rgba(29,78,216,0.12)" },
    inspection: { color: "#2563EB", bg: "rgba(37,99,235,0.12)" },
    repair: { color: "#FF204E", bg: "rgba(255,32,78,0.12)" },
    installation: { color: "#2563EB", bg: "rgba(29,78,216,0.12)" },
    service: { color: "#2563EB", bg: "rgba(37,99,235,0.12)" },
    estimate: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  };
  
  const tc = typeColors[job.jobType] || { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
  const tech = job.assignedTechs[0];
  const addressParts = job.propertyAddress.split(",");
  
  const getDuration = (start: string, end: string): string => {
    try {
      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);
      const hours = (endH + endM/60) - (startH + startM/60);
      if (hours <= 1) return "1h";
      if (hours === 1.5) return "1.5h";
      return `${Math.floor(hours)}h`;
    } catch { return "1h"; }
  };
  
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    time: job.scheduledTimeStart,
    duration: getDuration(job.scheduledTimeStart, job.scheduledTimeEnd),
    type: job.jobType.charAt(0).toUpperCase() + job.jobType.slice(1),
    typeColor: tc.color,
    typeBg: tc.bg,
    status: job.status as JobStatus,
    customer: job.customerName,
    address: addressParts[0] || job.propertyAddress,
    city: addressParts[1]?.trim() || "",
    unit: job.fireplaceUnit ? `${job.fireplaceUnit.brand} ${job.fireplaceUnit.model}` : "TBD",
    tech: tech?.name || "Unassigned",
    techInitials: tech?.name?.split(" ").map(n => n[0]).join("") || "?",
    techColor: tech?.color || "#6b7280",
    priority: job.priority === "urgent" ? "emergency" : job.priority === "high" ? "high" : undefined,
    checklistPct: job.status === "completed" ? 100 : job.status === "in_progress" ? 65 : 0,
    photosCount: Math.floor(Math.random() * 5),
    notes: job.notes,
  };
}

const statusConfig: Record<
  JobStatus,
  { label: string; color: string; bg: string; dotColor: string; pulse: boolean }
> = {
  completed: {
    label: "Completed",
    color: "#98CD00",
    bg: "rgba(152,205,0,0.12)",
    dotColor: "#98CD00",
    pulse: false,
  },
  in_progress: {
    label: "In Progress",
    color: "#2563EB",
    bg: "rgba(29,78,216,0.12)",
    dotColor: "#2563EB",
    pulse: true,
  },
  en_route: {
    label: "En Route",
    color: "#f8971f",
    bg: "rgba(255,68,0,0.12)",
    dotColor: "#f8971f",
    pulse: true,
  },
  scheduled: {
    label: "Scheduled",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.1)",
    dotColor: "#64748b",
    pulse: false,
  },
  callback: {
    label: "Callback",
    color: "#FF204E",
    bg: "rgba(255,32,78,0.12)",
    dotColor: "#FF204E",
    pulse: false,
  },
};

export default function TodaysJobs() {
  const [filter, setFilter] = useState<"all" | JobStatus>("all");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    fetch(`/api/jobs?date=${today}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.jobs) {
          setJobs(data.jobs.map(mapJobToUI));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  const counts = {
    all: jobs.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    in_progress: jobs.filter((j) => j.status === "in_progress").length,
    en_route: jobs.filter((j) => j.status === "en_route").length,
    scheduled: jobs.filter((j) => j.status === "scheduled").length,
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div>
          <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
            {"Today's Jobs"}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Monday, February 24, 2026
          </p>
        </div>
        <button
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
          style={{
            background: "rgba(29,78,216,0.15)",
            color: "#2563EB",
            border: "1px solid rgba(29,78,216,0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(29,78,216,0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(29,78,216,0.15)";
          }}
        >
          + New Job
        </button>
      </div>

      {/* Filter tabs */}
      <div
        className="flex gap-1.5 px-5 py-3 overflow-x-auto scrollbar-hide"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        {(
          [
            "all",
            "in_progress",
            "en_route",
            "scheduled",
            "completed",
          ] as const
        ).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter === f ? "var(--color-ember)" : "var(--color-surface-3)",
              color: filter === f ? "white" : "var(--color-text-secondary)",
              border: `1px solid ${filter === f ? "transparent" : "var(--color-border)"}`,
            }}
          >
            {f === "all"
              ? `All (${counts.all})`
              : f === "in_progress"
                ? `In Progress (${counts.in_progress})`
                : f === "en_route"
                  ? `En Route (${counts.en_route})`
                  : f === "scheduled"
                    ? `Scheduled (${counts.scheduled})`
                    : `Done (${counts.completed})`}
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="p-8 text-center" style={{ color: "var(--color-text-muted)" }}>
          Loading jobs...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center" style={{ color: "var(--color-text-muted)" }}>
          No jobs scheduled for today
        </div>
      ) : (
        <div>
          {filtered.map((job, idx) => {
            const sc = statusConfig[job.status];
            return (
              <div
                key={job.id}
                className="px-5 py-3.5 cursor-pointer transition-all"
                style={{
                  borderBottom: idx < filtered.length - 1 ? "1px solid var(--color-border)" : "none",
                  borderLeft: job.priority === "emergency"
                    ? "3px solid #FF204E"
                    : job.priority === "high"
                      ? "3px solid #f8971f"
                      : "3px solid transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface-3)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Time column */}
                  <div className="w-14 flex-shrink-0 text-center pt-0.5">
                    <div className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {job.time}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      {job.duration}
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {/* Type badge */}
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        style={{ background: job.typeBg, color: job.typeColor }}
                      >
                        {job.type}
                      </span>
                      {/* Status badge */}
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1"
                        style={{ background: sc.bg, color: sc.color }}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${sc.pulse ? "pulse-dot" : ""}`}
                          style={{ background: sc.dotColor }}
                        ></span>
                        {sc.label}
                      </span>
                      {/* Priority badges */}
                      {job.priority === "emergency" && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                          style={{ background: "rgba(255,32,78,0.2)", color: "#FF204E" }}
                        >
                          ⚡ EMERGENCY
                        </span>
                      )}
                      {job.priority === "high" && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                          style={{ background: "rgba(255,68,0,0.2)", color: "#f8971f" }}
                        >
                          ↑ HIGH
                        </span>
                      )}
                      <span className="text-[10px] ml-auto" style={{ color: "var(--color-text-muted)" }}>
                        {job.jobNumber}
                      </span>
                    </div>

                    <div className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                      {job.customer}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                      {job.address}, {job.city}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {job.unit}
                    </div>

                    {job.notes && (
                      <div
                        className="mt-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                        style={{
                          background: "rgba(255,68,0,0.1)",
                          color: "#f8971f",
                          border: "1px solid rgba(255,68,0,0.15)",
                        }}
                      >
                        {job.notes}
                      </div>
                    )}

                    {/* Progress indicators */}
                    {job.status !== "scheduled" && (
                      <div className="flex items-center gap-4 mt-2">
                        {job.checklistPct !== undefined && (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-20 h-1 rounded-full overflow-hidden"
                              style={{ background: "var(--color-surface-4)" }}
                            >
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${job.checklistPct}%`,
                                  background: job.checklistPct === 100 ? "#98CD00" : "#2563EB",
                                }}
                              ></div>
                            </div>
                            <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                              {job.checklistPct}%
                            </span>
                          </div>
                        )}
                        {job.photosCount !== undefined && job.photosCount > 0 && (
                          <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                            {job.photosCount} photos
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tech avatar */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div
                      className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center"
                      style={{ background: job.techColor }}
                    >
                      {job.techInitials}
                    </div>
                    <span
                      className="text-[9px] text-center leading-tight max-w-[40px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {job.tech.split(" ")[0]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface-1)",
        }}
      >
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Showing {filtered.length} of {jobs.length} jobs
        </span>
        <button
          className="text-xs font-medium transition-colors"
          style={{ color: "#2563EB" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#2563EB")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#2563EB")}
        >
          View full schedule →
        </button>
      </div>
    </div>
  );
}
