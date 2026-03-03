"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function BillsPage() {
  return (
    <FinanceMvpShell
      title="Bills"
      subtitle="Manage AP lifecycle from intake to approval and payment scheduling."
      primaryCta="Upload Bill"
      secondaryCta="Run Payment Batch"
      metrics={[
        { label: "Bills Due 7d", value: "$19,480", trend: "11 vendors" },
        { label: "Past Due", value: "$4,250", trend: "Escalate now" },
        { label: "Approval Queue", value: "14", trend: "Median SLA 18h" },
        { label: "Duplicate Risk", value: "2", trend: "Potential duplicates" },
      ]}
      apiPlaceholders={[
        { label: "Ingest bill OCR", method: "POST", endpoint: "/api/finance/bills/intake" },
        { label: "Approve bill", method: "PATCH", endpoint: "/api/finance/bills/:id/approve" },
        { label: "Schedule payment", method: "POST", endpoint: "/api/finance/bills/:id/pay" },
      ]}
      quickActions={[
        { label: "Expenses", href: "/finance/expenses" },
        { label: "Taxes", href: "/finance/taxes" },
      ]}
    />
  );
}
