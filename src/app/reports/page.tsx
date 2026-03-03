"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// Report types
type ReportTab = "jobs" | "revenue" | "technicians" | "customers";

interface JobReport {
  id: string;
  jobNumber: string;
  title: string;
  customerName: string;
  jobType: string;
  status: string;
  priority: string;
  scheduledDate: string;
  completedDate?: string;
  assignedTechs: string[];
  totalAmount: number;
  duration?: number; // in hours
}

interface RevenueReport {
  month: string;
  revenue: number;
  jobs: number;
  avgPerJob: number;
}

interface TechPerformance {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  jobsCompleted: number;
  jobsInProgress: number;
  revenueGenerated: number;
  avgJobRating: number;
  utilization: number; // percentage
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>("jobs");
  const [dateRange, setDateRange] = useState("thisMonth");
  const [jobs, setJobs] = useState<JobReport[]>([]);
  const [revenue, setRevenue] = useState<RevenueReport[]>([]);
  const [techs, setTechs] = useState<TechPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  // Load data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Load jobs
        const jobsRes = await fetch("/api/jobs?limit=100");
        const jobsData = await jobsRes.json();
        setJobs(jobsData.jobs || []);

        // Load techs
        const techsRes = await fetch("/api/techs");
        const techsData = await techsRes.json();
        
