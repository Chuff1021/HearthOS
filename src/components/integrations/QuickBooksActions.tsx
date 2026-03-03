"use client";

import { useState, useEffect } from "react";

interface QuickBooksActionsProps {
  connected?: boolean;
}

interface QBStatus {
  connected: boolean;
  companyName?: string;
  realmId?: string;
  error?: string;
  needsReconnect?: boolean;
  refreshed?: boolean;
}

export default function QuickBooksActions({ connected: initialConnected }: QuickBooksActionsProps) {
  const [status, setStatus] = useState<QBStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // Check real connection status
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quickbooks/status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus({ connected: false, error: "Failed to check connection status" });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/quickbooks/sync-all", { method: "POST" });
      const data = await res.json();
      
      if (data.success) {
        const { recordsSynced } = data.status;
        setSyncResult({
          success: true,
          message: `Synced ${recordsSynced.customers} customers, ${recordsSynced.items} items, ${recordsSynced.invoices} invoices, ${recordsSynced.payments} payments`,
        });
      } else {
        setSyncResult({
          success: false,
          message: data.error || "Sync failed",
        });
      }
    } catch (err) {
      setSyncResult({
        success: false,
        message: "Failed to sync with QuickBooks",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Checking connection...
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="flex items-center gap-3">
        {status?.needsReconnect && (
          <span className="text-xs" style={{ color: "#FF204E" }}>
            Connection expired
          </span>
        )}
        <a
          href="/api/quickbooks/connect"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg, #98CD00, #98CD00)",
            color: "white",
            boxShadow: "0 0 16px rgba(152,205,0,0.25)",
          }}
        >
          {status?.needsReconnect ? "Reconnect QuickBooks" : "Connect QuickBooks"}
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {status.companyName && (
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {status.companyName}
        </span>
      )}
      {syncResult && (
        <span
          className="text-xs px-2 py-1 rounded"
          style={{
            background: syncResult.success ? "rgba(152,205,0,0.12)" : "rgba(255,32,78,0.12)",
            color: syncResult.success ? "#98CD00" : "#FF204E",
          }}
        >
          {syncResult.message}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
        style={{
          background: "var(--color-surface-2)",
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border)",
        }}
      >
        {syncing ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Syncing...
          </>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clipRule="evenodd"
              />
            </svg>
            Sync Now
          </>
        )}
      </button>
      <button
        onClick={checkStatus}
        className="p-2 rounded-lg transition-all"
        style={{
          background: "var(--color-surface-2)",
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border)",
        }}
        title="Refresh connection status"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path
            fillRule="evenodd"
            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
