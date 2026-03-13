"use client";

import Link from "next/link";

type Tab = "jobs" | "inbox" | "manuals" | "payments" | "gabe" | "profile";

export default function TechBottomNav({ active }: { active: Tab }) {
  const base = "flex flex-1 flex-col items-center justify-center transition-colors";
  const activeStyle = { color: "#FF6A00" };
  const inactiveStyle = { color: "var(--color-text-muted)" };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20"
      style={{
        background: "var(--color-surface-1)",
        borderTop: "1px solid var(--color-border)",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        boxShadow: "0 -10px 30px rgba(15,23,42,0.08)",
      }}
    >
      <div className="max-w-md mx-auto flex items-stretch px-2 pt-2">
        <Link href="/tech" className={`${base} min-h-[60px] rounded-2xl`} style={active === "jobs" ? activeStyle : inactiveStyle}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" /></svg>
          <span className="text-xs mt-1">Jobs</span>
        </Link>

        <Link href="/tech/inbox" className={`${base} min-h-[60px] rounded-2xl`} style={active === "inbox" ? activeStyle : inactiveStyle}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V5a2 2 0 00-2-2H6a2 2 0 00-2 2v8m16 0v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6m16 0h-3.586a1 1 0 00-.707.293l-1.414 1.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293L8.293 13.293A1 1 0 007.586 13H4" /></svg>
          <span className="text-xs mt-1">Inbox</span>
        </Link>

        <Link href="/tech/manuals" className={`${base} min-h-[60px] rounded-2xl`} style={active === "manuals" ? activeStyle : inactiveStyle}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          <span className="text-xs mt-1">Manuals</span>
        </Link>

        <Link href="/tech/payments" className={`${base} min-h-[60px] rounded-2xl`} style={active === "payments" ? activeStyle : inactiveStyle}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a5 5 0 00-10 0v2m-2 0h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zm7 4h.01" /></svg>
          <span className="text-xs mt-1">Pay</span>
        </Link>

        <Link href="/tech/profile" className={`${base} min-h-[60px] rounded-2xl`} style={active === "profile" ? activeStyle : inactiveStyle}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          <span className="text-xs mt-1">Profile</span>
        </Link>
      </div>
    </nav>
  );
}
