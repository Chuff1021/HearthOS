"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function TaxesPage() {
  return (
    <FinanceMvpShell
      title="Taxes"
      subtitle="Track sales tax liability, payroll obligations, and filing calendars in one view."
      primaryCta="Prepare Filing Packet"
      secondaryCta="Export Tax Detail"
      metrics={[
        { label: "Sales Tax Due", value: "$8,940", trend: "Across 3 jurisdictions" },
        { label: "Payroll Tax Due", value: "$6,204", trend: "Due Mar 15" },
        { label: "Open Notices", value: "1", trend: "Needs response" },
        { label: "Filing Readiness", value: "78%", trend: "3 checks remaining" },
      ]}
      apiPlaceholders={[
        { label: "Tax liabilities", endpoint: "/api/finance/taxes/liabilities" },
        { label: "Generate filing packet", method: "POST", endpoint: "/api/finance/taxes/filings" },
        { label: "Submit tax payment", method: "POST", endpoint: "/api/finance/taxes/payments" },
      ]}
      quickActions={[
        { label: "Payroll", href: "/finance/payroll" },
        { label: "Bills", href: "/finance/bills" },
      ]}
    />
  );
}
