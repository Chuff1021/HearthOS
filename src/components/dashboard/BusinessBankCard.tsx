"use client";

import { useEffect, useMemo, useState } from "react";

type QuickBooksStatus = {
  connected: boolean;
  companyName?: string;
  error?: string;
  needsReconnect?: boolean;
  bankAccounts?: Array<{
    name?: string;
    balance?: number | string;
    updatedAt?: string;
  }>;
  lastSync?: string;
};

type QuickBooksSyncStatus = {
  status?: {
    lastSync?: string;
  };
};

function formatCurrency(value?: number | string) {
  if (value === undefined || value === null || value === "") return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function BusinessBankCard() {
  const [loading, setLoading] = useState(true);
  const [qbStatus, setQbStatus] = useState<QuickBooksStatus | null>(null);
  const [lastSync, setLastSync] = useState<string | undefined>(undefined);

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, syncRes] = await Promise.all([
          fetch("/api/quickbooks/status"),
          fetch("/api/quickbooks/sync-all"),
        ]);

        const statusJson: QuickBooksStatus = await statusRes.json();
        setQbStatus(statusJson);

        if (syncRes.ok) {
          const syncJson: QuickBooksSyncStatus = await syncRes.json();
          setLastSync(syncJson?.status?.lastSync);
        }
      } catch {
        setQbStatus({ connected: false, error: "Unable to load QuickBooks status" });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const connected = !!qbStatus?.connected;
  const account = useMemo(() => qbStatus?.bankAccounts?.[0], [qbStatus]);
  const displayedLastSync = formatDateTime(lastSync ?? qbStatus?.lastSync ?? account?.updatedAt);
  const displayedBalance = formatCurrency(account?.balance);

  const ctaLabel = connected
    ? qbStatus?.needsReconnect
      ? "Reconnect QuickBooks"
      : "Manage Integration"
    : "Connect QuickBooks";

  return (
    <section
      className="rounded-xl p-5"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Business Bank
            </h2>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: connected ? "rgba(44,160,28,0.12)" : "rgba(148,163,184,0.16)",
                color: connected ? "#2ca01c" : "var(--color-text-muted)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: connected ? "#2ca01c" : "var(--color-text-muted)" }}
              />
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {connected
              ? qbStatus?.companyName
                ? `${qbStatus.companyName} via QuickBooks`
                : "QuickBooks-linked account visibility"
              : "Connect QuickBooks to surface linked bank-account details"}
          </p>
        </div>

        <a
          href="/integrations/quickbooks"
          className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: connected
              ? "var(--color-surface-3)"
              : "linear-gradient(135deg, #2ca01c, #1e7a14)",
            color: connected ? "var(--color-text-primary)" : "white",
            border: connected ? "1px solid var(--color-border)" : "none",
          }}
        >
          {ctaLabel}
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--color-surface-1)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            Primary Account
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {loading ? "Loading..." : account?.name || (connected ? "Business Checking" : "—")}
          </div>
        </div>

        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--color-surface-1)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            Balance (placeholder)
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {loading ? "Loading..." : connected ? displayedBalance : "—"}
          </div>
        </div>

        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--color-surface-1)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            Last Sync
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {loading ? "Loading..." : connected ? displayedLastSync : "—"}
          </div>
        </div>
      </div>

      {!connected && !loading && (
        <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
          No linked business bank data yet. Connect QuickBooks to enable this card.
        </p>
      )}
    </section>
  );
}
