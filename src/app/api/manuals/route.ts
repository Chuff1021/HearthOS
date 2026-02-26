import { NextResponse } from "next/server";

// In-memory storage for fireplace manuals
// ONLY includes manuals with actual PDF files in public/manuals/
let manuals: Manual[] = [
  // ============================================
  // MAJESTIC PRODUCTS - Only models with actual PDFs
  // ============================================
  
  {
    id: "m-001",
    brand: "Majestic",
    model: "DVLL36",
    type: "Direct Vent Linear Fireplace",
    fileName: "Majestic_DVLL36_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-002",
    brand: "Majestic",
    model: "DVLL42",
    type: "Direct Vent Linear Fireplace",
    fileName: "Majestic_DVLL42_Manual.pdf",
    pages: 52,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-003",
    brand: "Majestic",
    model: "DVLL54",
    type: "Direct Vent Linear Fireplace",
    fileName: "Majestic_DVLL54_Manual.pdf",
    pages: 56,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-004",
    brand: "Majestic",
    model: "DVCT36",
    type: "Direct Vent Corner Fireplace",
    fileName: "Majestic_DVCT36_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-005",
    brand: "Majestic",
    model: "DVCT42",
    type: "Direct Vent Corner Fireplace",
    fileName: "Majestic_DVCT42_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-006",
    brand: "Majestic",
    model: "DVG36",
    type: "Direct Vent Gas Fireplace",
    fileName: "Majestic_DVG36_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-007",
    brand: "Majestic",
    model: "DVG42",
    type: "Direct Vent Gas Fireplace",
    fileName: "Majestic_DVG42_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-008",
    brand: "Majestic",
    model: "DVSL36",
    type: "Direct Vent See-Through Fireplace",
    fileName: "Majestic_DVSL36_Manual.pdf",
    pages: 46,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-009",
    brand: "Majestic",
    model: "DVSL42",
    type: "Direct Vent See-Through Fireplace",
    fileName: "Majestic_DVSL42_Manual.pdf",
    pages: 50,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-010",
    brand: "Majestic",
    model: "BFDV36",
    type: "B-Vent Direct Vent Fireplace",
    fileName: "Majestic_BFDV36_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "B-Vent",
  },
  {
    id: "m-011",
    brand: "Majestic",
    model: "BFDV42",
    type: "B-Vent Direct Vent Fireplace",
    fileName: "Majestic_BFDV42_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "B-Vent",
  },
  {
    id: "m-012",
    brand: "Majestic",
    model: "BV36",
    type: "B-Vent Fireplace",
    fileName: "Majestic_BV36_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "B-Vent",
  },
  {
    id: "m-013",
    brand: "Majestic",
    model: "BV42",
    type: "B-Vent Fireplace",
    fileName: "Majestic_BV42_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "B-Vent",
  },
  {
    id: "m-014",
    brand: "Majestic",
    model: "QBDM36",
    type: "Dual Fuel Fireplace",
    fileName: "Majestic_QBDM36_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Dual Fuel",
  },
  {
    id: "m-015",
    brand: "Majestic",
    model: "QCB36",
    type: "Convertible Box Fireplace",
    fileName: "Majestic_QCB36_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Convertible",
  },
  {
    id: "m-016",
    brand: "Majestic",
    model: "QCF36",
    type: "Corner Fireplace",
    fileName: "Majestic_QCF36_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Corner",
  },
  {
    id: "m-017",
    brand: "Majestic",
    model: "QLD36",
    type: "Louvred Fireplace",
    fileName: "Majestic_QLD36_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Louvred",
  },
  {
    id: "m-018",
    brand: "Majestic",
    model: "QLD42",
    type: "Louvred Fireplace",
    fileName: "Majestic_QLD42_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Louvred",
  },
  {
    id: "m-019",
    brand: "Majestic",
    model: "36BDV",
    type: "Direct Vent Fireplace",
    fileName: "Majestic_36BDV_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
  },
  {
    id: "m-020",
    brand: "Majestic",
    model: "42BDV",
    type: "Direct Vent Fireplace",
    fileName: "Majestic_42BDV_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
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
      id: `manual-${Date.now()}`,
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
