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
 * Search manual sections by scoring how many query keywords appear
 * in the snippet, brand, AND model combined. This finds the right
 * pages regardless of how the manual is named in the database.
 */
export async function searchManualSections(
  query: string,
  options?: { limit?: number }
): Promise<ManualSearchResult[]> {
  if (!process.env.DATABASE_URL) return [];

  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const limit = options?.limit ?? 6;
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    const patterns = keywords.map((k) => `%${k}%`);

    // Score each section by how many keywords match across snippet + brand + model
    // Bonus: keywords found in the SNIPPET are worth more than brand/model matches
    const scoreTerms = patterns.map((p) =>
      sql`CASE WHEN LOWER(ms.snippet) LIKE ${p} THEN 2 WHEN LOWER(m.brand) LIKE ${p} OR LOWER(m.model) LIKE ${p} THEN 1 ELSE 0 END`
    );
    const scoreExpr = scoreTerms.reduce((acc, term) => sql`${acc} + ${term}`);

    // At least one keyword must match somewhere
    const matchConditions = patterns.map((p) =>
      sql`LOWER(ms.snippet) LIKE ${p} OR LOWER(m.brand) LIKE ${p} OR LOWER(m.model) LIKE ${p}`
    );
    const matchCombined = matchConditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);

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
        m.url,
        (${scoreExpr}) as keyword_score,
        LENGTH(ms.snippet) as snippet_len
      FROM manual_sections ms
      JOIN manuals m ON m.id = ms.manual_id
      WHERE m.is_active = true
        AND (${matchCombined})
        AND (${scoreExpr}) >= 3
      ORDER BY keyword_score DESC, snippet_len DESC
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
