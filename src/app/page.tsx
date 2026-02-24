import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DashboardStats from "@/components/dashboard/DashboardStats";
import TodaysJobs from "@/components/dashboard/TodaysJobs";
import DispatchBoard from "@/components/dashboard/DispatchBoard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import QuickActions from "@/components/dashboard/QuickActions";

export default function DashboardPage() {
  return (
    <div className="flex h-screen bg-[#f8f7f4] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1600px] mx-auto space-y-6">
            {/* Page Title */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-[#1a1a2e]">
                  Good morning, Sarah 👋
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Monday, February 24, 2026 · 8 jobs scheduled today
                </p>
              </div>
              <QuickActions />
            </div>

            {/* Stats Row */}
            <DashboardStats />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
          </div>
        </main>
      </div>
    </div>
  );
}
