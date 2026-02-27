import { NextRequest, NextResponse } from "next/server";
import { listManualSections, createManualSection } from "@/lib/manuals";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const manualId = searchParams.get("manualId") || undefined;

    const sections = await listManualSections(manualId);
    return NextResponse.json({ sections, total: sections.length });
  } catch (err) {
    console.error("Failed to list manual sections:", err);
    return NextResponse.json({ error: "Failed to list manual sections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.manualId || !body.pageStart || !body.snippet) {
      return NextResponse.json(
        { error: "manualId, pageStart, and snippet are required" },
        { status: 400 }
      );
    }

    const created = await createManualSection({
      manualId: body.manualId,
      pageStart: Number(body.pageStart),
      pageEnd: body.pageEnd ? Number(body.pageEnd) : undefined,
      title: body.title,
      snippet: body.snippet,
      tags: body.tags,
    });

    return NextResponse.json({ section: created }, { status: 201 });
  } catch (err) {
    console.error("Failed to create manual section:", err);
    return NextResponse.json({ error: "Failed to create manual section" }, { status: 500 });
  }
}
