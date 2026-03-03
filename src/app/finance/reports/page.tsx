"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function FinanceReportsPage() {
  return (
    <FinanceMvpShell
      title="Finance Reports"
      subtitle="Build board-ready reporting with drilldowns for profitability, cash flow, and variance."
      primaryCta="Generate P&L"
      secondaryCta="Schedule Report Email"
      metrics={[
        { label: "Revenue MTD", value: "$214,600", trend: "+11.8% YoY" },
        { label: "Gross Margin", value: "41.2%", trend: "+1.3 pts" },
        { label: "Net Income", value: "$37,440", trend: "Above forecast" },
        { label: "Cash Burn", value: "$12,100", trend: "Stable" },
      ]}
      apiPlaceholders={[
        { label: "Run financial report", method: "POST", endpoint: "/api/finance/reports/run" },
        { label: "Save report template", method: "POST", endpoint: "/api/finance/reports/templates" },
        { label: "Share report bundle", method: "POST", endpoint: "/api/finance/reports/share" },
      ]}
      quickActions={[
        { label: "Finance Hub", href: "/finance" },
        { label: "Company Reports", href: "/reports" },
      ]}
    />
  );
}
