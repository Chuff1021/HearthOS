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
 * Two-pass: first find manuals matching brand/model, then search
 * those manuals' sections for content matching the question keywords.
 */
export async function searchManualSections(
  query: string,
  options?: { limit?: number }
): Promise<ManualSearchResult[]> {
  if (!process.env.DATABASE_URL) return [];

  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const limit = options?.limit ?? 8;
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Separate model/brand keywords from topic keywords
    // Brand/model words: used to filter which manuals to search
    // Topic words: used to find the right pages within those manuals
    const brandModelPatterns = keywords.map((k) => `%${k}%`);

    // Step 1: Find manuals that match the brand/model keywords
    const matchingManuals = await sql`
      SELECT id, brand, model, type as manual_type, url
      FROM manuals
      WHERE is_active = true
        AND (
          ${sql`LOWER(brand) LIKE ANY(${brandModelPatterns})`}
          OR ${sql`LOWER(model) LIKE ANY(${brandModelPatterns})`}
        )
      LIMIT 10
    `;

    if (matchingManuals.length === 0) {
      await sql.end();
      return [];
    }

    const manualIds = matchingManuals.map((m: any) => m.id);
    const manualMap = new Map(matchingManuals.map((m: any) => [m.id, m]));

    // Step 2: Search sections within those manuals for content keywords
    // Prioritize sections where the SNIPPET contains the topic words
    const topicPatterns = keywords
      .filter((k) => k.length >= 3) // topic words are usually longer
      .map((k) => `%${k}%`);

    let rows: any[];

    if (topicPatterns.length > 0) {
      // Search for sections where snippet matches topic keywords
      // Order by number of topic keyword matches (more = better)
      rows = await sql`
        SELECT
          ms.id as section_id,
          ms.manual_id,
          ms.page_start,
          ms.page_end,
          ms.title as section_title,
          LEFT(ms.snippet, 3000) as snippet,
          ms.tags::text as tags
        FROM manual_sections ms
        WHERE ms.manual_id = ANY(${manualIds})
          AND ${sql`LOWER(ms.snippet) LIKE ANY(${topicPatterns})`}
        ORDER BY ms.page_start ASC
        LIMIT ${limit}
      `;
    } else {
      rows = [];
    }

    // If no content matches, fall back to first few pages of matching manuals
    if (rows.length === 0) {
      rows = await sql`
        SELECT
          ms.id as section_id,
          ms.manual_id,
          ms.page_start,
          ms.page_end,
          ms.title as section_title,
          LEFT(ms.snippet, 3000) as snippet,
          ms.tags::text as tags
        FROM manual_sections ms
        WHERE ms.manual_id = ANY(${manualIds})
        ORDER BY ms.page_start ASC
        LIMIT ${limit}
      `;
    }

    await sql.end();

    return rows.map((r: any) => {
      const manual = manualMap.get(r.manual_id) || {} as any;
      return {
        sectionId: r.section_id,
        manualId: r.manual_id,
        pageStart: r.page_start,
        pageEnd: r.page_end,
        title: r.section_title,
        snippet: r.snippet,
        tags: (() => {
          try { return JSON.parse(r.tags || "[]"); } catch { return []; }
        })(),
        brand: manual.brand || "",
        model: manual.model || "",
        manualType: manual.manual_type || null,
        manualUrl: manual.url || "",
      };
    });
  } catch (e) {
    console.error("[MANUAL_SEARCH] Error:", e);
    try { await sql.end(); } catch {}
    return [];
  }
}
