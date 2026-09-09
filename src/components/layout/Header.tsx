"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Moon, Receipt, RefreshCw, Search, Settings, SunMedium, UserRound, X, Zap } from "lucide-react";
import { UNKNOWN_DISPLAY_IDENTITY, useAuthenticatedDisplayIdentity, type DisplayIdentity } from "./header-identity";
import {
  createHeaderSearch, emptySearchState, parseDispatchStatus, parseQuickBooksStatus, readHeaderJson,
  type HeaderSearchResult,
} from "./header-search";

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = () => document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
const serverTheme = () => "light" as const;

function useHeaderStatus<T>(url: string, parse: (value: unknown) => T) {
  const [state, setState] = useState<{ loading: boolean; data: T | null }>({ loading: true, data: null });
  useEffect(() => {
    let revision = 0;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      const request = ++revision;
      controller?.abort();
      clearTimeout(timeout);
      const abort = new AbortController();
      controller = abort;
      timeout = setTimeout(() => {
        if (request !== revision) return;
        revision += 1;
        abort.abort();
        setState({ loading: false, data: null });
      }, 15000);
      try {
        const response = await fetch(url, { cache: "no-store", signal: abort.signal });
        const data = parse(await readHeaderJson(response));
        if (request === revision) setState({ loading: false, data });
      } catch {
        if (request === revision) setState({ loading: false, data: null });
      } finally {
        if (request === revision) clearTimeout(timeout);
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 60000);
    return () => { revision += 1; controller?.abort(); clearTimeout(timeout); clearInterval(interval); };
  }, [url, parse]);
  return state;
}

export default function Header() {
  const pathname = usePathname();
  // The root layout intentionally omits ClerkProvider when auth is unconfigured.
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? <AuthenticatedHeader key={pathname} />
    : <HeaderContent key={pathname} identity={UNKNOWN_DISPLAY_IDENTITY} />;
}

function AuthenticatedHeader() {
  const identity = useAuthenticatedDisplayIdentity();
  return <HeaderContent key={identity.userId || "anonymous"} identity={identity} />;
}

