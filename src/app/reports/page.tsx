"use client";

import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type ReportCard = {
  href: string;
  title: string;
  description: string;
  status: "live" | "soon";
  icon: string;
};

const reports: ReportCard[] = [
  {
    href: "/reports/profit-by-job",
    title: "Profit by Job",
    description:
      "Per-invoice P&L. Revenue from line items, material cost from inventory, vendor bills attributed to the customer. Click any job for the full breakdown.",
    status: "live",
    icon: "💰",
  },
  {
    href: "/reports/ar-aging",
    title: "Accounts Receivable Aging",
    description: "Who owes you, by how long overdue. Current / 30 / 60 / 90+ buckets per customer.",
    status: "live",
    icon: "📅",
  },
  {
    href: "/reports/ap-aging",
    title: "Accounts Payable Aging",
    description: "What you owe vendors, bucketed by days overdue. Click a vendor to see open bills.",
    status: "live",
    icon: "📤",
  },
  {
    href: "/reports/sales-by-customer",
    title: "Sales by Customer",
    description: "Top customers by revenue with profit, margin, open balance, and last sale date.",
    status: "live",
    icon: "🏆",
  },
  {
    href: "/reports/sales-by-item",
    title: "Sales by Item",
    description: "Top-selling items with quantity, revenue, profit, and margin. Sort by any column.",
    status: "live",
    icon: "📦",
  },
  {
    href: "/reports/cash-flow",
    title: "Cash Flow",
    description: "Money in (customer payments) vs money out (bills paid), bucketed monthly with a chart.",
    status: "live",
    icon: "💵",
  },
];

export default function ReportsPage() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1400px] mx-auto space-y-6">
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Reports</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Pick a report to dig into.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map((r) => {
                const isLive = r.status === "live";
                const Tag: any = isLive ? Link : "div";
                const props = isLive ? { href: r.href } : {};
                return (
                  <Tag
                    key={r.href}
                    {...props}
                    className={`p-5 rounded-xl block transition-all ${isLive ? "hover:opacity-90 cursor-pointer" : "opacity-60 cursor-default"}`}
                    style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-2xl">{r.icon}</div>
                      <span
                        className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{
                          background: isLive ? "rgba(22,163,74,0.15)" : "var(--color-surface-2)",
                          color: isLive ? "#16A34A" : "var(--color-text-muted)",
                        }}
                      >
                        {isLive ? "Live" : "Coming soon"}
                      </span>
                    </div>
                    <h2 className="text-base font-semibold mt-3" style={{ color: "var(--color-text-primary)" }}>
                      {r.title}
                    </h2>
                    <p className="text-xs mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                      {r.description}
                    </p>
                  </Tag>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
