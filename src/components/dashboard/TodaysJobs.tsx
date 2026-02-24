"use client";

import { useState } from "react";

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

const jobs: Job[] = [
  {
    id: "1",
    jobNumber: "JOB-2026-00142",
    time: "8:00 AM",
    duration: "3h",
    type: "Install",
    typeColor: "bg-blue-100 text-blue-700",
    status: "completed",
    customer: "Mike Johnson",
    address: "142 Oak St",
    city: "Springfield",
    unit: "Napoleon GX70 Gas Insert",
    tech: "Dave Torres",
    techInitials: "DT",
    techColor: "bg-orange-500",
    checklistPct: 100,
    photosCount: 12,
  },
  {
    id: "2",
    jobNumber: "JOB-2026-00143",
    time: "9:30 AM",
    duration: "2h",
    type: "Service",
    typeColor: "bg-purple-100 text-purple-700",
    status: "in_progress",
    customer: "Linda Martinez",
    address: "88 Pine Ave",
    city: "Riverside",
    unit: "Regency P36 Gas Fireplace",
    tech: "Dave Torres",
    techInitials: "DT",
    techColor: "bg-orange-500",
    checklistPct: 65,
    photosCount: 4,
    notes: "Customer mentioned pilot keeps going out",
  },
  {
    id: "3",
    jobNumber: "JOB-2026-00144",
    time: "11:00 AM",
    duration: "1.5h",
    type: "Clean & Burn",
    typeColor: "bg-amber-100 text-amber-700",
    status: "en_route",
    customer: "Robert Chen",
    address: "55 Elm Rd",
    city: "Lakewood",
    unit: "Heatilator CNXT36 Wood",
    tech: "Amy Walsh",
    techInitials: "AW",
    techColor: "bg-pink-500",
    checklistPct: 0,
    photosCount: 0,
  },
  {
    id: "4",
    jobNumber: "JOB-2026-00145",
    time: "1:00 PM",
    duration: "4h",
    type: "Install",
    typeColor: "bg-blue-100 text-blue-700",
    status: "scheduled",
    customer: "Patricia Williams",
    address: "301 Maple Dr",
    city: "Greenfield",
    unit: "Valor H4 Gas Insert (new)",
    tech: "Jake Rivera",
    techInitials: "JR",
    techColor: "bg-teal-500",
    checklistPct: 0,
    photosCount: 0,
    priority: "high",
  },
  {
    id: "5",
    jobNumber: "JOB-2026-00146",
    time: "2:30 PM",
    duration: "1h",
    type: "Warranty",
    typeColor: "bg-red-100 text-red-700",
    status: "scheduled",
    customer: "Tom Bradley",
    address: "19 Cedar Ln",
    city: "Millbrook",
    unit: "Fireplace Xtrordinair 564 SS",
    tech: "Amy Walsh",
    techInitials: "AW",
    techColor: "bg-pink-500",
    checklistPct: 0,
    photosCount: 0,
    notes: "Callback from last week — igniter issue",
  },
  {
    id: "6",
    jobNumber: "JOB-2026-00147",
    time: "3:30 PM",
    duration: "45m",
    type: "Estimate",
    typeColor: "bg-gray-100 text-gray-700",
    status: "scheduled",
    customer: "Susan Park",
    address: "77 Birch Blvd",
    city: "Westfield",
    unit: "TBD — outdoor fireplace",
    tech: "Jake Rivera",
    techInitials: "JR",
    techColor: "bg-teal-500",
    checklistPct: 0,
    photosCount: 0,
  },
  {
    id: "7",
    jobNumber: "JOB-2026-00148",
    time: "4:30 PM",
    duration: "2h",
    type: "Service",
    typeColor: "bg-purple-100 text-purple-700",
    status: "scheduled",
    customer: "James O'Brien",
    address: "200 Willow Way",
    city: "Fairview",
    unit: "SL-550 Slim Line Gas",
    tech: "Carlos Mendez",
    techInitials: "CM",
    techColor: "bg-indigo-500",
    checklistPct: 0,
    photosCount: 0,
    priority: "emergency",
  },
  {
    id: "8",
    jobNumber: "JOB-2026-00149",
    time: "5:00 PM",
    duration: "1h",
    type: "Inspect",
    typeColor: "bg-cyan-100 text-cyan-700",
    status: "scheduled",
    customer: "Nancy Foster",
    address: "14 Spruce Ct",
    city: "Hillside",
    unit: "Majestic Quartz 36 Gas",
    tech: "Carlos Mendez",
    techInitials: "CM",
    techColor: "bg-indigo-500",
    checklistPct: 0,
    photosCount: 0,
  },
];

