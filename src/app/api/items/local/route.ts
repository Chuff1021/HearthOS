import { NextRequest, NextResponse } from "next/server";
import { db, inventoryItems } from "@/db";
import { and, eq, isNotNull, asc } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";

// Reads inventory items from the local DB and returns them in the QB shape
// the estimate builder picker consumes (Id / Name / FullyQualifiedName / Sku /
// UnitPrice). Avoids the QuickBooks Items API call on every estimate-page load.

type QBItem = {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  Sku?: string;
  UnitPrice?: number;
};

export async function GET(_req: NextRequest) {
  try {
    const org = await getOrCreateDefaultOrg();

    const rows = await db
      .select({
        qbItemId: inventoryItems.qbItemId,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        unitPrice: inventoryItems.unitPrice,
        isActive: inventoryItems.isActive,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, org.id), isNotNull(inventoryItems.qbItemId)))
      .orderBy(asc(inventoryItems.name));

    const items: QBItem[] = rows
      .filter((r) => r.isActive !== false)
      .map((r) => ({
        Id: r.qbItemId!,
        Name: r.name,
        FullyQualifiedName: r.name,
        Sku: r.sku ?? undefined,
        UnitPrice: r.unitPrice != null ? Number(r.unitPrice) : undefined,
      }));

    return NextResponse.json({ items, total: items.length });
  } catch (err: any) {
    console.error("Failed to read local items:", err);
    return NextResponse.json(
      { items: [], total: 0, error: err?.message || "Failed to fetch items" },
      { status: 500 },
    );
  }
}
