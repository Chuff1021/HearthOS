"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/admin");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Failed to login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
      <div
        className="max-w-sm w-full p-8 rounded-xl"
        style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #f97316, #ea6c0a)", boxShadow: "0 0 16px rgba(249,115,22,0.35)" }}
          >
            <svg viewBox="0 0 20 20" fill="white" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <div className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>HearthOS</div>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Admin Login</div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              placeholder="Enter admin password"
              required
            />
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.2)",
                color: "#f87171",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #f97316, #ea6c0a)",
              color: "white",
              boxShadow: "0 0 16px rgba(249,115,22,0.25)",
            }}
          >
            {loading ? "Logging in..." : "Login to Admin"}
          </button>
        </form>

        <p className="mt-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
          Set ADMIN_PASSWORD in your environment variables
        </p>
      </div>
    </div>
  );
}
