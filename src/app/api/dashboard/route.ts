import { NextResponse } from "next/server";
import { getDashboardStats, getCustomers } from "@/lib/data-store";
import { getJobs } from "@/app/api/jobs/route";
import { getTechs } from "@/app/api/techs/route";

export async function GET() {
  try {
    const baseStats = getDashboardStats();
    const customers = getCustomers();
    const [jobs, techs] = await Promise.all([getJobs(), Promise.resolve(getTechs())]);
    const today = new Date().toISOString().split("T")[0];
    const todaysJobs = jobs.filter((job) => job.scheduledDate === today);
    const jobsCompletedToday = todaysJobs.filter((job) => job.status === "completed").length;
    const jobsRemainingToday = todaysJobs.filter((job) => job.status !== "completed" && job.status !== "cancelled").length;
    const activeTechs = techs.filter((tech) => tech.active).length;
    const stats = {
      ...baseStats,
      jobsToday: todaysJobs.length,
      jobsCompletedToday,
      jobsRemainingToday,
      activeTechs,
      totalTechs: techs.length,
    };

    return NextResponse.json({
      stats,
      recentCustomers: customers.slice(0, 5),
    });
  } catch (err) {
    console.error("Failed to get dashboard data:", err);
    return NextResponse.json({ error: "Failed to get dashboard data" }, { status: 500 });
  }
}
