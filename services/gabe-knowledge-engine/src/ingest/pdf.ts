import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

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
