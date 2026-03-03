"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { UserButton, SignedIn, SignedOut } from "@clerk/nextjs";

interface SearchResult {
  id: string;
  type: "customer" | "job" | "invoice";
  title: string;
  subtitle: string;
  href: string;
}

export default function Header() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ customers: SearchResult[]; jobs: SearchResult[]; invoices: SearchResult[] }>({
    customers: [],
    jobs: [],
    invoices: [],
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const saved = localStorage.getItem("theme");
    const initialTheme = saved === "dark" ? "dark" : "light";
    setTheme(initialTheme);
    root.setAttribute("data-theme", initialTheme);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    root.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
  }

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults({ customers: [], jobs: [], invoices: [] });
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setIsOpen(true);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalResults = results.customers.length + results.jobs.length + results.invoices.length;

  return (
    <header
      className="flex items-center gap-4 px-6 py-3 flex-shrink-0"
      style={{
        background: "var(--color-surface-1)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Search */}
      <div className="flex-1 max-w-sm relative">
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
              e.currentTarget.style.borderColor = "rgba(29,78,216,0.5)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,78,216,0.1)";
              if (query.length >= 2) setIsOpen(true);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
        {/* Search Dropdown */}
        {isOpen && (
          <div
            ref={searchRef}
            className="absolute top-full left-0 right-0 mt-2 rounded-lg shadow-xl border overflow-hidden z-50"
            style={{
              background: "var(--color-surface-1)",
              borderColor: "var(--color-border)",
            }}
          >
            {isLoading ? (
              <div className="p-4 text-center" style={{ color: "var(--color-text-muted)" }}>
                Searching...
              </div>
            ) : totalResults === 0 ? (
              <div className="p-4 text-center" style={{ color: "var(--color-text-muted)" }}>
                No results found for &quot;{query}&quot;
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {results.customers.length > 0 && (
                  <div>
                    <div
                      className="px-4 py-2 text-xs font-medium uppercase"
                      style={{ color: "var(--color-text-muted)", background: "var(--color-surface-3)" }}
                    >
                      Customers
                    </div>
                    {results.customers.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 transition-colors"
                        style={{ color: "var(--color-text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-3)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => setIsOpen(false)}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: "rgba(37,99,235,0.2)", color: "#2563EB" }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.title}</div>
                          <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                            {item.subtitle}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {results.jobs.length > 0 && (
                  <div>
                    <div
                      className="px-4 py-2 text-xs font-medium uppercase"
                      style={{ color: "var(--color-text-muted)", background: "var(--color-surface-3)" }}
                    >
                      Jobs
                    </div>
                    {results.jobs.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 transition-colors"
                        style={{ color: "var(--color-text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-3)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => setIsOpen(false)}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: "rgba(29,78,216,0.2)", color: "#2563EB" }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                            <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.title}</div>
                          <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                            {item.subtitle}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {results.invoices.length > 0 && (
                  <div>
                    <div
                      className="px-4 py-2 text-xs font-medium uppercase"
                      style={{ color: "var(--color-text-muted)", background: "var(--color-surface-3)" }}
                    >
                      Invoices
                    </div>
                    {results.invoices.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 transition-colors"
                        style={{ color: "var(--color-text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-3)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => setIsOpen(false)}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: "rgba(152,205,0,0.2)", color: "#98CD00" }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.title}</div>
                          <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                            {item.subtitle}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* QuickBooks sync status */}
        <Link
          href="/integrations/quickbooks"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "rgba(152,205,0,0.1)",
            border: "1px solid rgba(152,205,0,0.2)",
            color: "#98CD00",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(152,205,0,0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(152,205,0,0.1)";
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

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors text-xs font-medium"
          style={{
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface-3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-hover)";
            e.currentTarget.style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
          aria-label="Toggle dark mode"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span>{theme === "dark" ? "☀️" : "🌙"}</span>
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
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
              background: "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))",
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
