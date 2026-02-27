import { readFile } from "node:fs/promises";

type PdfJsModule = { getDocument: (opts: { data: Uint8Array }) => { promise: Promise<any> } };

async function loadPdfJs(): Promise<PdfJsModule> {
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return mod as unknown as PdfJsModule;
  } catch {}
  try {
    // Fallback for CJS legacy builds
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("pdfjs-dist/legacy/build/pdf.cjs") as PdfJsModule;
  } catch {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("pdfjs-dist/legacy/build/pdf.js") as PdfJsModule;
  } catch {}
  throw new Error("pdfjs-dist legacy build not found. Ensure pdfjs-dist is installed.");
}

export type PageText = { page: number; text: string };

export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const pdfjsLib = await loadPdfJs();
  const data = await readFile(filePath);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: PageText[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    const text = strings.join(" ").replace(/\s+/g, " ").trim();
    if (text) pages.push({ page: pageNum, text });
  }

  return pages;
}
