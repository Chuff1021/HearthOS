import { NextRequest, NextResponse } from "next/server";
import { listManuals, createManual, updateManual, deleteManual } from "@/lib/manuals";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const category = searchParams.get("category");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const results = await listManuals({ query: q, category, includeInactive });
    return NextResponse.json({ manuals: results, total: results.length });
  } catch (err) {
    console.error("Failed to list manuals:", err);
    return NextResponse.json({ error: "Failed to list manuals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.brand || !body.model || !body.url) {
      return NextResponse.json(
        { error: "brand, model, and url are required" },
        { status: 400 }
      );
    }

    const created = await createManual({
      brand: body.brand,
      model: body.model,
      type: body.type,
      category: body.category,
      url: body.url,
      pages: body.pages ? Number(body.pages) : undefined,
      source: body.source,
    });

    return NextResponse.json({ manual: created }, { status: 201 });
  } catch (err) {
    console.error("Failed to create manual:", err);
    return NextResponse.json({ error: "Failed to create manual" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updated = await updateManual(body.id, {
      brand: body.brand,
      model: body.model,
      type: body.type,
      category: body.category,
      url: body.url,
      pages: body.pages ? Number(body.pages) : undefined,
      isActive: body.isActive,
    });

    if (!updated) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    return NextResponse.json({ manual: updated });
  } catch (err) {
    console.error("Failed to update manual:", err);
    return NextResponse.json({ error: "Failed to update manual" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = await deleteManual(id);
    if (!deleted) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete manual:", err);
    return NextResponse.json({ error: "Failed to delete manual" }, { status: 500 });
  }
}
