import { readFile } from "node:fs/promises";

function loadPdfJs() {
  try {
    // Preferred for legacy CJS builds
    return require("pdfjs-dist/legacy/build/pdf.cjs");
  } catch {}
  try {
    return require("pdfjs-dist/legacy/build/pdf.js");
  } catch {}
  try {
    return require("pdfjs-dist/legacy/build/pdf");
  } catch (err) {
    throw new Error("pdfjs-dist legacy build not found. Ensure pdfjs-dist is installed.");
  }
}

const pdfjsLib = loadPdfJs();

export type PageText = { page: number; text: string };

export async function extractPdfPages(filePath: string): Promise<PageText[]> {
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
