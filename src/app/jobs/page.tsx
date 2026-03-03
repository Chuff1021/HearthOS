"use client";

import { useEffect, useState } from "react";
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
    assignedTechs: [{ id: "tech-001", name: "Mike Johnson", color: "#2563EB" }],
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
      { id: "tech-002", name: "Sarah Williams", color: "#B6F500" },
      { id: "tech-003", name: "Tom Davis", color: "#FF4400" },
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
    assignedTechs: [{ id: "tech-001", name: "Mike Johnson", color: "#2563EB" }],
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
    assignedTechs: [{ id: "tech-004", name: "Chris Lee", color: "#2563EB" }],
    totalAmount: "0.00",
  },
];

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "rgba(29,78,216,0.12)", text: "#2563EB", border: "rgba(29,78,216,0.25)" },
  in_progress: { bg: "rgba(255,68,0,0.12)", text: "#FF4400", border: "rgba(255,68,0,0.25)" },
  completed: { bg: "rgba(182,245,0,0.12)", text: "#B6F500", border: "rgba(182,245,0,0.25)" },
  cancelled: { bg: "rgba(255,32,78,0.12)", text: "#FF204E", border: "rgba(255,32,78,0.25)" },
  on_hold: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af" },
  normal: { bg: "rgba(29,78,216,0.12)", text: "#2563EB" },
  high: { bg: "rgba(255,68,0,0.12)", text: "#FF4400" },
  urgent: { bg: "rgba(255,32,78,0.12)", text: "#FF204E" },
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
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string }[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state for creating new job
  const [formData, setFormData] = useState({
    title: "",
    jobType: "service",
    priority: "normal",
    scheduledDate: new Date().toISOString().split("T")[0],
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "10:00",
    notes: "",
    assignedTechs: [] as string[],
  });

  const handleCreateJob = async () => {
    if (!selectedCustomer || !formData.title) return;
    
    setCreating(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          propertyAddress: "", // Would need to fetch from customer
          jobType: formData.jobType,
          priority: formData.priority,
          scheduledDate: formData.scheduledDate,
          scheduledTimeStart: formData.scheduledTimeStart,
          scheduledTimeEnd: formData.scheduledTimeEnd,
          notes: formData.notes,
          assignedTechs: formData.assignedTechs.map((id, idx) => ({
            id,
            name: ["Mike Johnson", "Sarah Williams", "Tom Davis", "Chris Lee"][idx] || id,
            color: ["#2563EB", "#B6F500", "#FF4400", "#2563EB"][idx] || "#6b7280",
          })),
          totalAmount: 0,
        }),
      });
      
      if (response.ok) {
        setShowCreateModal(false);
        // Reset form
        setFormData({
          title: "",
          jobType: "service",
          priority: "normal",
          scheduledDate: new Date().toISOString().split("T")[0],
          scheduledTimeStart: "09:00",
          scheduledTimeEnd: "10:00",
          notes: "",
          assignedTechs: [],
        });
        setSelectedCustomer(null);
        // Refresh jobs list - would need to reload
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to create job:", error);
    } finally {
      setCreating(false);
    }
  };

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

  useEffect(() => {
    if (!showCreateModal) {
      setCustomerQuery("");
      setCustomerResults([]);
      setSelectedCustomer(null);
      return;
    }

    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }

    let cancelled = false;
    setCustomerLoading(true);

    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quickbooks/customers?q=${encodeURIComponent(q)}&live=true`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setCustomerResults([]);
          return;
        }
        const items = (data.customers || []).map((c: any) => ({
          id: c.Id || c.id || "",
          name: c.DisplayName || c.FullyQualifiedName || c.CompanyName || c.GivenName || "Customer",
        }));
        setCustomerResults(items);
      } catch {
        if (!cancelled) setCustomerResults([]);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [customerQuery, showCreateModal]);

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
              background: "linear-gradient(135deg, #2563EB, #2563EB)",
              color: "white",
              boxShadow: "0 0 16px rgba(29,78,216,0.25)",
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
                  value={selectedCustomer?.name || customerQuery}
                  onChange={(e) => {
                    setSelectedCustomer(null);
                    setCustomerQuery(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {customerLoading && (
                  <div className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    Searching QuickBooks...
                  </div>
                )}
                {customerResults.length > 0 && !selectedCustomer && (
                  <div
                    className="mt-2 rounded-lg overflow-hidden"
                    style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}
                  >
                    {customerResults.slice(0, 8).map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setCustomerResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {cust.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Job Title */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
                  Job Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Annual Cleaning & Inspection"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                onClick={handleCreateJob}
                disabled={creating || !selectedCustomer || !formData.title}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #2563EB)",
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
