import postgres from "postgres";

export interface ManualSearchResult {
  sectionId: string;
  manualId: string;
  pageStart: number;
  pageEnd: number | null;
  title: string | null;
  snippet: string;
  tags: string[];
  brand: string;
  model: string;
  manualType: string | null;
  manualUrl: string;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "what", "how", "do", "does",
  "for", "of", "to", "in", "on", "and", "or", "i", "my", "me", "this", "that",
  "can", "you", "it", "its", "with", "from", "at", "by", "be", "has", "have",
  "need", "want", "tell", "show", "give", "get", "find", "where", "which",
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\.\/]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Search manual sections for content relevant to a query.
 * Returns matches with manual metadata for building citations.
 */
export async function searchManualSections(
  query: string,
  options?: { limit?: number }
): Promise<ManualSearchResult[]> {
  if (!process.env.DATABASE_URL) return [];

  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const limit = options?.limit ?? 5;
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Build a single search pattern from keywords
    // Search for any keyword in snippet, brand, or model
    const pattern = keywords.map((k) => `%${k}%`);

    // Query: find sections where snippet or manual brand/model matches any keyword
    // Order by number of keyword matches (approximated by checking each)
    const rows = await sql`
      SELECT
        ms.id as section_id,
        ms.manual_id,
        ms.page_start,
        ms.page_end,
        ms.title as section_title,
        LEFT(ms.snippet, 3000) as snippet,
        ms.tags::text as tags,
        m.brand,
        m.model,
        m.type as manual_type,
        m.url
      FROM manual_sections ms
      JOIN manuals m ON m.id = ms.manual_id
      WHERE m.is_active = true
        AND (
          ${sql`LOWER(ms.snippet) LIKE ANY(${pattern})`}
          OR ${sql`LOWER(m.brand) LIKE ANY(${pattern})`}
          OR ${sql`LOWER(m.model) LIKE ANY(${pattern})`}
        )
      ORDER BY ms.page_start ASC
      LIMIT ${limit}
    `;

    await sql.end();

    return (rows as any[]).map((r) => ({
      sectionId: r.section_id,
      manualId: r.manual_id,
      pageStart: r.page_start,
      pageEnd: r.page_end,
      title: r.section_title,
      snippet: r.snippet,
      tags: (() => {
        try { return JSON.parse(r.tags || "[]"); } catch { return []; }
      })(),
      brand: r.brand,
      model: r.model,
      manualType: r.manual_type,
      manualUrl: r.url,
    }));
  } catch (e) {
    console.error("[MANUAL_SEARCH] Error:", e);
    try { await sql.end(); } catch {}
    return [];
  }
}
