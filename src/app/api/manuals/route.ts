import { NextResponse } from "next/server";

// In-memory storage for manuals (in production, this would be a database)
let manuals: Manual[] = [
  {
    id: "1",
    brand: "Regency",
    model: "F1100",
    type: "Gas Insert",
    fileName: "Regency_F1100_Manual.pdf",
    pages: 48,
    uploadDate: "2025-01-15",
    category: "Gas Inserts",
  },
  {
    id: "2",
    brand: "Napoleon",
    model: "AS35",
    type: "Gas Stove",
    fileName: "Napoleon_AS35_Manual.pdf",
    pages: 36,
    uploadDate: "2025-01-10",
    category: "Gas Stoves",
  },
  {
    id: "3",
    brand: "Heat & Glo",
    model: "SLR",
    type: "Gas Fireplace",
    fileName: "HeatGlo_SLR_Manual.pdf",
    pages: 52,
    uploadDate: "2025-01-08",
    category: "Gas Fireplaces",
  },
  {
    id: "4",
    brand: "Vermont Castings",
    model: "Defiant",
    type: "Wood Stove",
    fileName: "VC_Defiant_Manual.pdf",
    pages: 44,
    uploadDate: "2024-12-20",
    category: "Wood Stoves",
  },
  {
    id: "5",
    brand: "Dimplex",
    model: "Opti-Myst",
    type: "Electric Fireplace",
    fileName: "Dimplex_OptiMyst_Manual.pdf",
    pages: 28,
    uploadDate: "2024-12-15",
    category: "Electric",
  },
  {
    id: "6",
    brand: "Majestic",
    model: "Ruby 36",
    type: "Gas Fireplace",
    fileName: "Majestic_Ruby36_Manual.pdf",
    pages: 40,
    uploadDate: "2024-12-10",
    category: "Gas Fireplaces",
  },
];

interface Manual {
  id: string;
  brand: string;
  model: string;
  type: string;
  fileName: string;
  pages: number;
  uploadDate: string;
  category: string;
}

// GET - Fetch all manuals
export async function GET() {
  return NextResponse.json(manuals);
}

// POST - Add a new manual
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const newManual: Manual = {
      id: Date.now().toString(),
      brand: body.brand,
      model: body.model,
      type: body.type,
      fileName: body.fileName,
      pages: body.pages || Math.floor(Math.random() * 50) + 10,
      uploadDate: new Date().toISOString().split("T")[0],
      category: body.category,
    };
    
    manuals = [newManual, ...manuals];
    
    return NextResponse.json(newManual, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create manual" },
      { status: 500 }
    );
  }
}
