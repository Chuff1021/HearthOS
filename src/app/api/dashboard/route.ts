import { NextResponse } from "next/server";
import { getDashboardStats, getCustomers, getInvoices } from "@/lib/data-store";

export async function GET() {
  try {
    const stats = getDashboardStats();
    const customers = getCustomers();
    const invoices = getInvoices();

    // Recent activity from invoices
    const recentActivity = invoices.slice(0, 5).map((inv) => ({
      id: inv.id,
      type: inv.status === "paid" ? "payment" : inv.status === "sent" ? "invoice_sent" : "invoice_created",
      description: `${inv.customerName} — ${inv.jobTitle}`,
      amount: inv.totalAmount,
      timestamp: inv.updatedAt,
    }));

    return NextResponse.json({
      stats,
      recentCustomers: customers.slice(0, 5),
      recentActivity,
    });
  } catch (err) {
    console.error("Failed to get dashboard data:", err);
    return NextResponse.json({ error: "Failed to get dashboard data" }, { status: 500 });
  }
}
