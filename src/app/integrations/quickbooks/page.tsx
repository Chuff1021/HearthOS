import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import QuickBooksActions from "@/components/integrations/QuickBooksActions";

const syncStats = [
  { label: "Invoices Synced", value: "—", sub: "Sync to see", color: "#98CD00", bg: "rgba(152,205,0,0.12)" },
  { label: "Payments Matched", value: "—", sub: "Sync to see", color: "#2563EB", bg: "rgba(29,78,216,0.12)" },
  { label: "Customers Linked", value: "—", sub: "Sync to see", color: "#2563EB", bg: "rgba(37,99,235,0.12)" },
  { label: "Last Sync", value: "Never", sub: "Click Sync Now", color: "#f8971f", bg: "rgba(255,68,0,0.12)" },
];

type QuickBooksPageProps = {
  searchParams?: {
    connected?: string;
    error?: string;
  };
};

export default function QuickBooksPage({ searchParams }: QuickBooksPageProps) {
  const error = searchParams?.error;
  const errorMessage =
    error === "missing_params"
      ? "QuickBooks connection failed: missing parameters."
      : error === "oauth_failed"
      ? "QuickBooks connection failed: OAuth exchange failed."
      : error
      ? `QuickBooks connection failed: ${error}`
      : null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {/* Page Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(152,205,0,0.15)", border: "1px solid rgba(152,205,0,0.25)" }}
            >
              <svg viewBox="0 0 24 24" fill="#98CD00" className="w-6 h-6">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>
                QuickBooks Integration
              </h1>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Sync invoices, payments, and customers with QuickBooks Online
              </p>
            </div>
          </div>
          <QuickBooksActions />
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {errorMessage ? (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "rgba(255,32,78,0.12)",
                  border: "1px solid rgba(255,32,78,0.2)",
                  color: "#FF204E",
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            {searchParams?.connected === "true" && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "rgba(152,205,0,0.12)",
                  border: "1px solid rgba(152,205,0,0.2)",
                  color: "#98CD00",
                }}
              >
                ✓ Successfully connected to QuickBooks! Click &quot;Sync Now&quot; to pull your data.
              </div>
            )}

            {/* Setup Instructions */}
            <div
              className="rounded-xl p-5"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h2 className="font-semibold text-sm mb-4" style={{ color: "var(--color-text-primary)" }}>
                📘 How QuickBooks Integration Works
              </h2>
              <div className="space-y-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <p>
                  <strong>1. Connect:</strong> Click &quot;Connect QuickBooks&quot; to authorize HearthOS to access your QuickBooks Online company.
                </p>
                <p>
                  <strong>2. Sync:</strong> After connecting, click &quot;Sync Now&quot; to pull your customers, invoices, items, and payments.
                </p>
                <p>
                  <strong>3. Manage:</strong> Once synced, your QuickBooks customers will appear in the Customers page, and you can create invoices that sync back to QuickBooks.
                </p>
              </div>
            </div>

            {/* Sync Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {syncStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl p-4"
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: stat.bg, color: stat.color }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                    {stat.value}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {stat.label}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: stat.color }}>
                    {stat.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Sync Settings */}
            <div
              className="rounded-xl p-5"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h2 className="font-semibold text-sm mb-4" style={{ color: "var(--color-text-primary)" }}>
                Sync Settings
              </h2>
              <div className="space-y-3">
                {[
                  { label: "Auto-sync invoices to QuickBooks", desc: "New invoices are pushed to QB within 5 minutes", enabled: true },
                  { label: "Import payments from QuickBooks", desc: "Payments recorded in QB update HearthOS automatically", enabled: true },
                  { label: "Sync customer records", desc: "Keep customer data in sync between both systems", enabled: true },
                  { label: "Map job types to QB service items", desc: "Install, Service, Clean & Burn → QB product/service codes", enabled: false },
                ].map((setting) => (
                  <div
                    key={setting.label}
                    className="flex items-center justify-between py-3"
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                  >
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {setting.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {setting.desc}
                      </div>
                    </div>
                    <div
                      className="w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-all flex-shrink-0 ml-4"
                      style={{
                        background: setting.enabled ? "#98CD00" : "var(--color-surface-4)",
                        justifyContent: setting.enabled ? "flex-end" : "flex-start",
                      }}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Requirements */}
            <div
              className="rounded-xl p-5"
              style={{
                background: "rgba(255,68,0,0.08)",
                border: "1px solid rgba(255,68,0,0.2)",
              }}
            >
              <h2 className="font-semibold text-sm mb-3" style={{ color: "#f8971f" }}>
                ⚠️ Requirements
              </h2>
              <ul className="space-y-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <li>• QuickBooks Online account (not QuickBooks Desktop)</li>
                <li>• Admin access to your QuickBooks company</li>
                <li>• Environment variables set: QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REDIRECT_URI</li>
                <li>• Redirect URI must match what&apos;s configured in your Intuit Developer app</li>
              </ul>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
