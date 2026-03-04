"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Job = {
  id: string;
  jobNumber: string;
  title: string;
  customerId: string;
  customerName: string;
  propertyAddress: string;
  fireplaceUnit?: { brand: string; model: string; nickname?: string };
  jobType: string;
  status: string;
  priority: string;
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  assignedTechs: Array<{ id: string; name: string; color: string }>;
  totalAmount: number;
};

type Tech = { id: string; name: string; color: string };

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "rgba(29,78,216,0.12)", text: "#2563EB", border: "rgba(29,78,216,0.25)" },
  in_progress: { bg: "rgba(255,68,0,0.12)", text: "#FF4400", border: "rgba(255,68,0,0.25)" },
  completed: { bg: "rgba(152,205,0,0.12)", text: "#98CD00", border: "rgba(152,205,0,0.25)" },
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);

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

  async function loadJobs() {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(data.jobs || []);
  }

  async function loadTechs() {
    const res = await fetch("/api/techs?activeOnly=true");
    const data = await res.json();
    setTechs((data.techs || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color || "#2563EB" })));
  }

  useEffect(() => {
    loadJobs();
    loadTechs();
  }, []);

  useEffect(() => {
    if (!showCreateModal) return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setCustomerResults((data.customers || []).map((c: any) => ({ id: c.id, name: c.displayName })));
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery, showCreateModal]);

  const filteredJobs = jobs.filter((job) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      job.jobNumber.toLowerCase().includes(q) ||
      job.title.toLowerCase().includes(q) ||
      job.customerName.toLowerCase().includes(q) ||
      (job.propertyAddress || "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesJobType = jobTypeFilter === "all" || job.jobType === jobTypeFilter;
    return matchesSearch && matchesStatus && matchesJobType;
  });

  async function handleCreateJob() {
    if (!selectedCustomer || !formData.title) return;
    setCreating(true);
    try {
      const assignedTechs = techs
        .filter((t) => formData.assignedTechs.includes(t.id))
        .map((t) => ({ id: t.id, name: t.name, color: t.color }));

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          propertyAddress: "",
          jobType: formData.jobType,
          priority: formData.priority,
          scheduledDate: formData.scheduledDate,
          scheduledTimeStart: formData.scheduledTimeStart,
          scheduledTimeEnd: formData.scheduledTimeEnd,
          notes: formData.notes,
          assignedTechs,
          totalAmount: 0,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setFormData({ ...formData, title: "", notes: "", assignedTechs: [] });
        setSelectedCustomer(null);
        setCustomerQuery("");
        loadJobs();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Jobs</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>{filteredJobs.length} jobs found</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "#2563EB", color: "white" }}>New Job</button>
        </div>

        <div className="px-6 py-4 flex items-center gap-4 flex-shrink-0" style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search jobs..." className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
            <option value="all">All Status</option><option value="scheduled">Scheduled</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="on_hold">On Hold</option><option value="cancelled">Cancelled</option>
          </select>
          <select value={jobTypeFilter} onChange={(e) => setJobTypeFilter(e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
            <option value="all">All Types</option><option value="installation">Installation</option><option value="service">Service</option><option value="inspection">Inspection</option><option value="cleaning">Cleaning</option><option value="repair">Repair</option><option value="estimate">Estimate</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-6"><div className="space-y-3">
          {filteredJobs.map((job) => (
            <div key={job.id} className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg" style={{ background: "var(--color-surface-3)" }}>{jobTypeIcons[job.jobType] || "📋"}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>{job.jobNumber}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: statusColors[job.status]?.bg, color: statusColors[job.status]?.text, border: `1px solid ${statusColors[job.status]?.border}` }}>{job.status.replace("_", " ").toUpperCase()}</span>
                      {job.priority !== "normal" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: priorityColors[job.priority]?.bg, color: priorityColors[job.priority]?.text }}>{job.priority.toUpperCase()}</span>}
                    </div>
                    <h3 className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>{job.title}</h3>
                    <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{job.customerName}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{job.propertyAddress || "—"}</p>
                  </div>
                </div>
                <div className="text-right"><div className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>${Number(job.totalAmount || 0).toFixed(2)}</div></div>
              </div>
            </div>
          ))}
        </div></div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-2xl rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}><h2 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>Create New Job</h2></div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <input placeholder="Search customers..." value={selectedCustomer?.name || customerQuery} onChange={(e) => { setSelectedCustomer(null); setCustomerQuery(e.target.value); }} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
              {!!customerResults.length && !selectedCustomer && <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>{customerResults.map((c) => <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]); }} className="w-full text-left px-3 py-2 text-sm">{c.name}</button>)}</div>}
              <input placeholder="Job title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
              <div className="grid grid-cols-2 gap-4">
                <select value={formData.jobType} onChange={(e) => setFormData({ ...formData, jobType: e.target.value })} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}><option value="installation">Installation</option><option value="service">Service</option><option value="inspection">Inspection</option><option value="cleaning">Cleaning</option><option value="repair">Repair</option><option value="estimate">Estimate</option></select>
                <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <input type="date" value={formData.scheduledDate} onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                <input type="time" value={formData.scheduledTimeStart} onChange={(e) => setFormData({ ...formData, scheduledTimeStart: e.target.value })} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                <input type="time" value={formData.scheduledTimeEnd} onChange={(e) => setFormData({ ...formData, scheduledTimeEnd: e.target.value })} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
              </div>
              <div className="flex flex-wrap gap-2">{techs.map((t) => (
                <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <input type="checkbox" checked={formData.assignedTechs.includes(t.id)} onChange={(e) => setFormData({ ...formData, assignedTechs: e.target.checked ? [...formData.assignedTechs, t.id] : formData.assignedTechs.filter((id) => id !== t.id) })} />
                  <span className="text-sm">{t.name}</span>
                </label>
              ))}</div>
            </div>
            <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>Cancel</button>
              <button onClick={handleCreateJob} disabled={creating || !selectedCustomer || !formData.title} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "#2563EB", color: "white" }}>{creating ? "Creating..." : "Create Job"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
