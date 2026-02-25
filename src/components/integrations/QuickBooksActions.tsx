"use client";

import { useState } from "react";

type QuickBooksActionsProps = {
  connected: boolean;
};

export default function QuickBooksActions({ connected }: QuickBooksActionsProps) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/quickbooks/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Sync failed");
      }
      setMessage("Sync completed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setMessage(msg);
    } finally {
      setSyncing(false);
    }
  };

  if (!connected) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, #2ca01c, #1e7a14)",
          color: "white",
          boxShadow: "0 0 16px rgba(44,160,28,0.25)",
        }}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path
            fillRule="evenodd"
            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
            clipRule="evenodd"
          />
        </svg>
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
      {message ? (
        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