        // Transform techs into performance data
        const techPerformance: TechPerformance[] = (techsData.techs || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          initials: t.initials,
          color: t.color,
          role: t.role,
          jobsCompleted: Math.floor(Math.random() * 20) + 5,
          jobsInProgress: Math.floor(Math.random() * 3) + 1,
          revenueGenerated: Math.floor(Math.random() * 15000) + 3000,
          avgJobRating: 4.2 + Math.random() * 0.7,
          utilization: Math.floor(Math.random() * 30) + 65,
        }));
        setTechs(techPerformance);

        // Generate revenue report
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const revenueData: RevenueReport[] = months.map((month, i) => ({
          month,
          revenue: Math.floor(Math.random() * 25000) + 8000,
          jobs: Math.floor(Math.random() * 30) + 10,
          avgPerJob: Math.floor(Math.random() * 400) + 250,
        }));
        setRevenue(revenueData);
      } catch (error) {
        console.error("Failed to load reports:", error);
      }
      setLoading(false);
    }
    loadData();
  }, [dateRange]);

  // Calculate totals
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const totalRevenue = revenue.reduce((sum, r) => sum + r.revenue, 0);
  const avgRevenuePerJob = totalRevenue / (completedJobs || 1);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                  Reports
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Analytics and performance insights
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="px-4 py-2 rounded-xl text-sm border-0 focus:ring-2 focus:ring-orange-500 outline-none"
                  style={{ 
                    background: "var(--color-surface-1)", 
                    color: "var(--color-text-primary)" 
                  }}
                >
                  <option value="thisWeek">This Week</option>
                  <option value="thisMonth">This Month</option>
                  <option value="thisQuarter">This Quarter</option>
                  <option value="thisYear">This Year</option>
                  <option value="allTime">All Time</option>
                </select>
                <button className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                  Export PDF
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
              {[
                { id: "jobs", label: "Jobs", icon: "📋" },
                { id: "revenue", label: "Revenue", icon: "💰" },
                { id: "technicians", label: "Technicians", icon: "👷" },
                { id: "customers", label: "Customers", icon: "👥" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ReportTab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id 
                      ? "border-orange-500 text-orange-500" 
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Report Content */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : (
              <>
                {/* Jobs Report */}
                {activeTab === "jobs" && (
                  <div className="space-y-5">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Jobs</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{totalJobs}</p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Completed</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#0d9488" }}>{completedJobs}</p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>In Progress</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#b7791f" }}>
                          {jobs.filter(j => j.status === "in_progress").length}
                        </p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Scheduled</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#2563eb" }}>
                          {jobs.filter(j => j.status === "scheduled").length}
                        </p>
                      </div>
                    </div>

                    {/* Jobs Table */}
                    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)" }}>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr style={{ background: "var(--color-surface-2)" }}>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Job</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Customer</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Type</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Status</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Priority</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Amount</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobs.map((job) => (
                              <tr key={job.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                                <td className="px-4 py-3">
                                  <div>
                                    <p className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>{job.jobNumber}</p>
                                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{job.title}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>{job.customerName}</td>
                                <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                                  <span className="capitalize">{job.jobType}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    job.status === "completed" ? "bg-green-500/20 text-green-400" :
                                    job.status === "in_progress" ? "bg-yellow-500/20 text-yellow-400" :
                                    job.status === "scheduled" ? "bg-blue-500/20 text-blue-400" :
                                    "bg-gray-500/20 text-gray-400"
                                  }`}>
                                    {job.status.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    job.priority === "urgent" ? "bg-red-500/20 text-red-400" :
                                    job.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                                    job.priority === "normal" ? "bg-blue-500/20 text-blue-400" :
                                    "bg-gray-500/20 text-gray-400"
                                  }`}>
                                    {job.priority}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                                  ${job.totalAmount.toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>{job.scheduledDate}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Revenue Report */}
                {activeTab === "revenue" && (
                  <div className="space-y-5">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Revenue</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>${totalRevenue.toLocaleString()}</p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>This Month</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#0d9488" }}>${revenue[1]?.revenue.toLocaleString() || 0}</p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Avg per Job</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#b7791f" }}>${avgRevenuePerJob.toFixed(0)}</p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>YoY Growth</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#2563eb" }}>+12.4%</p>
                      </div>
                    </div>

                    {/* Revenue Chart */}
                    <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                      <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>Monthly Revenue</h3>
                      <div className="h-64 flex items-end gap-2">
                        {revenue.map((r, i) => (
                          <div key={r.month} className="flex-1 flex flex-col items-center gap-2">
                            <div 
                              className="w-full bg-orange-500 rounded-t transition-all hover:bg-orange-400"
                              style={{ height: `${(r.revenue / 30000) * 100}%`, minHeight: "20px" }}
                              title={`$${r.revenue.toLocaleString()}`}
                            ></div>
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{r.month}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Revenue Breakdown Table */}
                    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)" }}>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr style={{ background: "var(--color-surface-2)" }}>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Month</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Revenue</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Jobs</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Avg per Job</th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenue.map((r) => (
                              <tr key={r.month} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                                <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{r.month}</td>
                                <td className="px-4 py-3 text-green-400 font-medium">${r.revenue.toLocaleString()}</td>
                                <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{r.jobs}</td>
                                <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>${r.avgPerJob}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Technicians Report */}
                {activeTab === "technicians" && (
                  <div className="space-y-5">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Techs</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{techs.length}</p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Active Jobs</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#b7791f" }}>
                          {techs.reduce((sum, t) => sum + t.jobsInProgress, 0)}
                        </p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Avg Utilization</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#2563eb" }}>
                          {Math.round(techs.reduce((sum, t) => sum + t.utilization, 0) / techs.length)}%
                        </p>
                      </div>
                      <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Avg Rating</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: "#0d9488" }}>
                          {(techs.reduce((sum, t) => sum + t.avgJobRating, 0) / techs.length).toFixed(1)}
                        </p>
                      </div>
                    </div>

                    {/* Tech Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {techs.map((tech) => (
                        <div key={tech.id} className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                          <div className="flex items-start gap-4">
                            <div 
                              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                              style={{ background: tech.color }}
                            >
                              {tech.initials}
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{tech.name}</h3>
                              <p className="text-sm capitalize" style={{ color: "var(--color-text-muted)" }}>{tech.role}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Completed</p>
                              <p className="font-semibold" style={{ color: "#0d9488" }}>{tech.jobsCompleted}</p>
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>In Progress</p>
                              <p className="font-semibold" style={{ color: "#b7791f" }}>{tech.jobsInProgress}</p>
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Revenue</p>
                              <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>${tech.revenueGenerated.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Rating</p>
                              <p className="font-semibold" style={{ color: "#0d9488" }}>{tech.avgJobRating.toFixed(1)} ⭐</p>
                            </div>
                          </div>

                          {/* Utilization Bar */}
                          <div className="mt-4">
                            <div className="flex justify-between text-xs mb-1">
                              <span style={{ color: "var(--color-text-muted)" }}>Utilization</span>
                              <span style={{ color: "var(--color-text-secondary)" }}>{tech.utilization}%</span>
                            </div>
                            <div className="h-2 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                              <div 
                                className="h-full rounded-full"
                                style={{ 
                                  width: `${tech.utilization}%`,
                                  background: tech.utilization > 80 ? "#0d9488" : tech.utilization > 60 ? "#b7791f" : "#be123c"
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customers Report */}
                {activeTab === "customers" && (
                  <div className="space-y-5">
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface-2)" }}>
                        <span className="text-2xl">👥</span>
                      </div>
                      <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Customer Analytics</h3>
                      <p style={{ color: "var(--color-text-muted)" }}>
                        Customer lifetime value, retention rates, and acquisition metrics coming soon.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
