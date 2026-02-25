"use client";

import Link from "next/link";
import { UserButton, SignedIn, SignedOut } from "@clerk/nextjs";

export default function Header() {
  return (
    <header
      className="flex items-center gap-4 px-6 py-3 flex-shrink-0"
      style={{
        background: "var(--color-surface-1)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Search */}
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search customers, jobs, invoices..."
            className="w-full pl-9 pr-10 py-2 text-sm rounded-lg focus:outline-none transition-all"
            style={{
              background: "var(--color-surface-3)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(249,115,22,0.5)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(249,115,22,0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <kbd
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border"
            style={{
              color: "var(--color-text-muted)",
              background: "var(--color-surface-4)",
              borderColor: "var(--color-border)",
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* QuickBooks sync status */}
        <Link
          href="/integrations/quickbooks"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "rgba(44,160,28,0.1)",
            border: "1px solid rgba(44,160,28,0.2)",
            color: "#4ade80",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(44,160,28,0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(44,160,28,0.1)";
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot"></span>
          <span>QB Synced</span>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 opacity-60">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        </Link>

        {/* Active techs */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{
            background: "var(--color-surface-3)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot"></span>
          <span>4 techs active</span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: "var(--color-border)" }}></div>

        {/* Notifications */}
        <button
          className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-surface-3)";
            e.currentTarget.style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
          <span
            className="absolute top-0.5 right-0.5 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
            style={{ background: "var(--color-ember)" }}
          >
            7
          </span>
        </button>

        {/* Help */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-surface-3)";
            e.currentTarget.style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: "var(--color-border)" }}></div>

        {/* User / Auth */}
        <SignedIn>
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
              },
            }}
          />
        </SignedIn>
        <SignedOut>
          <Link
            href="/sign-in"
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: "linear-gradient(135deg, #f97316, #ea6c0a)",
              color: "white",
            }}
          >
            Sign In
          </Link>
        </SignedOut>
      </div>
    </header>
  );
}
