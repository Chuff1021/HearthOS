"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ActivityItem = {
  id: string;
  title: string;
  desc: string;
  sub: string;
  at: string;
  href: string;
  details?: Record<string, unknown>;
  iconBg: string;
  iconColor: string;
  icon: ReactNode;
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const router = useRouter();

  async function loadActivity() {
    setLoading(true);
    try {
      const [jobsRes, invoicesRes, customersRes, payRes] = await Promise.all([
        fetch("/api/jobs?limit=10", { cache: "no-store" }),
        fetch("/api/invoices", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/square/transactions?limit=10", { cache: "no-store" }),
      ]);

      const [jobsData, invData, custData, payData] = await Promise.all([
        jobsRes.json(),
        invoicesRes.json(),
        customersRes.json(),
        payRes.json(),
      ]);

      const jobs = (jobsData.jobs || []).map((j: any) => ({
        id: `job-${j.id}`,
        title: `Job ${String(j.status || "scheduled").replace("_", " ")}`,
        desc: `${j.jobNumber || j.id} · ${j.title || "Job"}`,
        sub: `${j.customerName || "Customer"} · ${timeAgo(j.updatedAt || j.createdAt || new Date().toISOString())}`,
        at: j.updatedAt || j.createdAt || new Date().toISOString(),
        href: "/jobs",
        details: j,
        iconBg: "rgba(37,99,235,0.12)",
        iconColor: "#2563EB",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2z" clipRule="evenodd" />
          </svg>
        ),
      }));

      const invoices = (invData.invoices || []).map((i: any) => ({
        id: `inv-${i.id}`,
        title: `Invoice ${i.status || "updated"}`,
        desc: `${i.invoiceNumber || i.id} · $${Number(i.totalAmount || 0).toFixed(2)}`,
        sub: `${i.customerName || "Customer"} · ${timeAgo(i.updatedAt || i.createdAt || new Date().toISOString())}`,
        at: i.updatedAt || i.createdAt || new Date().toISOString(),
        href: "/invoices",
        details: i,
        iconBg: "rgba(14,165,233,0.12)",
        iconColor: "#0EA5E9",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        ),
      }));

      const customers = (custData.customers || []).map((c: any) => ({
        id: `cust-${c.id}`,
        title: "Customer record",
        desc: `${c.displayName || c.id}`,
        sub: `${c.email || c.phone || "Profile updated"} · ${timeAgo(c.updatedAt || c.createdAt || new Date().toISOString())}`,
        at: c.updatedAt || c.createdAt || new Date().toISOString(),
        href: "/customers",
        details: c,
        iconBg: "rgba(168,85,247,0.12)",
        iconColor: "#A855F7",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6z" />
          </svg>
        ),
      }));

      const payments = (payData.payments || []).map((p: any) => ({
        id: `pay-${p.id}`,
        title: `Payment ${p.status || "pending"}`,
        desc: `${p.invoiceNumber || p.orderId || p.id} · $${Number(p.amount || 0).toFixed(2)}`,
        sub: `${p.customerName || "Square Customer"} · ${timeAgo(p.paymentDate || new Date().toISOString())}`,
        at: p.paymentDate || new Date().toISOString(),
        href: "/payments",
        details: p,
        iconBg: "rgba(34,197,94,0.12)",
        iconColor: "#22C55E",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z" clipRule="evenodd" />
          </svg>
        ),
      }));

      const merged = [...jobs, ...invoices, ...customers, ...payments]
        .sort((a, b) => +new Date(b.at) - +new Date(a.at))
        .slice(0, 20);

      setItems(merged);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActivity();
    const t = setInterval(loadActivity, 30000);
    return () => clearInterval(t);
  }, []);

  const hasData = useMemo(() => items.length > 0, [items]);

  return (
    <>
      <div className="rounded-xl overflow-hidden h-full flex flex-col" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Activity Feed</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Live updates from real data</p>
          </div>
          <button onClick={loadActivity} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Refresh</button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loading ? (
            <div className="px-5 py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading activity…</div>
          ) : !hasData ? (
            <div className="px-5 py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>No activity yet. Create jobs/customers/invoices/payments to populate this feed.</div>
          ) : (
            items.map((activity, idx) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 px-5 py-3 cursor-pointer transition-all"
                style={{ borderBottom: idx < items.length - 1 ? "1px solid var(--color-border)" : "none" }}
                onClick={() => setSelected(activity)}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: activity.iconBg, color: activity.iconColor }}>
                  {activity.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium leading-tight" style={{ color: "var(--color-text-primary)" }}>{activity.title}</div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>{activity.desc}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{activity.sub}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{selected.title}</h3>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{selected.desc}</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{new Date(selected.at).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-sm" style={{ color: "var(--color-text-muted)" }}>✕</button>
            </div>
            <div className="mt-4 rounded-lg p-3 text-xs overflow-auto max-h-64" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
              <pre>{JSON.stringify(selected.details || {}, null, 2)}</pre>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded text-sm" style={{ border: "1px solid var(--color-border)" }}>Close</button>
              <button onClick={() => router.push(selected.href)} className="px-3 py-1.5 rounded text-sm text-white" style={{ background: "#2563EB" }}>Open Page</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
