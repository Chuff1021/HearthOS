import { db, fireplaceManualRegistry } from "@/db";
import { and, desc, eq, ilike, sql } from "drizzle-orm";

export async function listRegistryManuals(params?: {
  manufacturer?: string;
  model?: string;
  family?: string;
  size?: string;
  manualType?: string;
  status?: string;
  limit?: number;
}) {
  const filters: any[] = [];
  if (params?.manufacturer) filters.push(ilike(fireplaceManualRegistry.manufacturer, `%${params.manufacturer}%`));
  if (params?.model) filters.push(ilike(fireplaceManualRegistry.normalizedModel, `%${params.model.toLowerCase()}%`));
  if (params?.family) filters.push(ilike(fireplaceManualRegistry.family, `%${params.family}%`));
  if (params?.size) filters.push(eq(fireplaceManualRegistry.size, params.size));
  if (params?.manualType) filters.push(ilike(fireplaceManualRegistry.manualType, `%${params.manualType}%`));
  if (params?.status) filters.push(eq(fireplaceManualRegistry.status, params.status));

  return db.select().from(fireplaceManualRegistry)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(fireplaceManualRegistry.updatedAt))
    .limit(Math.max(1, Math.min(params?.limit ?? 200, 1000)));
}

export async function upsertRegistryManual(input: typeof fireplaceManualRegistry.$inferInsert) {
  const [row] = await db.insert(fireplaceManualRegistry)
    .values(input)
    .onConflictDoUpdate({
      target: fireplaceManualRegistry.manualId,
      set: {
        ...input,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function registryStats() {
  const [rows] = await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where manufacturer is null or model is null or manual_type is null)::int as missing_core,
      count(*) filter (where metadata_confidence < 0.5)::int as low_confidence
    from fireplace_manual_registry
  ` as any) as any;
  return rows;
}
