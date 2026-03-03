"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

const financeSections = [
  { label: "Banking", href: "/finance/banking" },
  { label: "Expenses", href: "/finance/expenses" },
  { label: "Vendors", href: "/finance/vendors" },
  { label: "Purchase Orders", href: "/finance/purchase-orders" },
  { label: "Bills", href: "/finance/bills" },
  { label: "Reconciliation", href: "/finance/reconciliation" },
  { label: "Payroll", href: "/finance/payroll" },
  { label: "Taxes", href: "/finance/taxes" },
  { label: "Reports", href: "/finance/reports" },
];

export default function FinanceHubPage() {
  return (
    <FinanceMvpShell
      title="Finance Hub"
      subtitle="Central accounting workspace for cash flow, payables, payroll, taxes, and financial controls."
      primaryCta="Create Journal Entry"
      secondaryCta="Start Month-End Close"
      metrics={[
        { label: "Cash On Hand", value: "$182,420", trend: "+4.2% vs last month" },
        { label: "Open Bills", value: "$43,180", trend: "12 due this week" },
        { label: "Unreconciled Txns", value: "27", trend: "Last sync 22m ago" },
        { label: "Payroll Run", value: "Mar 08", trend: "Draft ready" },
      ]}
      apiPlaceholders={[
        { label: "Finance summary", method: "GET", endpoint: "/api/finance/summary" },
        { label: "Create journal entry", method: "POST", endpoint: "/api/finance/journal-entries" },
        { label: "Trigger close checklist", method: "POST", endpoint: "/api/finance/close/run" },
      ]}
      quickActions={financeSections}
    />
  );
}
