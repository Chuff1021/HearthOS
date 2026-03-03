"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function ExpensesPage() {
  return (
    <FinanceMvpShell
      title="Expenses"
      subtitle="Track spend by category, flag anomalies, and push approved transactions to accounting."
      primaryCta="Capture Expense"
      secondaryCta="Review Policy Exceptions"
      metrics={[
        { label: "Expense Requests", value: "31", trend: "7 pending approval" },
        { label: "Fuel + Fleet", value: "$6,420", trend: "+3.4% vs budget" },
        { label: "COGS", value: "$18,050", trend: "Within target" },
        { label: "Exception Flags", value: "5", trend: "Above $500 policy" },
      ]}
      apiPlaceholders={[
        { label: "List expense claims", endpoint: "/api/finance/expenses" },
        { label: "Submit expense claim", method: "POST", endpoint: "/api/finance/expenses" },
        { label: "Approve expense claim", method: "PATCH", endpoint: "/api/finance/expenses/:id/approve" },
      ]}
      quickActions={[
        { label: "Vendors", href: "/finance/vendors" },
        { label: "Bills", href: "/finance/bills" },
      ]}
    />
  );
}
