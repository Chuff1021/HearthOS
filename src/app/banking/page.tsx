"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type BankAccount = {
  id: string;
  name: string;
  officialName?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  currentBalance: number;
  availableBalance: number;
  currency: string;
};

type BankTransaction = {
  id: string;
  accountId: string;
  date: string;
  name: string;
  amount: number;
  pending: boolean;
  category: string[];
  paymentChannel?: string | null;
};

type BankingData = {
  configured: boolean;
  connected?: boolean;
  missing?: string[];
  environment?: string;
  institution?: {
    name?: string;
    institutionId?: string;
  };
  connectedAt?: string;
  fetchedAt?: string;
  error?: string;
  accounts: BankAccount[];
  transactions: BankTransaction[];
  summary: {
    currentBalance: number;
    availableBalance: number;
    moneyIn30: number;
    moneyOut30: number;
    pendingCount: number;
  };
};

const fmtMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function signedAmount(value: number) {
  if (value < 0) return { label: `+${fmtMoney(Math.abs(value))}`, color: "#16A34A" };
  return { label: `-${fmtMoney(value)}`, color: "var(--color-text-primary)" };
}

export default function BankingPage() {
  const [data, setData] = useState<BankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  async function loadBanking() {
    setLoading(true);
    try {
      const res = await fetch("/api/banking/summary", { cache: "no-store" });
      const next = await res.json();
      setData(next);
    } catch (err) {
      setData({
        configured: false,
        connected: false,
        error: err instanceof Error ? err.message : "Failed to load banking data",
        accounts: [],
        transactions: [],
        summary: { currentBalance: 0, availableBalance: 0, moneyIn30: 0, moneyOut30: 0, pendingCount: 0 },
      });
    } finally {
      setLoading(false);
    }
  }

  function loadPlaidScript() {
    return new Promise<void>((resolve, reject) => {
      const existing = document.getElementById("plaid-link-script") as HTMLScriptElement | null;
      if (existing) {
        if ((window as any).Plaid) resolve();
        else existing.addEventListener("load", () => resolve(), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "plaid-link-script";
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Plaid Link."));
      document.body.appendChild(script);
    });
  }

  async function connectBankAccount() {
    setConnectMessage(null);
    setConnecting(true);
    try {
      const tokenRes = await fetch("/api/banking/link-token", { method: "POST" });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || "Failed to start Plaid Link.");
      await loadPlaidScript();

      const plaid = (window as any).Plaid;
      if (!plaid) throw new Error("Plaid Link did not load.");

      const handler = plaid.create({
        token: tokenData.linkToken,
        onSuccess: async (publicToken: string, metadata: unknown) => {
          try {
            const exchangeRes = await fetch("/api/banking/exchange-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, metadata }),
            });
            const exchangeData = await exchangeRes.json();
            if (!exchangeRes.ok) throw new Error(exchangeData.error || "Failed to save bank connection.");
            setConnectMessage("Bank account connected.");
            await loadBanking();
          } catch (err) {
            setConnectMessage(err instanceof Error ? err.message : "Failed to save bank connection.");
          }
        },
        onExit: (err: { display_message?: string; error_message?: string } | null) => {
          if (err) setConnectMessage(err.display_message || err.error_message || "Bank connection was not completed.");
        },
      });

      handler.open();
    } catch (err) {
      setConnectMessage(err instanceof Error ? err.message : "Failed to connect bank account.");
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    void loadBanking();
  }, []);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (data?.transactions || []).filter((tx) => {
      if (selectedAccountId !== "all" && tx.accountId !== selectedAccountId) return false;
      if (!query) return true;
      return [
        tx.name,
        tx.date,
        tx.category.join(" "),
        tx.paymentChannel || "",
      ].some((field) => field.toLowerCase().includes(query));
    });
  }, [data?.transactions, selectedAccountId, searchQuery]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Banking</h1>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {data?.fetchedAt ? `Last refreshed ${new Date(data.fetchedAt).toLocaleString()}` : "Connect Plaid to view your live account feed."}
                </p>
              </div>
              <button
                onClick={loadBanking}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                onClick={connectBankAccount}
                disabled={connecting || data?.configured === false}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#16A34A", border: "1px solid rgba(22,163,74,0.35)" }}
              >
                {connecting ? "Opening Plaid..." : data?.connected ? "Reconnect Bank" : "Connect Bank Account"}
              </button>
            </div>

            {connectMessage && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.25)", color: "#2563EB" }}>
                {connectMessage}
              </div>
            )}

            {data?.error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#DC2626" }}>
                {data.error}
              </div>
            )}

            {data && !data.configured && (
              <section className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <div className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Bank connection not configured</div>
                <p className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
                  Add Plaid credentials in Vercel, then use Connect Bank Account to log in with your bank.
                </p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(data.missing || []).map((key) => (
                    <div key={key} className="rounded-lg px-3 py-2 font-mono text-xs" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                      {key}
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-4" style={{ color: "var(--color-text-muted)" }}>
                  Required env vars: PLAID_ENV, PLAID_CLIENT_ID, PLAID_SECRET.
                </p>
              </section>
            )}

            {data?.configured && !data.connected && (
              <section className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                <div className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Connect your business checking account</div>
                <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--color-text-muted)" }}>
                  Use Plaid Link to securely log in with your bank. HearthOS stores the Plaid access token server-side and uses it to show balances and transactions.
                </p>
                <button
                  onClick={connectBankAccount}
                  disabled={connecting}
                  className="mt-4 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "#16A34A" }}
                >
                  {connecting ? "Opening Plaid..." : "Connect Bank Account"}
                </button>
              </section>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                { label: "Current Balance", value: fmtMoney(data?.summary.currentBalance || 0), tone: "#2563EB" },
                { label: "Available", value: fmtMoney(data?.summary.availableBalance || 0), tone: "#16A34A" },
                { label: "Money In · 30 days", value: fmtMoney(data?.summary.moneyIn30 || 0), tone: "#98CD00" },
                { label: "Money Out · 30 days", value: fmtMoney(data?.summary.moneyOut30 || 0), tone: "#f8971f" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                  <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>{stat.label}</div>
                  <div className="mt-2 text-2xl font-bold" style={{ color: stat.tone }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <section className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Accounts</div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {[data?.institution?.name, data?.environment ? `Plaid ${data.environment}` : "Plaid"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {data?.summary.pendingCount ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: "rgba(248,151,31,0.12)", color: "#f8971f", border: "1px solid rgba(248,151,31,0.25)" }}>
                    {data.summary.pendingCount} pending
                  </span>
                ) : null}
              </div>
              <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {(data?.accounts || []).length === 0 ? (
                  <div className="px-4 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>No bank accounts loaded.</div>
                ) : (
                  data?.accounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => setSelectedAccountId(account.id)}
                      className="w-full px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_160px] gap-3 text-left"
                      style={{ background: selectedAccountId === account.id ? "rgba(37,99,235,0.08)" : "transparent" }}
                    >
                      <div>
                        <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{account.name}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {[account.officialName, account.subtype, account.mask ? `•••• ${account.mask}` : ""].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="md:text-right">
                        <div className="text-xs uppercase font-semibold" style={{ color: "var(--color-text-muted)" }}>Current</div>
                        <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{fmtMoney(account.currentBalance)}</div>
                      </div>
                      <div className="md:text-right">
                        <div className="text-xs uppercase font-semibold" style={{ color: "var(--color-text-muted)" }}>Available</div>
                        <div className="font-semibold" style={{ color: "#16A34A" }}>{fmtMoney(account.availableBalance)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
              <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent Transactions</div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{filteredTransactions.length} shown</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={selectedAccountId}
                    onChange={(event) => setSelectedAccountId(event.target.value)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    <option value="all">All accounts</option>
                    {(data?.accounts || []).map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search transactions"
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Date</th>
                      <th className="px-4 py-2 text-left font-semibold">Description</th>
                      <th className="px-4 py-2 text-left font-semibold">Category</th>
                      <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center" colSpan={4} style={{ color: "var(--color-text-muted)" }}>No transactions found.</td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => {
                        const amount = signedAmount(tx.amount);
                        return (
                          <tr key={tx.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>{tx.date}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{tx.name}</div>
                              {tx.pending && <div className="text-xs" style={{ color: "#f8971f" }}>Pending</div>}
                            </td>
                            <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>{tx.category.slice(0, 2).join(" · ") || "Uncategorized"}</td>
                            <td className="px-4 py-3 text-right font-semibold" style={{ color: amount.color }}>{amount.label}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
