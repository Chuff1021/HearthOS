import { env, allowlistDomains } from "../config";
import { fetch } from "undici";

export type BraveResult = {
  title: string;
  url: string;
  description?: string;
};

export async function braveSearch(query: string, count = 5) {
  if (!env.BRAVE_API_KEY) throw new Error("BRAVE_API_KEY not set");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("source", "web");

  const res = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": env.BRAVE_API_KEY
    }
  });
  if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
  const data = await res.json() as any;

  const results: BraveResult[] = (data.web?.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    description: r.description
  }));

  return results.filter((r) => allowlistDomains.some((d: string) => r.url.includes(d)));
}
