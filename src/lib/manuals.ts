import { db, manuals, manualSections } from "@/db";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";

export async function listManuals(params?: {
  query?: string | null;
  category?: string | null;
  includeInactive?: boolean;
}) {
  const org = await getOrCreateDefaultOrg();
  const filters = [eq(manuals.orgId, org.id)];

  if (!params?.includeInactive) {
    filters.push(eq(manuals.isActive, true));
  }

  if (params?.category && params.category !== "All") {
    filters.push(eq(manuals.category, params.category));
  }

  if (params?.query) {
    const q = `%${params.query}%`;
    filters.push(
      or(
        ilike(manuals.brand, q),
        ilike(manuals.model, q),
        ilike(manuals.type, q),
        ilike(manuals.category, q)
      )!
    );
  }

  return db
    .select()
    .from(manuals)
    .where(and(...filters))
    .orderBy(desc(manuals.createdAt));
}

export async function createManual(input: {
  brand: string;
  model: string;
  type?: string;
  category?: string;
  url: string;
  pages?: number | null;
  source?: string | null;
}) {
  const org = await getOrCreateDefaultOrg();
  const [created] = await db
    .insert(manuals)
    .values({
      orgId: org.id,
      brand: input.brand,
      model: input.model,
      type: input.type,
      category: input.category,
      url: input.url,
      pages: input.pages ?? null,
      source: input.source ?? "url",
    })
    .returning();

  return created;
}

export async function updateManual(id: string, updates: Partial<{
  brand: string;
  model: string;
  type: string;
  category: string;
  url: string;
  pages: number | null;
  isActive: boolean;
}>) {
  const [updated] = await db
    .update(manuals)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(manuals.id, id))
    .returning();

  return updated;
}

export async function deleteManual(id: string) {
  const [deleted] = await db
    .delete(manuals)
    .where(eq(manuals.id, id))
    .returning();
  return deleted;
}

export async function listManualSections(manualId?: string) {
  if (manualId) {
    return db
      .select()
      .from(manualSections)
      .where(eq(manualSections.manualId, manualId))
      .orderBy(manualSections.pageStart);
  }

  return db
    .select()
    .from(manualSections)
    .orderBy(manualSections.pageStart);
}

export async function createManualSection(input: {
  manualId: string;
  pageStart: number;
  pageEnd?: number | null;
  title?: string | null;
  snippet: string;
  tags?: string[];
}) {
  const [created] = await db
    .insert(manualSections)
    .values({
      manualId: input.manualId,
      pageStart: input.pageStart,
      pageEnd: input.pageEnd ?? null,
      title: input.title ?? null,
      snippet: input.snippet,
      tags: input.tags ?? [],
    })
    .returning();

  return created;
}
