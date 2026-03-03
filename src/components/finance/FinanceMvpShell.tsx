import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface FinanceMetric {
  label: string;
  value: string;
  trend?: string;
}

interface ApiPlaceholder {
  label: string;
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "PATCH";
}

interface QuickAction {
  label: string;
  href: string;
}

interface FinanceMvpShellProps {
  title: string;
  subtitle: string;
  metrics: FinanceMetric[];
  primaryCta: string;
  secondaryCta?: string;
  apiPlaceholders: ApiPlaceholder[];
  quickActions?: QuickAction[];
}

export default function FinanceMvpShell({
  title,
  subtitle,
  metrics,
  primaryCta,
  secondaryCta,
  apiPlaceholders,
  quickActions = [],
}: FinanceMvpShellProps) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="px-6 py-5 border-b" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-1)" }}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{title}</h1>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "linear-gradient(135deg, #f97316, #ea6c0a)", color: "white" }}
              >
                {primaryCta}
              </button>
              {secondaryCta ? (
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-surface-3)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                >
                  {secondaryCta}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                    {metric.label}
                  </p>
                  <p className="text-2xl font-bold mt-2" style={{ color: "var(--color-text-primary)" }}>
                    {metric.value}
                  </p>
                  {metric.trend ? (
                    <p className="text-xs mt-1" style={{ color: "#60a5fa" }}>{metric.trend}</p>
                  ) : null}
                </div>
              ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  API Wiring Placeholders
                </h2>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Contract-first stubs to wire into QuickBooks, payroll, and banking providers.
                </p>
                <div className="mt-4 space-y-2">
                  {apiPlaceholders.map((placeholder) => (
                    <div
                      key={placeholder.label}
                      className="rounded-lg px-3 py-2 text-sm flex items-center justify-between"
                      style={{ background: "var(--color-surface-3)", border: "1px dashed var(--color-border)" }}
                    >
                      <span style={{ color: "var(--color-text-primary)" }}>{placeholder.label}</span>
                      <code className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {(placeholder.method || "GET")} {placeholder.endpoint}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Next Integration Steps</h2>
                <ul className="mt-3 space-y-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  <li>• Map form payloads to org-aware API routes.</li>
                  <li>• Add optimistic mutation state and toast handling.</li>
                  <li>• Enforce role permissions before action execution.</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/integrations/quickbooks"
                    className="px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: "rgba(44,160,28,0.15)", color: "#2ca01c", border: "1px solid rgba(44,160,28,0.25)" }}
                  >
                    Open QuickBooks Integration
                  </Link>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
                  >
                    Connect Additional Provider (Coming Soon)
                  </button>
                </div>
              </div>
            </section>

            {quickActions.length > 0 ? (
              <section className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Quick navigation</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ background: "var(--color-surface-3)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
