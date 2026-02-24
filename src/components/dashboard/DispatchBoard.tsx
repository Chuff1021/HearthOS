"use client";

const techs = [
  {
    id: 1,
    name: "Dave Torres",
    initials: "DT",
    color: "#f97316",
    status: "in_progress",
    statusLabel: "In Progress",
    statusColor: "#60a5fa",
    statusBg: "rgba(96,165,250,0.12)",
    currentJob: "JOB-2026-00143",
    currentCustomer: "Linda Martinez",
    currentType: "Service",
    location: "88 Pine Ave, Riverside",
    jobsToday: 3,
    jobsDone: 2,
    hoursWorked: "4h 12m",
    nextJob: "11:00 AM — Robert Chen",
    phone: "(555) 301-2244",
  },
  {
    id: 2,
    name: "Amy Walsh",
    initials: "AW",
    color: "#ec4899",
    status: "en_route",
    statusLabel: "En Route",
    statusColor: "#fbbf24",
    statusBg: "rgba(251,191,36,0.12)",
    currentJob: "JOB-2026-00144",
    currentCustomer: "Robert Chen",
    currentType: "Clean & Burn",
    location: "ETA 11 min",
    jobsToday: 3,
    jobsDone: 1,
    hoursWorked: "2h 45m",
    nextJob: "2:30 PM — Tom Bradley",
    phone: "(555) 412-8833",
  },
  {
    id: 3,
    name: "Jake Rivera",
    initials: "JR",
    color: "#2dd4bf",
    status: "scheduled",
    statusLabel: "Next at 1:00 PM",
    statusColor: "#94a3b8",
    statusBg: "rgba(148,163,184,0.1)",
    currentJob: null,
    currentCustomer: null,
    currentType: null,
    location: "At shop",
    jobsToday: 2,
    jobsDone: 0,
    hoursWorked: "0h",
    nextJob: "1:00 PM — Patricia Williams",
    phone: "(555) 567-9901",
  },
  {
    id: 4,
    name: "Carlos Mendez",
    initials: "CM",
    color: "#818cf8",
    status: "scheduled",
    statusLabel: "Next at 4:30 PM",
    statusColor: "#94a3b8",
    statusBg: "rgba(148,163,184,0.1)",
    currentJob: null,
    currentCustomer: null,
    currentType: null,
    location: "At shop",
    jobsToday: 2,
    jobsDone: 0,
    hoursWorked: "0h",
    nextJob: "4:30 PM — James O'Brien ⚡",
    phone: "(555) 678-1122",
  },
  {
    id: 5,
    name: "Maria Santos",
    initials: "MS",
    color: "#a78bfa",
    status: "off",
    statusLabel: "Day Off",
    statusColor: "#475569",
    statusBg: "rgba(71,85,105,0.1)",
    currentJob: null,
    currentCustomer: null,
    currentType: null,
    location: "—",
    jobsToday: 0,
    jobsDone: 0,
    hoursWorked: "—",
    nextJob: "—",
    phone: "(555) 789-3344",
  },
  {
    id: 6,
    name: "Ben Kowalski",
    initials: "BK",
    color: "#22d3ee",
    status: "off",
    statusLabel: "Vacation",
    statusColor: "#475569",
    statusBg: "rgba(71,85,105,0.1)",
    currentJob: null,
    currentCustomer: null,
    currentType: null,
    location: "—",
    jobsToday: 0,
    jobsDone: 0,
    hoursWorked: "—",
    nextJob: "—",
    phone: "(555) 890-5566",
  },
];

