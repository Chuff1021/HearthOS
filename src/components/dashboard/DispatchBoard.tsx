const techs = [
  {
    id: 1,
    name: "Dave Torres",
    initials: "DT",
    color: "bg-orange-500",
    status: "in_progress",
    statusLabel: "In Progress",
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
    color: "bg-pink-500",
    status: "en_route",
    statusLabel: "En Route",
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
    color: "bg-teal-500",
    status: "scheduled",
    statusLabel: "Next at 1:00 PM",
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
    color: "bg-indigo-500",
    status: "scheduled",
    statusLabel: "Next at 4:30 PM",
    currentJob: null,
    currentCustomer: null,
    currentType: null,
    location: "At shop",
    jobsToday: 2,
    jobsDone: 0,
    hoursWorked: "0h",
    nextJob: "4:30 PM — James O'Brien 🚨",
    phone: "(555) 678-1122",
  },
  {
    id: 5,
    name: "Maria Santos",
    initials: "MS",
    color: "bg-violet-500",
    status: "off",
    statusLabel: "Day Off",
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
    color: "bg-cyan-500",
    status: "off",
    statusLabel: "Vacation",
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

const statusStyles: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-700",
  en_route: "bg-amber-100 text-amber-700",
  scheduled: "bg-gray-100 text-gray-600",
  off: "bg-gray-100 text-gray-400",
};

const statusDots: Record<string, string> = {
  in_progress: "bg-blue-500 animate-pulse",
  en_route: "bg-amber-500 animate-pulse",
  scheduled: "bg-gray-400",
  off: "bg-gray-300",
};

export default function DispatchBoard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[#1a1a2e]">Dispatch Board</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tech status · Live tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
            🗺️ Map View
          </button>
          <button className="text-xs px-3 py-1.5 bg-[#e85d04] text-white rounded-lg hover:bg-[#c44d03] transition-colors font-medium">
            + Assign Job
          </button>
        </div>
      </div>

      {/* Tech grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-0 divide-x divide-y divide-gray-100">
        {techs.map((tech) => (
          <div
            key={tech.id}
            className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
              tech.status === "off" ? "opacity-50" : ""
            }`}
          >
            {/* Tech header */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className={`w-9 h-9 rounded-full ${tech.color} text-white text-sm font-bold flex items-center justify-center flex-shrink-0`}
              >
                {tech.initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#1a1a2e] truncate">
                  {tech.name}
                </div>
                <div
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${statusStyles[tech.status]}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${statusDots[tech.status]}`}
                  ></span>
                  {tech.statusLabel}
                </div>
              </div>
            </div>

            {/* Current job */}
            {tech.currentJob ? (
              <div className="bg-blue-50 rounded-lg p-2 mb-3">
                <div className="text-[10px] font-semibold text-blue-700 mb-0.5">
                  CURRENT JOB
                </div>
                <div className="text-xs font-medium text-[#1a1a2e]">
                  {tech.currentCustomer}
                </div>
                <div className="text-[10px] text-gray-500">
                  {tech.currentType}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  📍 {tech.location}
                </div>
              </div>
            ) : tech.status !== "off" ? (
              <div className="bg-gray-50 rounded-lg p-2 mb-3 text-center">
                <div className="text-[10px] text-gray-400">No active job</div>
              </div>
            ) : (
              <div className="mb-3"></div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-1 mb-3">
              <div className="text-center">
                <div className="text-sm font-bold text-[#1a1a2e]">
                  {tech.jobsDone}
                </div>
                <div className="text-[9px] text-gray-400">Done</div>
              </div>
              <div className="text-center border-x border-gray-100">
                <div className="text-sm font-bold text-[#1a1a2e]">
                  {tech.jobsToday}
                </div>
                <div className="text-[9px] text-gray-400">Today</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-bold text-[#1a1a2e]">
                  {tech.hoursWorked}
                </div>
                <div className="text-[9px] text-gray-400">Hours</div>
              </div>
            </div>

            {/* Next job */}
            {tech.status !== "off" && (
              <div className="text-[10px] text-gray-500 truncate">
                <span className="text-gray-400">Next: </span>
                {tech.nextJob}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-1 mt-3">
              <button className="flex-1 text-[10px] py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors">
                📞 Call
              </button>
              <button className="flex-1 text-[10px] py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors">
                💬 Text
              </button>
              {tech.status !== "off" && (
                <button className="flex-1 text-[10px] py-1 bg-[#e85d04]/10 text-[#e85d04] rounded hover:bg-[#e85d04]/20 transition-colors">
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
