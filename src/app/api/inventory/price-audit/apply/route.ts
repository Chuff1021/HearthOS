import { NextRequest, NextResponse } from 'next/server';
import { db, inventoryItems } from '@/db';
import { and, eq, inArray } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// POST /api/inventory/price-audit/apply
// Body: { corrections: Array<{ id: string; newCost: number }> }
// Updates inventory_items.cost for each. Returns counts.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const corrections: Array<{ id: string; newCost: number }> = Array.isArray(body.corrections) ? body.corrections : [];
    if (corrections.length === 0) {
      return NextResponse.json({ applied: 0, skipped: 0 });
    }

    const org = await getOrCreateDefaultOrg();
    const ids = corrections.map((c) => c.id).filter(Boolean);

    // Make sure all ids belong to this org before touching anything
    const existing = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.id, ids)));
    const validIds = new Set(existing.map((r) => r.id));

    let applied = 0;
    let skipped = 0;
    const now = new Date();
    for (const c of corrections) {
      if (!validIds.has(c.id)) { skipped++; continue; }
      const v = Number(c.newCost);
      if (!isFinite(v) || v < 0) { skipped++; continue; }
      try {
        await db
          .update(inventoryItems)
          .set({ cost: String(v), costOverriddenAt: now, updatedAt: now })
          .where(and(eq(inventoryItems.orgId, org.id), eq(inventoryItems.id, c.id)));
        applied++;
      } catch (err) {
        console.error('Price-audit apply failed for', c.id, err);
        skipped++;
      }
    }

    return NextResponse.json({ applied, skipped });
  } catch (err: any) {
    console.error('Price-audit apply failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