export default function DispatchBoard() {
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
            Dispatch Board
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Tech status · Live tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium"
            style={{
              background: "var(--color-surface-3)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text-primary)";
              e.currentTarget.style.borderColor = "var(--color-border-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)";
              e.currentTarget.style.borderColor = "var(--color-border)";
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            Map View
          </button>
          <button
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-semibold"
            style={{
              background: "linear-gradient(135deg, #f97316, #ea6c0a)",
              color: "white",
              boxShadow: "0 0 16px rgba(249,115,22,0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 0 24px rgba(249,115,22,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 0 16px rgba(249,115,22,0.25)";
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Assign Job
          </button>
        </div>
      </div>

      {/* Tech grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {techs.map((tech, idx) => (
          <div
            key={tech.id}
            className="p-4 cursor-pointer transition-all"
            style={{
              opacity: tech.status === "off" ? 0.45 : 1,
              borderRight: idx < techs.length - 1 ? "1px solid var(--color-border)" : "none",
              borderTop: idx >= 3 ? "1px solid var(--color-border)" : "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface-3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            {/* Tech header */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0"
                style={{ background: tech.color }}
              >
                {tech.initials}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                  {tech.name}
                </div>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-md inline-flex items-center gap-1"
                  style={{ background: tech.statusBg, color: tech.statusColor }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${tech.status === "in_progress" || tech.status === "en_route" ? "pulse-dot" : ""}`}
                    style={{ background: tech.statusColor }}
                  ></span>
                  {tech.statusLabel}
                </span>
              </div>
            </div>

            {/* Current job */}
            {tech.currentJob ? (
              <div
                className="rounded-lg p-2.5 mb-3"
                style={{
                  background: "rgba(96,165,250,0.08)",
                  border: "1px solid rgba(96,165,250,0.15)",
                }}
              >
                <div className="text-[9px] font-bold mb-0.5 tracking-wider" style={{ color: "#60a5fa" }}>
                  CURRENT JOB
                </div>
                <div className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {tech.currentCustomer}
                </div>
                <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                  {tech.currentType}
                </div>
                <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  {tech.location}
                </div>
              </div>
            ) : tech.status !== "off" ? (
              <div
                className="rounded-lg p-2.5 mb-3 text-center"
                style={{ background: "var(--color-surface-3)" }}
              >
                <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  No active job
                </div>
              </div>
            ) : (
              <div className="mb-3"></div>
            )}

            {/* Stats */}
            <div
              className="grid grid-cols-3 gap-1 mb-3 rounded-lg p-2"
              style={{ background: "var(--color-surface-1)" }}
            >
              <div className="text-center">
                <div className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {tech.jobsDone}
                </div>
                <div className="text-[9px]" style={{ color: "var(--color-text-muted)" }}>Done</div>
              </div>
              <div className="text-center" style={{ borderLeft: "1px solid var(--color-border)", borderRight: "1px solid var(--color-border)" }}>
                <div className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {tech.jobsToday}
                </div>
                <div className="text-[9px]" style={{ color: "var(--color-text-muted)" }}>Today</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {tech.hoursWorked}
                </div>
                <div className="text-[9px]" style={{ color: "var(--color-text-muted)" }}>Hours</div>
              </div>
            </div>

            {/* Next job */}
            {tech.status !== "off" && (
              <div className="text-[10px] truncate mb-3" style={{ color: "var(--color-text-muted)" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Next: </span>
                <span style={{ color: "var(--color-text-secondary)" }}>{tech.nextJob}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-1">
              <button
                className="flex-1 text-[10px] py-1.5 rounded-lg transition-all flex items-center justify-center gap-1"
                style={{
                  background: "var(--color-surface-3)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--color-text-primary)";
                  e.currentTarget.style.borderColor = "var(--color-border-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--color-text-secondary)";
                  e.currentTarget.style.borderColor = "var(--color-border)";
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                Call
              </button>
              <button
                className="flex-1 text-[10px] py-1.5 rounded-lg transition-all flex items-center justify-center gap-1"
                style={{
                  background: "var(--color-surface-3)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--color-text-primary)";
                  e.currentTarget.style.borderColor = "var(--color-border-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--color-text-secondary)";
                  e.currentTarget.style.borderColor = "var(--color-border)";
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
                Text
              </button>
              {tech.status !== "off" && (
                <button
                  className="flex-1 text-[10px] py-1.5 rounded-lg transition-all font-semibold"
                  style={{
                    background: "rgba(249,115,22,0.12)",
                    color: "#f97316",
                    border: "1px solid rgba(249,115,22,0.2)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(249,115,22,0.22)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(249,115,22,0.12)";
                  }}
                >
                  + Job
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
