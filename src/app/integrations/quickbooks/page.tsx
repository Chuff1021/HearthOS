import Link from "next/link";
import QuickBooksActions from "@/components/integrations/QuickBooksActions";

const syncStats = [
  { label: "Invoices Synced", value: "—", sub: "Sync to see", color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  { label: "Payments Matched", value: "—", sub: "Sync to see", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  { label: "Customers Linked", value: "—", sub: "Sync to see", color: "#c084fc", bg: "rgba(192,132,252,0.12)" },
  { label: "Last Sync", value: "Never", sub: "Click Sync Now", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
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
      {/* Sidebar */}
      <div
        className="w-[220px] flex-shrink-0 flex flex-col"
        style={{ background: "var(--color-surface-1)", borderRight: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #f97316, #ea6c0a)", boxShadow: "0 0 16px rgba(249,115,22,0.35)" }}
          >
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>HearthOS</div>
            <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Field Service</div>
          </div>
        </div>
        <div className="p-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(44,160,28,0.15)", border: "1px solid rgba(44,160,28,0.25)" }}
            >
              <svg viewBox="0 0 24 24" fill="#2ca01c" className="w-6 h-6">
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
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "#f87171",
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            {searchParams?.connected === "true" && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "rgba(74,222,128,0.12)",
                  border: "1px solid rgba(74,222,128,0.2)",
                  color: "#4ade80",
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
                        background: setting.enabled ? "#2ca01c" : "var(--color-surface-4)",
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
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <h2 className="font-semibold text-sm mb-3" style={{ color: "#fbbf24" }}>
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
