"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// Mock schedule data
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 7); // 7am - 5pm

const mockTechs = [
  { id: "tech-001", name: "Mike Johnson", color: "#2563EB", initials: "MJ" },
  { id: "tech-002", name: "Sarah Williams", color: "#98CD00", initials: "SW" },
  { id: "tech-003", name: "Tom Davis", color: "#FF4400", initials: "TD" },
  { id: "tech-004", name: "Chris Lee", color: "#2563EB", initials: "CL" },
];

const mockJobs = [
  {
    id: "job-001",
    title: "Annual Cleaning",
    customer: "Linda Martinez",
    techId: "tech-001",
    day: 1, // Monday
    startHour: 9,
    duration: 2,
    status: "scheduled",
    jobType: "cleaning",
  },
  {
    id: "job-002",
    title: "Gas Installation",
    customer: "Robert Chen",
    techId: "tech-002",
    day: 1,
    startHour: 10,
    duration: 6,
    status: "in_progress",
    jobType: "installation",
  },
  {
    id: "job-003",
    title: "Pilot Light Repair",
    customer: "Patricia Williams",
    techId: "tech-001",
    day: 0, // Sunday
    startHour: 14,
    duration: 1.5,
    status: "completed",
    jobType: "repair",
  },
  {
    id: "job-004",
    title: "Wood Stove Inspection",
    customer: "Tom Bradley",
    techId: "tech-003",
    day: 2, // Tuesday
    startHour: 11,
    duration: 1,
    status: "scheduled",
    jobType: "inspection",
  },
  {
    id: "job-005",
    title: "Pellet Stove Service",
    customer: "Susan Park",
    techId: "tech-004",
    day: 3, // Wednesday
    startHour: 13,
    duration: 2,
    status: "scheduled",
    jobType: "service",
  },
  {
    id: "job-006",
    title: "Fireplace Estimate",
    customer: "James Wilson",
    techId: "tech-002",
    day: 4, // Thursday
    startHour: 9,
    duration: 1,
    status: "scheduled",
    jobType: "estimate",
  },
  {
    id: "job-007",
    title: "Annual Cleaning",
    customer: "Mary Johnson",
    techId: "tech-003",
    day: 5, // Friday
    startHour: 8,
    duration: 2,
    status: "scheduled",
    jobType: "cleaning",
  },
];

const statusColors: Record<string, string> = {
  scheduled: "rgba(29,78,216,0.85)",
  in_progress: "rgba(255,68,0,0.85)",
  completed: "rgba(152,205,0,0.85)",
  cancelled: "rgba(255,32,78,0.85)",
};

const jobTypeEmoji: Record<string, string> = {
  installation: "🔧",
  service: "🛠️",
  inspection: "🔍",
  cleaning: "🧹",
  repair: "⚡",
  estimate: "📋",
};

// Get week dates starting from Sunday
function getWeekDates(baseDate: Date): Date[] {
  const dates = [];
  const sunday = new Date(baseDate);
  sunday.setDate(baseDate.getDate() - baseDate.getDay());
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export default function SchedulePage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [selectedTechs, setSelectedTechs] = useState<string[]>(mockTechs.map((t) => t.id));

  const weekDates = getWeekDates(currentDate);
  const today = new Date();

  const goToPrevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const goToNextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

  const toggleTech = (techId: string) => {
    setSelectedTechs((prev) =>
      prev.includes(techId) ? prev.filter((id) => id !== techId) : [...prev, techId]
    );
  };

  const visibleJobs = mockJobs.filter((job) => selectedTechs.includes(job.techId));

  const monthYear = weekDates[0].toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
          <div className="flex items-center gap-4">
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Schedule</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevWeek}
                className="p-1.5 rounded-lg transition-all"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{monthYear}</span>
              <button
                onClick={goToNextWeek}
                className="p-1.5 rounded-lg transition-all"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={goToToday}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                Today
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              {(["week", "day"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="px-3 py-1.5 text-xs font-medium capitalize"
                  style={{
                    background: viewMode === mode ? "var(--color-surface-3)" : "var(--color-surface-2)",
                    color: viewMode === mode ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              onClick={() => router.push("/jobs")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(135deg, #2563EB, #2563EB)", color: "white", boxShadow: "0 0 16px rgba(29,78,216,0.25)" }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Schedule Job
            </button>
          </div>
        </div>

        {/* Tech Filter Bar */}
        <div
          className="px-6 py-3 flex items-center gap-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Techs:</span>
          {mockTechs.map((tech) => (
            <button
              key={tech.id}
              onClick={() => toggleTech(tech.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
              style={{
                background: selectedTechs.includes(tech.id) ? "var(--color-surface-3)" : "transparent",
                color: selectedTechs.includes(tech.id) ? "var(--color-text-primary)" : "var(--color-text-muted)",
                border: `1px solid ${selectedTechs.includes(tech.id) ? "var(--color-border-hover)" : "var(--color-border)"}`,
                opacity: selectedTechs.includes(tech.id) ? 1 : 0.6,
              }}
            >
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                style={{ background: tech.color }}
              >
                {tech.initials}
              </div>
              {tech.name}
            </button>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[900px]">
            {/* Day Headers */}
            <div className="grid sticky top-0 z-10" style={{ gridTemplateColumns: "60px repeat(7, 1fr)", background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
              <div className="py-3" />
              {weekDates.map((date, idx) => {
                const isToday = date.toDateString() === today.toDateString();
                return (
                  <div key={idx} className="py-3 text-center">
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{DAYS[idx]}</div>
                    <div
                      className={`text-lg font-bold mt-0.5 w-9 h-9 rounded-full flex items-center justify-center mx-auto ${isToday ? "text-white" : ""}`}
                      style={{
                        background: isToday ? "#2563EB" : "transparent",
                        color: isToday ? "white" : "var(--color-text-primary)",
                      }}
                    >
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="grid"
                  style={{
                    gridTemplateColumns: "60px repeat(7, 1fr)",
                    height: "80px",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {/* Hour Label */}
                  <div className="flex items-start justify-end pr-3 pt-1">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {hour === 12 ? "12pm" : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                    </span>
                  </div>

                  {/* Day Columns */}
                  {weekDates.map((_, dayIdx) => {
                    const isToday = weekDates[dayIdx].toDateString() === today.toDateString();
                    const jobsInSlot = visibleJobs.filter(
                      (job) => job.day === dayIdx && job.startHour === hour
                    );

                    return (
                      <div
                        key={dayIdx}
                        className="relative border-l"
                        style={{
                          borderColor: "var(--color-border)",
                          background: isToday ? "rgba(29,78,216,0.02)" : "transparent",
                        }}
                      >
                        {jobsInSlot.map((job) => {
                          const tech = mockTechs.find((t) => t.id === job.techId);
                          return (
                            <div
                              key={job.id}
                              className="absolute left-1 right-1 rounded-lg px-2 py-1 cursor-pointer overflow-hidden"
                              style={{
                                top: "2px",
                                height: `${job.duration * 80 - 4}px`,
                                background: tech?.color || "#2563EB",
                                opacity: 0.9,
                                zIndex: 1,
                              }}
                            >
                              <div className="text-[10px] font-bold text-white truncate">
                                {jobTypeEmoji[job.jobType]} {job.title}
                              </div>
                              <div className="text-[9px] text-white/80 truncate">{job.customer}</div>
                              <div className="text-[9px] text-white/70">{tech?.initials}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
