export interface HeaderSearchResult {
  id: string;
  type: "customer" | "job" | "invoice";
  title: string;
  subtitle: string;
  href: string;
}

export type HeaderSearchResults = { customers: HeaderSearchResult[]; jobs: HeaderSearchResult[]; invoices: HeaderSearchResult[] };
export type HeaderSearchState = {
  status: "idle" | "loading" | "ready" | "error";
  results: HeaderSearchResults;
};
const emptyResults = (): HeaderSearchResults => ({ customers: [], jobs: [], invoices: [] });
export const emptySearchState = (): HeaderSearchState => ({ status: "idle", results: emptyResults() });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSearchResults(value: unknown): HeaderSearchResults {
  if (!isRecord(value)) throw new Error("Invalid search response");
  const results = emptyResults();
  const types = { customers: "customer", jobs: "job", invoices: "invoice" } as const;
  for (const group of Object.keys(types) as Array<keyof HeaderSearchResults>) {
    const items = value[group];
    if (!Array.isArray(items)) throw new Error("Invalid search group");
    results[group] = items.map((item) => {
      if (!isRecord(item) || item.type !== types[group]
        || typeof item.id !== "string" || !item.id
        || typeof item.title !== "string" || !item.title.trim()
        || typeof item.subtitle !== "string" || typeof item.href !== "string") {
        throw new Error("Invalid search result");
      }
      // Customer profiles use the local ID, not the QuickBooks customer ID.
      const url = new URL(item.href, "https://header.invalid");
      const customerPath = /^\/customers\/([^/?#]+)$/.exec(item.href);
      const localId = customerPath ? decodeURIComponent(customerPath[1]) : "";
      const validRoute = group === "customers"
        ? Boolean(customerPath && /^[a-zA-Z0-9_-]+$/.test(localId) && localId === item.id)
        : item.href.startsWith(`/${group}?`) && url.pathname === `/${group}` && Boolean(url.searchParams.get("id")?.trim());
      if (!validRoute || url.origin !== "https://header.invalid" || /[\x00-\x20\\]/.test(item.href)) {
        throw new Error("Invalid search destination");
      }
      return { id: item.id, type: types[group], title: item.title, subtitle: item.subtitle, href: item.href };
    });
  }
  return results;
}

export async function readHeaderJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error("Header request failed");
  return response.json();
}

export function parseQuickBooksStatus(value: unknown): boolean {
  if (!isRecord(value) || typeof value.connected !== "boolean") throw new Error("Invalid QuickBooks status");
  return value.connected;
}

export function parseDispatchStatus(value: unknown): { activeTechs: number; onJob: number } {
  if (!isRecord(value) || !isRecord(value.stats)) throw new Error("Invalid dispatch status");
  const { activeTechs, onJob } = value.stats;
  if (typeof activeTechs !== "number" || !Number.isSafeInteger(activeTechs) || activeTechs < 0
    || typeof onJob !== "number" || !Number.isSafeInteger(onJob) || onJob < 0 || onJob > activeTechs) {
    throw new Error("Invalid dispatch counts");
  }
  return { activeTechs, onJob };
}

export function createHeaderSearch(
  publish: (state: HeaderSearchState) => void,
  fetcher: typeof fetch = (...args) => fetch(...args),
  debounceMs = 300,
  timeoutMs = 15000,
) {
  let revision = 0;
  let controller: AbortController | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    revision += 1;
    clearTimeout(debounce);
    clearTimeout(timeout);
    controller?.abort();
  }
  return {
    dispose: cancel,
    dismiss() { cancel(); publish(emptySearchState()); },
    search(rawQuery: string) {
      cancel();
      const query = rawQuery.trim();
      if (query.length < 2) { publish(emptySearchState()); return; }
      const request = revision;
      const abort = new AbortController();
      controller = abort;
      publish({ status: "loading", results: emptyResults() });
      debounce = setTimeout(async () => {
        timeout = setTimeout(() => {
          if (request !== revision) return;
          cancel();
          publish({ status: "error", results: emptyResults() });
        }, timeoutMs);
        try {
          const response = await fetcher(`/api/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: abort.signal });
          const results = parseSearchResults(await readHeaderJson(response));
          if (request === revision) publish({ status: "ready", results });
        } catch {
          if (request === revision) publish({ status: "error", results: emptyResults() });
        } finally {
          // An older response must not clear a newer request's timeout or state.
          if (request === revision) clearTimeout(timeout);
        }
      }, debounceMs);
    },
  };
}
