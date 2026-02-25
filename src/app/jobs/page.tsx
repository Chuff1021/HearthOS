"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// Mock data for jobs (will be replaced with real data from database)
const mockJobs = [
  {
    id: "job-001",
    jobNumber: "JOB-2024-0089",
    title: "Annual Cleaning & Inspection",
    customer: { id: "cust-001", name: "Linda Martinez" },
    property: { address: "123 Oak Street, Springfield, IL" },
    fireplaceUnit: { brand: "Regency", model: "HZ40E", nickname: "Living Room" },
    jobType: "cleaning",
    status: "scheduled",
    priority: "normal",
    scheduledDate: "2024-02-25",
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "11:00",
    assignedTechs: [{ id: "tech-001", name: "Mike Johnson", color: "#3b82f6" }],
    totalAmount: "285.00",
  },
  {
    id: "job-002",
    jobNumber: "JOB-2024-0090",
    title: "Gas Fireplace Installation",
    customer: { id: "cust-002", name: "Robert Chen" },
    property: { address: "456 Maple Ave, Springfield, IL" },
    fireplaceUnit: { brand: "Napoleon", model: "GVFL60", nickname: "Basement" },
    jobType: "installation",
    status: "in_progress",
    priority: "high",
    scheduledDate: "2024-02-25",
    scheduledTimeStart: "10:00",
    scheduledTimeEnd: "16:00",
    assignedTechs: [
      { id: "tech-002", name: "Sarah Williams", color: "#10b981" },
      { id: "tech-003", name: "Tom Davis", color: "#f59e0b" },
    ],
    totalAmount: "4200.00",
  },
  {
    id: "job-003",
    jobNumber: "JOB-2024-0091",
    title: "Pilot Light Repair",
    customer: { id: "cust-003", name: "Patricia Williams" },
    property: { address: "789 Pine Road, Springfield, IL" },
    fireplaceUnit: { brand: "Heat & Glo", model: "SLR-FT", nickname: "Master Bedroom" },
    jobType: "repair",
    status: "completed",
    priority: "urgent",
    scheduledDate: "2024-02-24",
    scheduledTimeStart: "14:00",
    scheduledTimeEnd: "15:30",
    assignedTechs: [{ id: "tech-001", name: "Mike Johnson", color: "#3b82f6" }],
    totalAmount: "185.00",
    completedAt: "2024-02-24T15:15:00Z",
  },
  {
    id: "job-004",
    jobNumber: "JOB-2024-0092",
    title: "Wood Stove Inspection",
    customer: { id: "cust-004", name: "Tom Bradley" },
    property: { address: "321 Elm Court, Springfield, IL" },
    fireplaceUnit: { brand: "Vermont Castings", model: "Defiant", nickname: "Den" },
    jobType: "inspection",
    status: "on_hold",
    priority: "low",
    scheduledDate: "2024-02-26",
    scheduledTimeStart: "11:00",
    scheduledTimeEnd: "12:00",
    assignedTechs: [],
    totalAmount: "150.00",
  },
  {
    id: "job-005",
    jobNumber: "JOB-2024-0093",
    title: "Pellet Stove Service",
    customer: { id: "cust-005", name: "Susan Park" },
    property: { address: "555 Cedar Lane, Springfield, IL" },
    fireplaceUnit: { brand: "Harman", model: "P68", nickname: "Family Room" },
    jobType: "service",
    status: "cancelled",
    priority: "normal",
    scheduledDate: "2024-02-25",
    scheduledTimeStart: "13:00",
    scheduledTimeEnd: "15:00",
    assignedTechs: [{ id: "tech-004", name: "Chris Lee", color: "#8b5cf6" }],
    totalAmount: "0.00",
  },
];

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa", border: "rgba(96,165,250,0.25)" },
  in_progress: { bg: "rgba(251,191,36,0.12)", text: "#fbbf24", border: "rgba(251,191,36,0.25)" },
  completed: { bg: "rgba(74,222,128,0.12)", text: "#4ade80", border: "rgba(74,222,128,0.25)" },
  cancelled: { bg: "rgba(248,113,113,0.12)", text: "#f87171", border: "rgba(248,113,113,0.25)" },
  on_hold: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af" },
  normal: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa" },
  high: { bg: "rgba(251,191,36,0.12)", text: "#fbbf24" },
  urgent: { bg: "rgba(248,113,113,0.12)", text: "#f87171" },
};

