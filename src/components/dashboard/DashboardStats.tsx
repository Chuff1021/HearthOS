"use client";

import { useState, useEffect } from "react";

interface DashboardData {
  stats: {
    totalCustomers: number;
    totalOutstanding: number;
    totalOverdue: number;
    paidThisMonth: number;
    draftCount: number;
    sentCount: number;
    overdueCount: number;
    totalRevenue: number;
    totalInvoices: number;
    jobsToday: number;
    jobsCompletedToday: number;
    jobsRemainingToday: number;
    activeTechs: number;
    totalTechs: number;
  };
}

export default function DashboardStats() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  const s = data?.stats;

  const stats = [
    {
      label: "Jobs Today",
      value: s ? String(s.jobsToday) : "...",
      sub: s ? `${s.jobsCompletedToday} completed · ${s.jobsRemainingToday} remaining` : "Loading...",
      trend: s ? `${s.activeTechs} active techs` : "",
      trendUp: true,
      accentColor: "#2563EB",
      accentBg: "rgba(37,99,235,0.12)",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
          <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
        </svg>
      ),
    },
    {
      label: "Total Revenue",
      value: s ? `$${s.totalRevenue.toLocaleString()}` : "...",
      sub: s ? `${s.totalInvoices} invoices total` : "Loading...",
      trend: s ? `${s.totalCustomers} customers` : "",
      trendUp: true,
      accentColor: "#98CD00",
      accentBg: "rgba(152,205,0,0.12)",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "Outstanding",
      value: s ? `$${s.totalOutstanding.toLocaleString()}` : "...",
      sub: s ? `${s.sentCount + s.overdueCount} invoices pending` : "Loading...",
      trend: s ? `${s.overdueCount} overdue` : "",
      trendUp: false,
      accentColor: "#f8971f",
      accentBg: "rgba(255,68,0,0.12)",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: "Active Techs",
      value: s ? `${s.activeTechs} / ${s.totalTechs}` : "...",
      sub: s ? `${s.jobsToday} jobs scheduled today` : "Loading...",
      trend: "Live dispatch",
      trendUp: true,
      accentColor: "#2563EB",
      accentBg: "rgba(37,99,235,0.12)",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
      ),
    },
    {
      label: "Customers",
      value: s ? String(s.totalCustomers) : "...",
      sub: "Active accounts",
      trend: s ? `$${s.paidThisMonth.toLocaleString()} paid` : "",
      trendUp: true,
      accentColor: "#98CD00",
      accentBg: "rgba(152,205,0,0.12)",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
      ),
    },
    {
      label: "Overdue",
      value: s ? `$${s.totalOverdue.toLocaleString()}` : "...",
      sub: s ? `${s.overdueCount} invoices` : "Loading...",
      trend: "Needs attention",
      trendUp: false,
      accentColor: "#FF204E",
      accentBg: "rgba(255,32,78,0.12)",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl p-4 cursor-pointer transition-all"
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-border-hover)";
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-border)";
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
          }}
        >
          {/* Icon */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ background: stat.accentBg, color: stat.accentColor }}
          >
            {stat.icon}
          </div>

          {/* Value */}
          <div
            className="text-xl font-bold leading-none mb-1"
            style={{ color: "var(--color-text-primary)" }}
          >
            {stat.value}
          </div>

          {/* Label */}
          <div className="text-[11px] mb-2" style={{ color: "var(--color-text-muted)" }}>
            {stat.label}
          </div>

          {/* Divider */}
          <div className="h-px mb-2" style={{ background: "var(--color-border)" }}></div>

          {/* Sub */}
          <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            {stat.sub}
          </div>

          {/* Trend */}
          <div
            className="text-[10px] font-semibold mt-1 flex items-center gap-1"
            style={{ color: stat.trendUp ? "#98CD00" : "#FF204E" }}
          >
            {stat.trendUp ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            {stat.trend}
          </div>
        </div>
      ))}
    </div>
  );
}
