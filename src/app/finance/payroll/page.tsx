"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function PayrollPage() {
  return (
    <FinanceMvpShell
      title="Payroll"
      subtitle="Prepare pay runs, validate hours, and sync payroll journals back to the GL."
      primaryCta="Preview Pay Run"
      secondaryCta="Sync Time Entries"
      metrics={[
        { label: "Employees", value: "27", trend: "3 pending onboarding" },
        { label: "Gross Payroll", value: "$32,910", trend: "Current cycle" },
        { label: "Unapproved Time", value: "41h", trend: "Across 6 techs" },
        { label: "Payroll Taxes", value: "$6,204", trend: "Estimated" },
      ]}
      apiPlaceholders={[
        { label: "Fetch payroll periods", endpoint: "/api/finance/payroll/periods" },
        { label: "Generate payroll preview", method: "POST", endpoint: "/api/finance/payroll/preview" },
        { label: "Post payroll journal", method: "POST", endpoint: "/api/finance/payroll/journal" },
      ]}
      quickActions={[
        { label: "Taxes", href: "/finance/taxes" },
        { label: "Reports", href: "/finance/reports" },
      ]}
    />
  );
}