const jobTypeIcons: Record<string, string> = {
  installation: "🔧",
  service: "🛠️",
  inspection: "🔍",
  cleaning: "🧹",
  repair: "⚡",
  estimate: "📋",
};

export default function JobsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filter jobs
  const filteredJobs = mockJobs.filter((job) => {
    const matchesSearch =
      job.jobNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.property.address.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesJobType = jobTypeFilter === "all" || job.jobType === jobTypeFilter;

    let matchesDate = true;
    if (dateFilter === "today") {
      matchesDate = job.scheduledDate === "2024-02-25";
    } else if (dateFilter === "week") {
      // Simplified - would use date-fns in production
      matchesDate = true;
    }

    return matchesSearch && matchesStatus && matchesJobType && matchesDate;
  });

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
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>
              Jobs
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {filteredJobs.length} jobs found
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #f97316, #ea6c0a)",
              color: "white",
              boxShadow: "0 0 16px rgba(249,115,22,0.25)",
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            New Job
          </button>
        </div>

        {/* Filters */}
        <div
          className="px-6 py-4 flex items-center gap-4 flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          {/* Search */}
          <div className="flex-1 relative">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--color-text-muted)" }}
            >
              <path
                fillRule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              placeholder="Search jobs, customers, addresses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Job Type Filter */}
          <select
            value={jobTypeFilter}
            onChange={(e) => setJobTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="all">All Types</option>
            <option value="installation">Installation</option>
            <option value="service">Service</option>
            <option value="inspection">Inspection</option>
            <option value="cleaning">Cleaning</option>
            <option value="repair">Repair</option>
            <option value="estimate">Estimate</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        {/* Jobs List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl p-4 transition-all hover:scale-[1.01] cursor-pointer"
                style={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Job Type Icon */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: "var(--color-surface-3)" }}
                    >
                      {jobTypeIcons[job.jobType]}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-mono px-2 py-0.5 rounded"
                          style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}
                        >
                          {job.jobNumber}
                        </span>
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                          style={{
                            background: statusColors[job.status].bg,
                            color: statusColors[job.status].text,
                            border: `1px solid ${statusColors[job.status].border}`,
                          }}
                        >
                          {job.status.replace("_", " ").toUpperCase()}
                        </span>
                        {job.priority !== "normal" && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                            style={{
                              background: priorityColors[job.priority].bg,
                              color: priorityColors[job.priority].text,
                            }}
                          >
                            {job.priority.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>
                        {job.title}
                      </h3>
                      <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                        {job.customer.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {job.property.address}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path
                              fillRule="evenodd"
                              d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {job.scheduledDate}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {job.scheduledTimeStart} - {job.scheduledTimeEnd}
                        </div>
                        {job.assignedTechs.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            {job.assignedTechs.map((tech) => (
                              <div
                                key={tech.id}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                                style={{ background: tech.color }}
                                title={tech.name}
                              >
                                {tech.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>
                      ${job.totalAmount}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                      {job.fireplaceUnit.brand} {job.fireplaceUnit.model}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filteredJobs.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📋</div>
                <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                  No jobs found
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Try adjusting your filters or create a new job
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Job Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div
            className="relative w-full max-w-2xl rounded-xl overflow-hidden"
            style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
          >
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <h2 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>
                Create New Job
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg transition-all"
                style={{ color: "var(--color-text-muted)" }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                  Customer *
                </label>
                <input
                  type="text"
                  placeholder="Search customers..."
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>

              {/* Job Title */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                  Job Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Annual Cleaning & Inspection"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>

              {/* Job Type & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                    Job Type *
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <option value="">Select type...</option>
                    <option value="installation">Installation</option>
                    <option value="service">Service</option>
                    <option value="inspection">Inspection</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="repair">Repair</option>
                    <option value="estimate">Estimate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                    Priority
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="normal" selected>
                      Normal
                    </option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                    Start Time
                  </label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                    End Time
                  </label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
              </div>

              {/* Assign Technicians */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                  Assign Technicians
                </label>
                <div className="flex flex-wrap gap-2">
                  {["Mike Johnson", "Sarah Williams", "Tom Davis", "Chris Lee"].map((tech) => (
                    <label
                      key={tech}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer"
                      style={{
                        background: "var(--color-surface-2)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <input type="checkbox" className="rounded" />
                      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                        {tech}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                  Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Add any notes about this job..."
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>
            </div>

            <div
              className="px-6 py-4 flex items-center justify-end gap-3"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: "linear-gradient(135deg, #f97316, #ea6c0a)",
                  color: "white",
                }}
              >
                Create Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