const statusConfig: Record<
  JobStatus,
  { label: string; color: string; dot: string }
> = {
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500 animate-pulse",
  },
  en_route: {
    label: "En Route",
    color: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500 animate-pulse",
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
  },
  callback: {
    label: "Callback",
    color: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
};

export default function TodaysJobs() {
  const [filter, setFilter] = useState<"all" | JobStatus>("all");

  const filtered =
    filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  const counts = {
    all: jobs.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    in_progress: jobs.filter((j) => j.status === "in_progress").length,
    en_route: jobs.filter((j) => j.status === "en_route").length,
    scheduled: jobs.filter((j) => j.status === "scheduled").length,
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[#1a1a2e]">Today&#39;s Jobs</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Monday, February 24, 2026
          </p>
        </div>
        <button className="text-xs font-medium text-[#e85d04] hover:text-[#c44d03] transition-colors">
          + New Job
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-5 py-3 border-b border-gray-100 overflow-x-auto scrollbar-hide">
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
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === f
                ? "bg-[#1a1a2e] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
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
      <div className="divide-y divide-gray-50">
        {filtered.map((job) => {
          const sc = statusConfig[job.status];
          return (
            <div
              key={job.id}
              className={`px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                job.priority === "emergency"
                  ? "border-l-4 border-l-red-500"
                  : job.priority === "high"
                    ? "border-l-4 border-l-amber-500"
                    : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Time column */}
                <div className="w-16 flex-shrink-0 text-center">
                  <div className="text-xs font-semibold text-[#1a1a2e]">
                    {job.time}
                  </div>
                  <div className="text-[10px] text-gray-400">{job.duration}</div>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${job.typeColor}`}
                    >
                      {job.type}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${sc.color}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></span>
                      {sc.label}
                    </span>
                    {job.priority === "emergency" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">
                        🚨 EMERGENCY
                      </span>
                    )}
                    {job.priority === "high" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                        ⚡ HIGH
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {job.jobNumber}
                    </span>
                  </div>

                  <div className="font-medium text-sm text-[#1a1a2e]">
                    {job.customer}
                  </div>
                  <div className="text-xs text-gray-500">
                    {job.address}, {job.city}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    🔥 {job.unit}
                  </div>

                  {job.notes && (
                    <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                      📝 {job.notes}
                    </div>
                  )}

                  {/* Progress indicators */}
                  {job.status !== "scheduled" && (
                    <div className="flex items-center gap-4 mt-2">
                      {job.checklistPct !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                job.checklistPct === 100
                                  ? "bg-green-500"
                                  : "bg-[#e85d04]"
                              }`}
                              style={{ width: `${job.checklistPct}%` }}
                            ></div>
                          </div>
                          <span className="text-[10px] text-gray-500">
                            {job.checklistPct}% checklist
                          </span>
                        </div>
                      )}
                      {job.photosCount !== undefined && job.photosCount > 0 && (
                        <span className="text-[10px] text-gray-500">
                          📷 {job.photosCount} photos
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Tech avatar */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full ${job.techColor} text-white text-xs font-bold flex items-center justify-center`}
                  >
                    {job.techInitials}
                  </div>
                  <span className="text-[9px] text-gray-400 text-center leading-tight max-w-[40px]">
                    {job.tech.split(" ")[0]}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Showing {filtered.length} of {jobs.length} jobs
        </span>
        <button className="text-xs text-[#e85d04] font-medium hover:text-[#c44d03]">
          View full schedule →
        </button>
      </div>
    </div>
  );
}
