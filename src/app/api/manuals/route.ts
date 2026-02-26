import { NextResponse } from "next/server";
import { manuals, Manual } from "../../../lib/manuals";

// GET handler - returns all manuals
export async function GET() {
  return NextResponse.json(manuals);
}

// POST handler - adds a new manual
export async function POST(request: Request) {
  try {
    const newManual: Omit<Manual, "id" | "uploadDate"> = await request.json();
    const manual: Manual = {
      ...newManual,
      id: `custom-${Date.now()}`,
      uploadDate: new Date().toISOString().split("T")[0],
    };
    manuals.unshift(manual);
    return NextResponse.json(manual, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create manual" },
      { status: 500 }
    );
  }
}
