"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

const mockTechs = [
  {
    id: "tech-001",
    name: "Mike Johnson",
    color: "#3b82f6",
    initials: "MJ",
    status: "on_job",
    currentJob: { id: "job-001", title: "Annual Cleaning", customer: "Linda Martinez", address: "123 Oak Street" },
    nextJob: { id: "job-005", title: "Inspection", customer: "Tom Bradley", scheduledTime: "2:00 PM" },
    lat: 39.7817,
    lng: -89.6501,
    lastUpdate: "2 min ago",
    jobsToday: 3,
    jobsDone: 1,
  },
  {
    id: "tech-002",
    name: "Sarah Williams",
    color: "#10b981",
    initials: "SW",
    status: "driving",
    currentJob: null,
    nextJob: { id: "job-002", title: "Gas Installation", customer: "Robert Chen", scheduledTime: "10:00 AM" },
    lat: 39.7950,
    lng: -89.6440,
    lastUpdate: "5 min ago",
    jobsToday: 2,
    jobsDone: 0,
  },
  {
    id: "tech-003",
    name: "Tom Davis",
    color: "#f59e0b",
    initials: "TD",
    status: "available",
    currentJob: null,
    nextJob: null,
    lat: 39.7700,
    lng: -89.6600,
    lastUpdate: "1 min ago",
    jobsToday: 1,
    jobsDone: 1,
  },
  {
    id: "tech-004",
    name: "Chris Lee",
    color: "#8b5cf6",
    initials: "CL",
    status: "break",
    currentJob: null,
    nextJob: { id: "job-006", title: "Pellet Stove Service", customer: "Susan Park", scheduledTime: "1:00 PM" },
    lat: 39.7850,
    lng: -89.6350,
    lastUpdate: "8 min ago",
    jobsToday: 2,
    jobsDone: 1,
  },
];