function HeaderContent({ identity }: { identity: DisplayIdentity }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(emptySearchState);
  const [searchController] = useState(() => createHeaderSearch(setSearch));
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  const qb = useHeaderStatus("/api/quickbooks/status", parseQuickBooksStatus);
  const dispatch = useHeaderStatus("/api/dispatch?activeOnly=true", parseDispatchStatus);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupId = useId();
  const isOpen = search.status !== "idle";

  useEffect(() => {
    const root = document.documentElement;
    try {
      const initialTheme = localStorage.getItem("theme") === "dark" ? "dark" : "light";
      root.setAttribute("data-theme", initialTheme);
    } catch { /* Storage may be disabled; keep the default theme usable. */ }
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) searchController.dismiss();
    }
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const input = inputRef.current;
        if (!input) return;
        if (document.activeElement === input) searchController.search(input.value);
        input.focus();
        input.select();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleShortcut);
    return () => {
      searchController.dispose();
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleShortcut);
    };
  }, [searchController]);

  function dismissSearch() {
    // Focus may start an intentional new search; invalidate it before returning.
    inputRef.current?.focus();
    searchController.dismiss();
  }

  function handleSearchKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissSearch();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(searchRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-search-result]") || []);
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === "ArrowDown" ? (current + 1) % links.length : (current <= 0 ? links.length : current) - 1;
    links[next].focus();
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    try { localStorage.setItem("theme", nextTheme); } catch { /* Theme still works without persistence. */ }
  }

  const totalResults = search.results.customers.length + search.results.jobs.length + search.results.invoices.length;
  const qbLabel = qb.loading ? "QB Checking..." : qb.data === null ? "QB Unavailable" : qb.data ? "QB Connected" : "QB Attention";
  const accountLabel = identity.isSignedIn ? `Account settings for ${identity.name}` : "Account settings";
  const iconClass = "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-white/80 text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";

  return (
    <header className="relative z-40 shrink-0 px-3 pb-2 pt-3 lg:px-5 lg:pt-4">
      <div
        className="glass-shell glass-toolbar flex min-w-0 items-center gap-2 rounded-[1.65rem] px-3 py-2 sm:gap-4 sm:px-4"
        style={{
          overflow: "visible",
          background: "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(255,249,244,0.82))",
          border: "1px solid rgba(255,255,255,0.96)",
          boxShadow: "0 18px 52px rgba(39,55,82,0.1), inset 0 1px 0 rgba(255,255,255,0.98)",
          backdropFilter: "blur(24px) saturate(1.16)",
          WebkitBackdropFilter: "blur(24px) saturate(1.16)",
        }}
      >
        <div
          ref={searchRef} className="relative min-w-0 max-w-xl flex-1" style={{ zIndex: 2 }}
          onKeyDown={handleSearchKey}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) searchController.dismiss(); }}
        >
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
          <input
            ref={inputRef} type="text" role="combobox" aria-label="Search customers, jobs, and invoices"
            aria-expanded={isOpen} aria-controls={isOpen ? popupId : undefined} aria-haspopup="dialog" aria-autocomplete="none"
            aria-keyshortcuts="Meta+K Control+K" autoComplete="off"
            placeholder="Search customers, jobs, invoices..."
            className="shell-input h-11 w-full min-w-0 rounded-2xl pl-9 pr-2 text-sm focus-visible:outline-2 focus-visible:outline-orange-500 sm:h-12 sm:pr-24"
            value={query}
            onFocus={() => searchController.search(query)}
            onChange={(event) => { setQuery(event.target.value); searchController.search(event.target.value); }}
          />
          <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-lg border border-orange-100 bg-white/80 px-2 py-1 text-[10px] text-gray-500 sm:block">Cmd/Ctrl K</kbd>

          {isOpen && (
            <div id={popupId} role="dialog" aria-label="Search results"
              className="liquid-panel absolute left-0 top-full z-50 mt-3 w-[min(36rem,calc(100vw-4.5rem))] max-w-none overflow-hidden rounded-lg sm:w-full"
              style={{ position: "absolute", borderRadius: 8, boxShadow: "var(--shadow-elevated)" }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-orange-100 px-3 py-1">
                <span role="status" aria-live="polite" className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {search.status === "loading" ? "Searching..." : search.status === "error" ? "Search unavailable" : `${totalResults} ${totalResults === 1 ? "result" : "results"}`}
                </span>
                <button type="button" className={iconClass} onClick={dismissSearch} aria-label="Dismiss search" title="Dismiss search"><X size={16} aria-hidden="true" /></button>
              </div>
              {search.status === "error" ? (
                <div className="flex flex-wrap items-center gap-3 p-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  <p role="alert" className="min-w-0 flex-1">Unable to load search results. Please try again.</p>
                  <button type="button" className={iconClass} onClick={() => searchController.search(query)} aria-label="Retry search" title="Retry search"><RefreshCw size={16} aria-hidden="true" /></button>
                </div>
              ) : search.status === "ready" && totalResults === 0 ? (
                <p className="break-words p-5 text-sm" style={{ color: "var(--color-text-muted)" }}>No results found for &quot;{query.trim()}&quot;</p>
              ) : search.status === "ready" ? (
                <div className="max-h-[min(420px,60dvh)] overflow-y-auto p-2">
                  <SearchGroup label="Customers" items={search.results.customers} onPick={() => searchController.dismiss()} />
                  <SearchGroup label="Jobs" items={search.results.jobs} onPick={() => searchController.dismiss()} />
                  <SearchGroup label="Invoices" items={search.results.invoices} onPick={() => searchController.dismiss()} />
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="hidden items-center gap-2 xl:flex" aria-live="polite">
          <Link href="/integrations/quickbooks" className="rounded-full focus-visible:outline-2 focus-visible:outline-orange-500">
            <HeaderStatusPill tone={qb.data === true ? "success" : qb.loading ? "neutral" : "warning"}>{qbLabel}</HeaderStatusPill>
          </Link>
          <Link href="/dispatch" className="rounded-full focus-visible:outline-2 focus-visible:outline-orange-500">
            <HeaderStatusPill tone={dispatch.data === null ? "neutral" : "success"}>
              {dispatch.loading ? "Techs Checking..." : dispatch.data === null ? "Active techs unknown" : `${dispatch.data.activeTechs} techs active${dispatch.data.onJob ? ` · ${dispatch.data.onJob} on job` : ""}`}
            </HeaderStatusPill>
          </Link>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <button type="button" onClick={toggleTheme} className={`${iconClass} hidden sm:flex`}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >{theme === "dark" ? <SunMedium size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}</button>
          <Link href="/settings" className={`${iconClass} hidden sm:flex`} aria-label="Settings" title="Settings"><Settings size={17} aria-hidden="true" /></Link>
          <div className="mx-1 hidden h-8 w-px bg-orange-100 sm:block" />
          <Link href="/settings" aria-label={accountLabel} title={accountLabel}
            className="flex h-10 max-w-48 items-center gap-2 rounded-2xl border border-orange-100 bg-white/80 p-1 text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 md:pr-3"
          >
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-ember), #ff9b45)" }}>
              {identity.initials || <UserRound size={16} />}
            </span>
            <span className="hidden min-w-0 leading-tight md:block">
              <span className="block truncate text-xs font-semibold">{identity.name}</span>
              <span className="block text-[10px] text-gray-500">Account</span>
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeaderStatusPill({ tone, children }: { tone: "success" | "warning" | "neutral"; children: ReactNode }) {
  const dot = tone === "success" ? "var(--color-success)" : tone === "warning" ? "var(--color-warning)" : "var(--color-text-muted)";
  return <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
    style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />{children}
  </span>;
}

function SearchGroup({ label, items, onPick }: { label: string; items: HeaderSearchResult[]; onPick: () => void }) {
  if (!items.length) return null;
  return (
    <section aria-label={label} className="py-1">
      <h2 className="px-3 py-2 font-semibold uppercase" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{label}</h2>
      {items.map((item) => (
        <Link key={`${item.type}-${item.id}`} href={item.href} data-search-result
          className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-black/5 focus-visible:bg-black/5 focus-visible:outline-2 focus-visible:outline-orange-500" onClick={onPick}
        >
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-white/70"
            style={{ color: item.type === "invoice" ? "var(--color-success)" : item.type === "job" ? "var(--color-info)" : "var(--color-ember)" }}
          >{item.type === "invoice" ? <Receipt size={16} /> : item.type === "job" ? <Zap size={16} /> : <UserRound size={16} />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{item.title}</span>
            <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>{item.subtitle}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
