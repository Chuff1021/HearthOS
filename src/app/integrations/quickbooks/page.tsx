import Link from "next/link";

const syncStats = [
  { label: "Invoices Synced", value: "1,284", sub: "Last 90 days", color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  { label: "Payments Matched", value: "1,201", sub: "94% match rate", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  { label: "Customers Linked", value: "347", sub: "Active accounts", color: "#c084fc", bg: "rgba(192,132,252,0.12)" },
  { label: "Last Sync", value: "2m ago", sub: "Auto every 5 min", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
];

const recentSyncs = [
  { id: "INV-00891", type: "Invoice", customer: "Linda Martinez", amount: "$1,840", status: "synced", time: "2 min ago" },
  { id: "INV-00890", type: "Invoice", customer: "Mike Johnson", amount: "$3,200", status: "synced", time: "18 min ago" },
  { id: "PAY-00445", type: "Payment", customer: "Robert Chen", amount: "$920", status: "synced", time: "1h ago" },
  { id: "INV-00889", type: "Invoice", customer: "Patricia Williams", amount: "$5,400", status: "pending", time: "2h ago" },
  { id: "PAY-00444", type: "Payment", customer: "Tom Bradley", amount: "$640", status: "synced", time: "3h ago" },
  { id: "INV-00888", type: "Invoice", customer: "Susan Park", amount: "$280", status: "error", time: "4h ago" },
];

export default function QuickBooksPage() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* Sidebar placeholder — in a real app this would be the shared Sidebar component */}
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
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: "rgba(74,222,128,0.1)",
                border: "1px solid rgba(74,222,128,0.2)",
                color: "#4ade80",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot"></span>
              Connected
            </div>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: "linear-gradient(135deg, #2ca01c, #1e7a14)",
                color: "white",
                boxShadow: "0 0 16px rgba(44,160,28,0.25)",
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Sync Now
            </button>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">

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

            {/* Recent Sync Activity */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                  Recent Sync Activity
                </h2>
                <button className="text-xs font-medium" style={{ color: "#f97316" }}>
                  View all →
                </button>
              </div>
              <div>
                {recentSyncs.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 px-5 py-3.5"
                    style={{
                      borderBottom: idx < recentSyncs.length - 1 ? "1px solid var(--color-border)" : "none",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: item.type === "Invoice" ? "rgba(96,165,250,0.12)" : "rgba(74,222,128,0.12)",
                        color: item.type === "Invoice" ? "#60a5fa" : "#4ade80",
                      }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        {item.type === "Invoice" ? (
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        ) : (
                          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                        )}
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {item.id}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                          style={{
                            background: item.type === "Invoice" ? "rgba(96,165,250,0.12)" : "rgba(74,222,128,0.12)",
                            color: item.type === "Invoice" ? "#60a5fa" : "#4ade80",
                          }}
                        >
                          {item.type}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                        {item.customer}
                      </div>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {item.amount}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          background:
                            item.status === "synced"
                              ? "rgba(74,222,128,0.12)"
                              : item.status === "pending"
                                ? "rgba(251,191,36,0.12)"
                                : "rgba(248,113,113,0.12)",
                          color:
                            item.status === "synced"
                              ? "#4ade80"
                              : item.status === "pending"
                                ? "#fbbf24"
                                : "#f87171",
                        }}
                      >
                        {item.status === "synced" ? "✓ Synced" : item.status === "pending" ? "⏳ Pending" : "✗ Error"}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        {item.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connect / Reconnect CTA */}
            <div
              className="rounded-xl p-6 flex items-center justify-between"
              style={{
                background: "linear-gradient(135deg, rgba(44,160,28,0.08), rgba(44,160,28,0.04))",
                border: "1px solid rgba(44,160,28,0.2)",
              }}
            >
              <div>
                <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  QuickBooks Online — Connected
                </div>
                <div className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Authorized as <span style={{ color: "#4ade80" }}>admin@hearthpro.com</span> · Company: Hearth Pro Services LLC
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="text-sm px-4 py-2 rounded-lg font-medium transition-all"
                  style={{
                    background: "var(--color-surface-3)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  Disconnect
                </button>
                <button
                  className="text-sm px-4 py-2 rounded-lg font-semibold transition-all"
                  style={{
                    background: "linear-gradient(135deg, #2ca01c, #1e7a14)",
                    color: "white",
                  }}
                >
                  Open QuickBooks →
                </button>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
