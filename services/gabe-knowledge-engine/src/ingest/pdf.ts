import { readFile } from "node:fs/promises";

type PdfJsModule = { getDocument: (opts: { data: Uint8Array }) => { promise: Promise<any> } };

async function loadPdfJs(): Promise<PdfJsModule> {
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return mod as unknown as PdfJsModule;
  } catch {}
  try {
    return require("pdfjs-dist/legacy/build/pdf.cjs") as PdfJsModule;
  } catch {}
  try {
    return require("pdfjs-dist/legacy/build/pdf.js") as PdfJsModule;
  } catch {}
  throw new Error("pdfjs-dist legacy build not found. Ensure pdfjs-dist is installed.");
}

export type PageText = { page: number; text: string };

export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const pdfjsLib = await loadPdfJs();
  const data = await readFile(filePath);
  const uint8 = new Uint8Array(data);
  const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
  const pages: PageText[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const lineBuckets = new Map<number, string[]>();
    for (const item of content.items as any[]) {
      const str = String(item?.str ?? "").trim();
      if (!str) continue;
      const y = Number(item?.transform?.[5] ?? 0);
      const key = Math.round(y * 2) / 2; // keep nearby y-coordinates on same line
      const bucket = lineBuckets.get(key) ?? [];
      bucket.push(str);
      lineBuckets.set(key, bucket);
    }

    const lines = Array.from(lineBuckets.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const text = lines.join("\n").trim();
    if (text) pages.push({ page: pageNum, text });
  }

  return pages;
}
