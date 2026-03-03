"use client";

const activities = [
  {
    id: 1,
    iconBg: "rgba(21,128,61,0.12)",
    iconColor: "#15803d",
    title: "Job completed",
    desc: "JOB-2026-00142 · Mike Johnson",
    sub: "Dave Torres · 3 min ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 2,
    iconBg: "rgba(29,78,216,0.12)",
    iconColor: "#1e40af",
    title: "Payment received",
    desc: "$1,840 · Invoice #INV-00891",
    sub: "Linda Martinez · 18 min ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 3,
    iconBg: "rgba(192,132,252,0.12)",
    iconColor: "#3b82f6",
    title: "12 photos uploaded",
    desc: "JOB-2026-00142 · Install complete",
    sub: "Dave Torres · 22 min ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 4,
    iconBg: "rgba(251,191,36,0.12)",
    iconColor: "#fbbf24",
    title: "Tech en route",
    desc: "Amy Walsh → Robert Chen",
    sub: "ETA 11 min · 11:00 AM job",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
      </svg>
    ),
  },
  {
    id: 5,
    iconBg: "rgba(29,78,216,0.12)",
    iconColor: "#1e40af",
    title: "Estimate approved",
    desc: "$3,200 · Patricia Williams",
    sub: "Customer signed · 45 min ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 6,
    iconBg: "rgba(185,28,28,0.12)",
    iconColor: "#b91c1c",
    title: "Checklist flagged",
    desc: "JOB-2026-00143 · Missing gas photo",
    sub: "Needs review · 1h ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 7,
    iconBg: "rgba(185,28,28,0.12)",
    iconColor: "#b91c1c",
    title: "Callback scheduled",
    desc: "Tom Bradley · Igniter issue",
    sub: "JOB-2026-00146 · 2:30 PM today",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 8,
    iconBg: "rgba(148,163,184,0.1)",
    iconColor: "#94a3b8",
    title: "Invoice sent",
    desc: "$920 · Robert Chen",
    sub: "INV-00892 · 2h ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 9,
    iconBg: "rgba(45,212,191,0.12)",
    iconColor: "#2dd4bf",
    title: "New customer added",
    desc: "Susan Park · Westfield",
    sub: "Office · 2h ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
      </svg>
    ),
  },
  {
    id: 10,
    iconBg: "rgba(129,140,248,0.12)",
    iconColor: "#818cf8",
    title: "QB Invoice synced",
    desc: "INV-00891 → QuickBooks",
    sub: "Auto-synced · 3h ago",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function RecentActivity() {
  return (
    <div
      className="rounded-xl overflow-hidden h-full flex flex-col"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div>
          <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
            Activity Feed
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Live updates
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
          style={{
            background: "rgba(21,128,61,0.1)",
            color: "#15803d",
            border: "1px solid rgba(21,128,61,0.2)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot"></span>
          Live
        </span>
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {activities.map((activity, idx) => (
          <div
            key={activity.id}
            className="flex items-start gap-3 px-5 py-3 cursor-pointer transition-all"
            style={{
              borderBottom: idx < activities.length - 1 ? "1px solid var(--color-border)" : "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface-3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: activity.iconBg, color: activity.iconColor }}
            >
              {activity.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium leading-tight" style={{ color: "var(--color-text-primary)" }}>
                {activity.title}
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                {activity.desc}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                {activity.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 flex-shrink-0"
        style={{
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface-1)",
        }}
      >
        <button
          className="text-xs font-medium w-full text-center transition-colors"
          style={{ color: "#1e40af" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#67e8f9")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#1e40af")}
        >
          View all activity →
        </button>
      </div>
    </div>
  );
}
