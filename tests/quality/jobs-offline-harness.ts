import { build } from "esbuild";
import vm from "node:vm";
import path from "node:path";

type Node = { type: string; props: Record<string, any> };
type ResponseHandler = (url: string, init: RequestInit) => Response | Promise<Response>;
const bundles = new Map<string, string>();

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Exercise real page handlers/effects without importing auth, providers, stores, or a DOM.
export async function pageHarness(page: "jobs" | "schedule", params = "", handler?: ResponseHandler, options: { viewportWidth?: number; date?: DateConstructor; initialScrollTop?: number } = {}) {
  if (!bundles.has(page)) {
    const result = await build({
      entryPoints: [path.resolve(`src/app/${page}/page.tsx`)], bundle: true, write: false,
      format: "cjs", platform: "node", jsx: "automatic",
      plugins: [{ name: "offline-boundary", setup(builder) {
        builder.onResolve({ filter: /^(react(?:\/jsx-runtime)?|next\/navigation|lucide-react|@\/components\/(?:layout|meeks)\/.*)$/ }, (args) => ({ path: args.path, namespace: "offline" }));
        builder.onLoad({ filter: /.*/, namespace: "offline" }, (args) => ({ contents:
          args.path === "react" ? "module.exports = globalThis.hooks" :
          args.path === "react/jsx-runtime" ? "module.exports = globalThis.jsxRuntime" :
          args.path === "next/navigation" ? "exports.useSearchParams = () => globalThis.params" :
          args.path === "lucide-react" ? "exports.RefreshCw = exports.ChevronLeft = exports.ChevronRight = exports.X = () => null" :
          "module.exports = () => null", loader: "js" }));
      } }],
    });
    bundles.set(page, result.outputFiles[0].text);
  }
  const states: any[] = [];
  const effects: Array<{ deps?: unknown[]; cleanup?: () => void }> = [];
  const memos: Array<{ deps?: unknown[]; value: any }> = [];
  let cursor = 0;
  let dirty = true;
  let pending: Array<() => void> = [];
  let tree: any;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const scrollContainer = { scrollTop: options.initialScrollTop || 0 };
  const mediaListeners = new Set<() => void>();
  const desktopMedia = {
    matches: (options.viewportWidth ?? 1440) >= 1024,
    addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
  };
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], (value: any) => {
        const next = typeof value === "function" ? value(states[i]) : value;
        if (!Object.is(next, states[i])) { states[i] = next; dirty = true; }
      }];
    },
    useRef(initial: any) {
      const i = cursor++;
      if (!(i in states)) states[i] = { current: initial };
      return states[i];
    },
    useMemo(fn: () => any, deps: unknown[]) {
      const i = cursor++;
      if (!memos[i] || changed(memos[i].deps, deps)) memos[i] = { deps, value: fn() };
      return memos[i].value;
    },
    useCallback(fn: () => any, deps: unknown[]) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++;
      if (!effects[i] || changed(effects[i].deps, deps)) {
        pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() || undefined }; });
      }
    },
  };
  const jsx = (type: any, props: any) => {
    if (typeof type === "function") return type(props);
    if (type === "div" && props.ref) props.ref.current = scrollContainer;
    return { type, props };
  };
  const context = vm.createContext({
    module: { exports: {} }, hooks, jsxRuntime: { jsx, jsxs: jsx, Fragment: "fragment" },
    params: new URLSearchParams(params), AbortController, URLSearchParams, Date: options.date || Date, console,
    setTimeout, clearTimeout, confirm: () => true, window: { confirm: () => true, matchMedia: () => desktopMedia },
    fetch: async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (handler) return handler(url, init);
      throw new Error(`Unexpected offline request: ${url}`);
    },
  });
  vm.runInContext(bundles.get(page)!, context);
  const Page = (context.module.exports as any).default;
  const render = () => {
    let iterations = 0;
    while (dirty) {
      if (++iterations > 80) throw new Error("Render loop detected");
      dirty = false;
      cursor = 0;
      tree = Page();
      const next = pending; pending = [];
      next.forEach((effect) => effect());
    }
  };
  const settle = async () => {
    for (let i = 0; i < 12; i++) { render(); await new Promise<void>((resolve) => setImmediate(resolve)); }
    render();
  };
  const nodes = () => {
    const found: Node[] = [];
    const visit = (value: any) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") { found.push(value); visit(value.props?.children); }
    };
    visit(tree); return found;
  };
  const text = (value: any): string => {
    if (Array.isArray(value)) return value.map(text).join(" ");
    if (value && typeof value === "object") return text(value.props?.children ?? null);
    return value === null || value === undefined || typeof value === "boolean" ? "" : String(value);
  };
  const find = (type: string, label: string) => {
    const node = nodes().find((node) => node.type === type && (node.props["aria-label"] === label || text(node).trim().replace(/\s+/g, " ") === label));
    if (!node) throw new Error(`Missing ${type}: ${label}`);
    return node;
  };
  render();
  return { calls, settle, nodes, text: (value: any = tree) => text(value), find, scrollContainer,
    setViewport(width: number) {
      const matches = width >= 1024;
      if (matches !== desktopMedia.matches) {
        desktopMedia.matches = matches;
        mediaListeners.forEach((listener) => listener());
      }
    },
    mediaListenerCount: () => mediaListeners.size,
    navigate(query: string) { context.params = new URLSearchParams(query); dirty = true; },
    async click(label: string) { await find("button", label).props.onClick({ stopPropagation() {} }); await settle(); },
    async change(type: string, label: string, value: string) { find(type, label).props.onChange({ target: { value } }); await settle(); },
    unmount() { effects.forEach((effect) => effect?.cleanup?.()); },
  };
}
