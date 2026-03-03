"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function BankingPage() {
  return (
    <FinanceMvpShell
      title="Banking"
      subtitle="Monitor operating accounts, card balances, and incoming deposits across connected institutions."
      primaryCta="Link Bank Account"
      secondaryCta="Initiate Transfer"
      metrics={[
        { label: "Operating Account", value: "$121,900", trend: "2 pending deposits" },
        { label: "Savings Reserve", value: "$46,300", trend: "Target: 3 months OPEX" },
        { label: "Card Spend MTD", value: "$9,740", trend: "+8.1% vs prior month" },
        { label: "Unmatched Deposits", value: "4", trend: "Needs review" },
      ]}
      apiPlaceholders={[
        { label: "Fetch linked accounts", method: "GET", endpoint: "/api/finance/banking/accounts" },
        { label: "Create transfer", method: "POST", endpoint: "/api/finance/banking/transfers" },
        { label: "Sync transactions", method: "POST", endpoint: "/api/finance/banking/sync" },
      ]}
      quickActions={[
        { label: "Expenses", href: "/finance/expenses" },
        { label: "Reconciliation", href: "/finance/reconciliation" },
      ]}
    />
  );
}
