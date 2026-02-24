const activities = [
  {
    id: 1,
    icon: "✅",
    iconBg: "bg-green-100",
    title: "Job completed",
    desc: "JOB-2026-00142 · Mike Johnson",
    sub: "Dave Torres · 3 min ago",
    type: "success",
  },
  {
    id: 2,
    icon: "💳",
    iconBg: "bg-blue-100",
    title: "Payment received",
    desc: "$1,840 · Invoice #INV-00891",
    sub: "Linda Martinez · 18 min ago",
    type: "payment",
  },
  {
    id: 3,
    icon: "📷",
    iconBg: "bg-purple-100",
    title: "12 photos uploaded",
    desc: "JOB-2026-00142 · Install complete",
    sub: "Dave Torres · 22 min ago",
    type: "media",
  },
  {
    id: 4,
    icon: "🚗",
    iconBg: "bg-amber-100",
    title: "Tech en route",
    desc: "Amy Walsh → Robert Chen",
    sub: "ETA 11 min · 11:00 AM job",
    type: "dispatch",
  },
  {
    id: 5,
    icon: "📋",
    iconBg: "bg-orange-100",
    title: "Estimate approved",
    desc: "$3,200 · Patricia Williams",
    sub: "Customer signed · 45 min ago",
    type: "estimate",
  },
  {
    id: 6,
    icon: "⚠️",
    iconBg: "bg-red-100",
    title: "Checklist flagged",
    desc: "JOB-2026-00143 · Missing gas photo",
    sub: "Needs review · 1h ago",
    type: "alert",
  },
  {
    id: 7,
    icon: "🔁",
    iconBg: "bg-red-100",
    title: "Callback scheduled",
    desc: "Tom Bradley · Igniter issue",
    sub: "JOB-2026-00146 · 2:30 PM today",
    type: "callback",
  },
  {
    id: 8,
    icon: "📄",
    iconBg: "bg-gray-100",
    title: "Invoice sent",
    desc: "$920 · Robert Chen",
    sub: "INV-00892 · 2h ago",
    type: "invoice",
  },
  {
    id: 9,
    icon: "👤",
    iconBg: "bg-teal-100",
    title: "New customer added",
    desc: "Susan Park · Westfield",
    sub: "Office · 2h ago",
    type: "customer",
  },
  {
    id: 10,
    icon: "🤖",
    iconBg: "bg-indigo-100",
    title: "AI summary generated",
    desc: "JOB-2026-00142 · Install notes",
    sub: "Auto-generated · 3h ago",
    type: "ai",
  },
];

export default function RecentActivity() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="font-semibold text-[#1a1a2e]">Activity Feed</h2>
          <p className="text-xs text-gray-500 mt-0.5">Live updates</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          Live
        </span>
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div
              className={`w-8 h-8 rounded-lg ${activity.iconBg} flex items-center justify-center text-sm flex-shrink-0 mt-0.5`}
            >
              {activity.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#1a1a2e] leading-tight">
                {activity.title}
              </div>
              <div className="text-xs text-gray-600 mt-0.5 truncate">
                {activity.desc}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {activity.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
        <button className="text-xs text-[#e85d04] font-medium hover:text-[#c44d03] w-full text-center">
          View all activity →
        </button>
      </div>
    </div>
  );
}
