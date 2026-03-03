"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function VendorsPage() {
  return (
    <FinanceMvpShell
      title="Vendors"
      subtitle="Maintain supplier records, payment terms, and compliance docs for procurement workflows."
      primaryCta="Add Vendor"
      secondaryCta="Upload W-9"
      metrics={[
        { label: "Active Vendors", value: "64", trend: "9 strategic partners" },
        { label: "Net-30 Vendors", value: "38", trend: "Preferred terms" },
        { label: "Expired Docs", value: "6", trend: "Needs renewal" },
        { label: "Avg Payment Time", value: "17 days", trend: "Target < 20 days" },
      ]}
      apiPlaceholders={[
        { label: "Fetch vendor master", endpoint: "/api/finance/vendors" },
        { label: "Create vendor", method: "POST", endpoint: "/api/finance/vendors" },
        { label: "Attach compliance file", method: "POST", endpoint: "/api/finance/vendors/:id/documents" },
      ]}
      quickActions={[
        { label: "Purchase Orders", href: "/finance/purchase-orders" },
        { label: "Bills", href: "/finance/bills" },
      ]}
    />
  );
}
