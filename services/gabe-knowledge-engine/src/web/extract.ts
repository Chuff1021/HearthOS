import { fetch } from "undici";
import { load } from "cheerio";

export async function fetchPageText(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = load(html);
  $("script,style,noscript").remove();
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { title, text };
}

export function chunkWebText(text: string, chunkSize = 800, overlap = 100) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}
