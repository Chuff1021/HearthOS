const stats = [
  {
    label: "Jobs Today",
    value: "8",
    sub: "3 completed · 5 remaining",
    icon: "🔧",
    color: "bg-blue-50 text-blue-600",
    trend: "+2 vs yesterday",
    trendUp: true,
  },
  {
    label: "Revenue This Week",
    value: "$14,820",
    sub: "12 invoices paid",
    icon: "💰",
    color: "bg-green-50 text-green-600",
    trend: "+18% vs last week",
    trendUp: true,
  },
  {
    label: "Pending Invoices",
    value: "$8,340",
    sub: "5 invoices outstanding",
    icon: "📄",
    color: "bg-amber-50 text-amber-600",
    trend: "2 overdue",
    trendUp: false,
  },
  {
    label: "Active Techs",
    value: "4 / 6",
    sub: "2 on jobs · 2 en route",
    icon: "👷",
    color: "bg-purple-50 text-purple-600",
    trend: "All on schedule",
    trendUp: true,
  },
  {
    label: "Checklist Rate",
    value: "97%",
    sub: "This month",
    icon: "✅",
    color: "bg-emerald-50 text-emerald-600",
    trend: "+2% vs last month",
    trendUp: true,
  },
  {
    label: "Callbacks",
    value: "2",
    sub: "Open this week",
    icon: "🔁",
    color: "bg-red-50 text-red-600",
    trend: "Needs attention",
    trendUp: false,
  },
];

export default function DashboardStats() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-3">
            <div
              className={`w-9 h-9 rounded-lg ${stat.color} flex items-center justify-center text-lg`}
            >
              {stat.icon}
            </div>
          </div>
          <div className="text-2xl font-bold text-[#1a1a2e] leading-none mb-1">
            {stat.value}
          </div>
          <div className="text-xs text-gray-500 mb-2">{stat.label}</div>
          <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
            {stat.sub}
          </div>
          <div
            className={`text-[10px] font-medium mt-1 ${
              stat.trendUp ? "text-green-600" : "text-red-500"
            }`}
          >
            {stat.trendUp ? "↑" : "↓"} {stat.trend}
          </div>
        </div>
      ))}
    </div>
  );
}
