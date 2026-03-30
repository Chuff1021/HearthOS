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
    // Score by how many keywords match — more matches = more relevant manual
    const bmScoreTerms = brandModelPatterns.map((p) =>
      sql`CASE WHEN LOWER(brand) LIKE ${p} OR LOWER(model) LIKE ${p} THEN 1 ELSE 0 END`
    );
    const bmScoreExpr = bmScoreTerms.reduce((acc, term) => sql`${acc} + ${term}`);
    const bmConditions = brandModelPatterns.map((p) => sql`LOWER(brand) LIKE ${p} OR LOWER(model) LIKE ${p}`);
    const bmCombined = bmConditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);

    // First try: find manuals matching 2+ keywords (strong match)
    let matchingManuals = await sql`
      SELECT id, brand, model, type as manual_type, url, (${bmScoreExpr}) as match_score
      FROM manuals
      WHERE is_active = true
        AND (${bmCombined})
        AND (${bmScoreExpr}) >= 2
      ORDER BY match_score DESC
      LIMIT 6
    `;

    // Fallback: if no strong matches, accept single-keyword matches
    if (matchingManuals.length === 0) {
      matchingManuals = await sql`
        SELECT id, brand, model, type as manual_type, url, (${bmScoreExpr}) as match_score
        FROM manuals
        WHERE is_active = true
          AND (${bmCombined})
        ORDER BY match_score DESC
        LIMIT 6
      `;
    }

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
      // Build a single OR condition for snippet matching
      // Using string concatenation for the WHERE clause since LIKE ANY has issues
      const likeConditions = topicPatterns.map((p) => sql`LOWER(ms.snippet) LIKE ${p}`);
      const combinedCondition = likeConditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);

      // Score each matching section by how many topic keywords it contains
      // and by snippet length (longer = more actual content, not just TOC)
      const scoreTerms = topicPatterns.map((p) =>
        sql`CASE WHEN LOWER(ms.snippet) LIKE ${p} THEN 1 ELSE 0 END`
      );
      const scoreExpr = scoreTerms.reduce((acc, term) => sql`${acc} + ${term}`);

      rows = await sql`
        SELECT
          ms.id as section_id,
          ms.manual_id,
          ms.page_start,
          ms.page_end,
          ms.title as section_title,
          LEFT(ms.snippet, 3000) as snippet,
          ms.tags::text as tags,
          (${scoreExpr}) as keyword_score,
          LENGTH(ms.snippet) as snippet_len
        FROM manual_sections ms
        WHERE ms.manual_id = ANY(${manualIds})
          AND (${combinedCondition})
        ORDER BY keyword_score DESC, snippet_len DESC, ms.page_start ASC
        LIMIT ${limit}
      `;
    } else {
      rows = [];
    }

    // If no content matches in the matched manuals, try searching ALL manuals
    // by snippet content (handles cases where the manual brand/model metadata doesn't match)
    if (rows.length === 0 && topicPatterns.length > 0) {
      const allSnippetConditions = [...topicPatterns, ...brandModelPatterns].map((p) => sql`LOWER(ms.snippet) LIKE ${p}`);
      const allSnippetCombined = allSnippetConditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);
      const allScoreTerms = [...topicPatterns, ...brandModelPatterns].map((p) =>
        sql`CASE WHEN LOWER(ms.snippet) LIKE ${p} THEN 1 ELSE 0 END`
      );
      const allScoreExpr = allScoreTerms.reduce((acc, term) => sql`${acc} + ${term}`);

      rows = await sql`
        SELECT
          ms.id as section_id,
          ms.manual_id,
          ms.page_start,
          ms.page_end,
          ms.title as section_title,
          LEFT(ms.snippet, 3000) as snippet,
          ms.tags::text as tags,
          (${allScoreExpr}) as keyword_score,
          LENGTH(ms.snippet) as snippet_len
        FROM manual_sections ms
        JOIN manuals m ON m.id = ms.manual_id
        WHERE m.is_active = true
          AND (${allSnippetCombined})
        ORDER BY keyword_score DESC, snippet_len DESC
        LIMIT ${limit}
      `;
    }

    // Last fallback: first pages of matching manuals
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

    // Get manual metadata for any manual IDs in results that aren't in our map
    const resultManualIds = [...new Set(rows.map((r: any) => r.manual_id))];
    const missingIds = resultManualIds.filter(id => !manualMap.has(id));
    if (missingIds.length > 0) {
      const extraManuals = await sql`SELECT id, brand, model, type as manual_type, url FROM manuals WHERE id = ANY(${missingIds})`;
      for (const em of extraManuals as any[]) {
        manualMap.set(em.id, em);
      }
    }

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
