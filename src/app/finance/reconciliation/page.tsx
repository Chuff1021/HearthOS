"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function ReconciliationPage() {
  return (
    <FinanceMvpShell
      title="Reconciliation"
      subtitle="Match transactions, resolve exceptions, and keep ledgers clean for close."
      primaryCta="Start Auto-Match"
      secondaryCta="Resolve Exceptions"
      metrics={[
        { label: "Matched Today", value: "143", trend: "Auto-match 88%" },
        { label: "Exceptions", value: "19", trend: "7 high-priority" },
        { label: "Statement Coverage", value: "96%", trend: "4 accounts synced" },
        { label: "Month-End Readiness", value: "82%", trend: "On track" },
      ]}
      apiPlaceholders={[
        { label: "Get reconciliation queue", endpoint: "/api/finance/reconciliation" },
        { label: "Run matching engine", method: "POST", endpoint: "/api/finance/reconciliation/match" },
        { label: "Mark exception resolved", method: "PATCH", endpoint: "/api/finance/reconciliation/:id/resolve" },
      ]}
      quickActions={[
        { label: "Banking", href: "/finance/banking" },
        { label: "Reports", href: "/finance/reports" },
      ]}
    />
  );
}
