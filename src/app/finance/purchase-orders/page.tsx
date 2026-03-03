"use client";

import FinanceMvpShell from "@/components/finance/FinanceMvpShell";

export default function PurchaseOrdersPage() {
  return (
    <FinanceMvpShell
      title="Purchase Orders"
      subtitle="Issue and track POs, capture receipt status, and convert fulfilled orders to bills."
      primaryCta="Create Purchase Order"
      secondaryCta="Bulk Receive Items"
      metrics={[
        { label: "Open POs", value: "22", trend: "$74,900 committed" },
        { label: "Awaiting Approval", value: "8", trend: ">$2k threshold" },
        { label: "Partially Received", value: "5", trend: "Follow-up required" },
        { label: "PO to Bill Match", value: "91%", trend: "+2% this month" },
      ]}
      apiPlaceholders={[
        { label: "List purchase orders", endpoint: "/api/finance/purchase-orders" },
        { label: "Create purchase order", method: "POST", endpoint: "/api/finance/purchase-orders" },
        { label: "Receive line items", method: "POST", endpoint: "/api/finance/purchase-orders/:id/receive" },
      ]}
      quickActions={[
        { label: "Vendors", href: "/finance/vendors" },
        { label: "Reconciliation", href: "/finance/reconciliation" },
      ]}
    />
  );
}