const unassignedJobs = [
  { id: "job-007", title: "Fireplace Estimate", customer: "James Wilson", address: "555 Cedar Lane", scheduledTime: "3:00 PM", jobType: "estimate", priority: "normal" },
  { id: "job-008", title: "Gas Leak Check", customer: "Mary Johnson", address: "789 Birch Drive", scheduledTime: "4:00 PM", jobType: "repair", priority: "urgent" },
];

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  on_job: { label: "On Job", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  driving: { label: "Driving", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  available: { label: "Available", color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  break: { label: "On Break", color: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
  offline: { label: "Offline", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

export default function DispatchPage() {
  const [selectedTech, setSelectedTech] = useState<typeof mockTechs[0] | null>(null);
  const [dragOverTech, setDragOverTech] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {/* Page Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Dispatch</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {mockTechs.filter(t => t.status !== "offline").length} techs active · {unassignedJobs.length} unassigned jobs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              Live Tracking
            </div>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(135deg, #4f46e5, #3730a3)", color: "white", boxShadow: "0 0 16px rgba(79,70,229,0.25)" }}
            >
              Dispatch Job
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Map Area */}
          <div className="flex-1 relative overflow-hidden">
            {/* Map Placeholder */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
              }}
            >
              {/* Grid lines to simulate map */}
              <div className="absolute inset-0 opacity-10">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={`h${i}`} className="absolute w-full border-t" style={{ top: `${i * 5}%`, borderColor: "#60a5fa" }} />
                ))}
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={`v${i}`} className="absolute h-full border-l" style={{ left: `${i * 5}%`, borderColor: "#60a5fa" }} />
                ))}
              </div>

              {/* Road lines */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute w-full border-t-2" style={{ top: "35%", borderColor: "#94a3b8" }} />
                <div className="absolute w-full border-t-2" style={{ top: "60%", borderColor: "#94a3b8" }} />
                <div className="absolute h-full border-l-2" style={{ left: "30%", borderColor: "#94a3b8" }} />
                <div className="absolute h-full border-l-2" style={{ left: "65%", borderColor: "#94a3b8" }} />
              </div>

              {/* Tech Markers */}
              {mockTechs.map((tech, idx) => {
                const positions = [
                  { top: "40%", left: "35%" },
                  { top: "25%", left: "55%" },
                  { top: "65%", left: "28%" },
                  { top: "45%", left: "70%" },
                ];
                const pos = positions[idx];
                return (
                  <button
                    key={tech.id}
                    onClick={() => setSelectedTech(tech)}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-110"
                    style={{ top: pos.top, left: pos.left }}
                  >
                    <div className="relative">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg"
                        style={{
                          background: tech.color,
                          boxShadow: `0 0 20px ${tech.color}60`,
                          border: selectedTech?.id === tech.id ? "3px solid white" : "2px solid rgba(255,255,255,0.3)",
                        }}
                      >
                        {tech.initials}
                      </div>
                      {/* Status dot */}
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900"
                        style={{ background: statusConfig[tech.status].color }}
                      />
                      {/* Pulse for on_job */}
                      {tech.status === "on_job" && (
                        <div
                          className="absolute inset-0 rounded-full animate-ping opacity-30"
                          style={{ background: tech.color }}
                        />
                      )}
                    </div>
                    {/* Name label */}
                    <div
                      className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                      style={{ background: "rgba(0,0,0,0.7)", color: "white" }}
                    >
                      {tech.name.split(" ")[0]}
                    </div>
                  </button>
                );
              })}

              {/* Job location markers */}
              {unassignedJobs.map((job, idx) => {
                const positions = [
                  { top: "55%", left: "45%" },
                  { top: "30%", left: "75%" },
                ];
                const pos = positions[idx];
                return (
                  <div
                    key={job.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2"
                    style={{ top: pos.top, left: pos.left }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                      style={{
                        background: job.priority === "urgent" ? "rgba(248,113,113,0.9)" : "rgba(79,70,229,0.9)",
                        border: "2px solid rgba(255,255,255,0.4)",
                        boxShadow: "0 0 12px rgba(79,70,229,0.4)",
                      }}
                    >
                      📍
                    </div>
                  </div>
                );
              })}

              {/* Map attribution */}
              <div className="absolute bottom-4 right-4 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                Map integration requires Google Maps API key
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div
            className="w-[340px] flex-shrink-0 flex flex-col overflow-hidden border-l"
            style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
          >
            {/* Tech Status List */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Technicians</h3>
              </div>

              <div className="p-3 space-y-2">
                {mockTechs.map((tech) => (
                  <button
                    key={tech.id}
                    onClick={() => setSelectedTech(selectedTech?.id === tech.id ? null : tech)}
                    className={`w-full rounded-xl p-3 text-left transition-all ${selectedTech?.id === tech.id ? "ring-2 ring-orange-500" : ""}`}
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: tech.color }}
                      >
                        {tech.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{tech.name}</span>
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ background: statusConfig[tech.status].bg, color: statusConfig[tech.status].color }}
                          >
                            {statusConfig[tech.status].label}
                          </span>
                        </div>
                        {tech.currentJob && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                            📍 {tech.currentJob.title} — {tech.currentJob.customer}
                          </p>
                        )}
                        {!tech.currentJob && tech.nextJob && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
                            Next: {tech.nextJob.title} @ {tech.nextJob.scheduledTime}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                            {tech.jobsDone}/{tech.jobsToday} jobs done
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                            Updated {tech.lastUpdate}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Unassigned Jobs */}
              <div className="px-4 py-3" style={{ borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
                <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                  Unassigned Jobs
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                    {unassignedJobs.length}
                  </span>
                </h3>
              </div>

              <div className="p-3 space-y-2">
                {unassignedJobs.map((job) => (
                  <div
                    key={job.id}
                    draggable
                    className="rounded-xl p-3 cursor-grab active:cursor-grabbing"
                    style={{
                      background: "var(--color-surface-2)",
                      border: `1px solid ${job.priority === "urgent" ? "rgba(248,113,113,0.4)" : "var(--color-border)"}`,
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {job.priority === "urgent" && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                              URGENT
                            </span>
                          )}
                          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{job.title}</span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{job.customer}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{job.address}</p>
                        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>⏰ {job.scheduledTime}</p>
                      </div>
                      <button
                        className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: "linear-gradient(135deg, #4f46e5, #3730a3)", color: "white" }}
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Tech Detail */}
            {selectedTech && (
              <div
                className="border-t p-4"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: selectedTech.color }}
                  >
                    {selectedTech.initials}
                  </div>
                  <div>
                    <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{selectedTech.name}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Last seen {selectedTech.lastUpdate}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--color-surface-3)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                    📞 Call
                  </button>
                  <button className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--color-surface-3)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                    💬 Message
                  </button>
                  <button className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "linear-gradient(135deg, #4f46e5, #3730a3)", color: "white" }}>
                    + Assign Job
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
