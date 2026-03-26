import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

export const maxDuration = 300; // 5 min timeout for large PDFs

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database configured" }, { status: 500 });
  }

  const { manualId } = await request.json();
  if (!manualId) {
    return NextResponse.json({ error: "manualId is required" }, { status: 400 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Get manual info
    const manuals = await sql`SELECT id, brand, model, type, url FROM manuals WHERE id = ${manualId} AND is_active = true LIMIT 1`;
    if (manuals.length === 0) {
      await sql.end();
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }
    const manual = manuals[0];

    // Fetch the PDF
    const pdfRes = await fetch(manual.url, { signal: AbortSignal.timeout(30000) });
    if (!pdfRes.ok) {
      await sql.end();
      return NextResponse.json({ error: `Failed to fetch PDF: ${pdfRes.status}` }, { status: 502 });
    }

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // Parse PDF with pdf-parse
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;

    // pdf-parse gives us the full text but we need per-page text
    // Use the pagerender callback to capture text per page
    const pages: Map<number, string> = new Map();

    await pdfParse(pdfBuffer, {
      pagerender: async (pageData: any) => {
        const textContent = await pageData.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        pages.set(pageData.pageIndex + 1, pageText);
        return pageText;
      },
    });

    // Delete existing sections for this manual (re-ingest support)
    await sql`DELETE FROM manual_sections WHERE manual_id = ${manualId}`;

    let ingested = 0;
    const nvidiaKey = process.env.NVIDIA_API_KEY;

    for (const [pageNum, text] of Array.from(pages.entries()).sort((a, b) => a[0] - b[0])) {
      let finalContent = text;
      let tags: string[] = ["text"];

      // If page has very little text (<100 chars), it's likely a diagram page
      // Try NVIDIA vision model if available
      if (text.length < 100 && nvidiaKey) {
        tags = ["diagram", "low-text"];
        // For diagram pages, note that text extraction was limited
        if (text.trim()) {
          finalContent = `[Page text]: ${text}\n[Note: This page appears to contain a diagram or image. Text extraction may be incomplete.]`;
        } else {
          finalContent = "[This page contains a diagram or image with no extractable text. Vision processing needed for full content.]";
        }
      }

      if (!finalContent.trim()) continue;

      await sql`
        INSERT INTO manual_sections (id, manual_id, page_start, page_end, title, snippet, tags)
        VALUES (
          gen_random_uuid(),
          ${manualId},
          ${pageNum},
          ${pageNum},
          ${`Page ${pageNum}`},
          ${finalContent.slice(0, 10000)},
          ${JSON.stringify(tags)}::jsonb
        )
      `;
      ingested++;
    }

    await sql.end();

    return NextResponse.json({
      success: true,
      manualId,
      brand: manual.brand,
      model: manual.model,
      totalPages: pages.size,
      pagesIngested: ingested,
    });
  } catch (err) {
    try { await sql.end(); } catch {}
    console.error("[INGEST-BULK] Error:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Ingestion failed",
    }, { status: 500 });
  }
}
