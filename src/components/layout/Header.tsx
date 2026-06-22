"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import {
  Bell,
  CircleHelp,
  Command,
  Moon,
  RefreshCw,
  Search,
  Settings,
  SunMedium,
  UserRound,
  Zap,
} from "lucide-react";
import { StatusPill } from "@/components/ui/liquid";

interface SearchResult {
  id: string;
  type: "customer" | "job" | "invoice";
  title: string;
  subtitle: string;
  href: string;
}

type QuickBooksStatus = {
  connected?: boolean;
  companyName?: string | null;
};

type DispatchStatus = {
  stats?: {
    activeTechs?: number;
    onJob?: number;
  };
};

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
  const [qb, setQb] = useState<QuickBooksStatus | null>(null);
  const [dispatch, setDispatch] = useState<DispatchStatus | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const saved = localStorage.getItem("theme");
    const initialTheme = saved === "dark" ? "dark" : "light";
    setTheme(initialTheme);
    root.setAttribute("data-theme", initialTheme);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const [qbRes, dispatchRes] = await Promise.all([
          fetch("/api/quickbooks/status", { cache: "no-store" }),
          fetch("/api/dispatch?activeOnly=true", { cache: "no-store" }),
        ]);
        const [qbJson, dispatchJson] = await Promise.all([
          qbRes.ok ? qbRes.json() : null,
          dispatchRes.ok ? dispatchRes.json() : null,
        ]);
        if (!cancelled) {
          setQb(qbJson);
          setDispatch(dispatchJson);
        }
      } catch {
        if (!cancelled) {
          setQb(null);
          setDispatch(null);
        }
      }
    }

    loadStatus();
    const timer = setInterval(loadStatus, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    root.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
  }

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
  const activeTechs = dispatch?.stats?.activeTechs ?? 0;
  const onJob = dispatch?.stats?.onJob ?? 0;
  const qbConnected = qb?.connected ?? false;

  return (
    <header className="shrink-0 px-3 pb-2 pt-3 lg:px-5 lg:pt-4">
      <div
        className="flex min-w-0 items-center gap-2 rounded-[1.65rem] px-3 py-3 sm:gap-4 sm:px-4"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.84), rgba(255,255,255,0.56))",
          border: "1px solid rgba(255,255,255,0.82)",
          boxShadow: "var(--shadow-subtle)",
          backdropFilter: "blur(28px) saturate(1.5)",
          WebkitBackdropFilter: "blur(28px) saturate(1.5)",
        }}
      >
        <div ref={searchRef} className="relative min-w-0 flex-1 max-w-xl">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text"
            placeholder="Search customers, jobs, invoices..."
            className="shell-input h-11 w-full rounded-2xl pl-10 pr-3 text-sm sm:h-12 sm:pl-11 sm:pr-16"
            value={query}
            onFocus={() => {
              if (query.length >= 2) setIsOpen(true);
            }}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-xl px-2 py-1 text-[11px] sm:flex"
            style={{
              color: "var(--color-text-muted)",
              background: "rgba(255,255,255,0.68)",
              border: "1px solid rgba(255,255,255,0.8)",
            }}
          >
            <Command size={12} /> K
          </kbd>

          {isOpen && (
            <div
              className="liquid-panel absolute left-0 right-0 top-full z-50 mt-3 max-h-[420px] overflow-hidden rounded-3xl"
              style={{ boxShadow: "var(--shadow-elevated)" }}
            >
              {isLoading ? (
                <div className="p-5 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Searching...
                </div>
              ) : totalResults === 0 ? (
                <div className="p-5 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No results found for &quot;{query}&quot;
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto p-2">
                  <SearchGroup label="Customers" items={results.customers} onPick={() => setIsOpen(false)} />
                  <SearchGroup label="Jobs" items={results.jobs} onPick={() => setIsOpen(false)} />
                  <SearchGroup label="Invoices" items={results.invoices} onPick={() => setIsOpen(false)} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          <Link href="/integrations/quickbooks">
            <StatusPill tone={qbConnected ? "success" : "warning"}>
              {qbConnected ? "QB Synced" : "QB Attention"}
            </StatusPill>
          </Link>
          <Link href="/dispatch">
            <StatusPill tone="success">
              {activeTechs} techs active{onJob ? ` · ${onJob} on job` : ""}
            </StatusPill>
          </Link>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <IconButton label="Notifications">
            <Bell size={17} />
            <span
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
              style={{ background: "var(--color-ember)" }}
            >
              7
            </span>
          </IconButton>
          <span className="hidden sm:inline-flex">
          <IconButton label="Help">
            <CircleHelp size={17} />
          </IconButton>
          </span>
          <button
            onClick={toggleTheme}
            className="relative hidden h-10 w-10 items-center justify-center rounded-2xl sm:flex"
            style={{
              color: "var(--color-text-secondary)",
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.78)",
            }}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunMedium size={17} /> : <Moon size={17} />}
          </button>
          <Link href="/settings" className="hidden sm:block">
            <IconButton label="Settings">
              <Settings size={17} />
            </IconButton>
          </Link>

          <div className="mx-1 hidden h-8 w-px bg-slate-200/80 sm:block" />

          <SignedIn>
            <div
              className="rounded-2xl p-1"
              style={{
                background: "rgba(255,255,255,0.62)",
                border: "1px solid rgba(255,255,255,0.76)",
              }}
            >
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-9 w-9",
                  },
                }}
              />
            </div>
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className="flex h-10 w-10 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white sm:w-auto sm:px-4"
              style={{ background: "linear-gradient(135deg, var(--color-ember), var(--color-ember-dark))" }}
            >
              <UserRound size={16} /> <span className="hidden sm:inline">Sign In</span>
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}

function IconButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      className="relative flex h-10 w-10 items-center justify-center rounded-2xl"
      style={{
        color: "var(--color-text-secondary)",
        background: "rgba(255,255,255,0.6)",
        border: "1px solid rgba(255,255,255,0.78)",
      }}
      aria-label={label}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function SearchGroup({
  label,
  items,
  onPick,
}: {
  label: string;
  items: SearchResult[];
  onPick: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      {items.map((item) => (
        <Link
          key={`${item.type}-${item.id}`}
          href={item.href}
          className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-white/60"
          onClick={onPick}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              color: item.type === "invoice" ? "var(--color-success)" : item.type === "job" ? "var(--color-info)" : "var(--color-ember)",
              background: "rgba(255,255,255,0.68)",
              border: "1px solid rgba(255,255,255,0.78)",
            }}
          >
            {item.type === "invoice" ? <ReceiptIcon /> : item.type === "job" ? <Zap size={16} /> : <UserRound size={16} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {item.title}
            </span>
            <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
              {item.subtitle}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function ReceiptIcon() {
  return <Zap size={16} />;
}
