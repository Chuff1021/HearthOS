"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DashboardStats from "@/components/dashboard/DashboardStats";
import TodaysJobs from "@/components/dashboard/TodaysJobs";
import DispatchBoard from "@/components/dashboard/DispatchBoard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import QuickActions from "@/components/dashboard/QuickActions";
import SalesFunnel from "@/components/dashboard/SalesFunnel";

type DashboardTab = "overview" | "pipeline";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const { user } = useUser();
  const displayName = user?.firstName || user?.fullName || "there";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Page Title + Tab Nav */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                  Good morning, {displayName} 👋
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Monday, February 24, 2026 · 8 jobs scheduled today
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Tab Switcher */}
                <div className="flex rounded-xl p-1 gap-1" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                  <button
                    onClick={() => setActiveTab("overview")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === "overview"
                        ? "text-white"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                    style={{ background: activeTab === "overview" ? "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))" : "transparent" }}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab("pipeline")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                      activeTab === "pipeline"
                        ? "text-white"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                    style={{ background: activeTab === "pipeline" ? "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))" : "transparent" }}
                  >
                    Sales Pipeline
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        background: activeTab === "pipeline" ? "rgba(255,255,255,0.2)" : "rgba(10,132,255,0.12)",
                        color: activeTab === "pipeline" ? "#fff" : "var(--color-ember)",
                      }}
                    >
                      6
                    </span>
                  </button>
                </div>
                <QuickActions />
              </div>
            </div>

            {/* Stats Row — always visible */}
            <DashboardStats />

            {/* Tab Content */}
            {activeTab === "overview" && (
              <>
                {/* Main Content Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                  {/* Today's Jobs — takes 2 cols */}
                  <div className="xl:col-span-2">
                    <TodaysJobs />
                  </div>
                  {/* Recent Activity — 1 col */}
                  <div className="xl:col-span-1">
                    <RecentActivity />
                  </div>
                </div>

                {/* Dispatch Board */}
                <DispatchBoard />
              </>
            )}

            {activeTab === "pipeline" && (
              <SalesFunnel />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
