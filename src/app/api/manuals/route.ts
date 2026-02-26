import { NextResponse } from "next/server";

// In-memory storage for fireplace manuals
// Uses Google Search URLs to help technicians find the latest manuals
// This ensures working links even when manufacturer PDF URLs change

function makeSearchUrl(brand: string, model: string): string {
  const query = encodeURIComponent(`${brand} ${model} installation manual`);
  return `https://www.google.com/search?q=${query}`;
}

let manuals: Manual[] = [
  // ============================================
  // MAJESTIC PRODUCTS - Direct Vent Fireplaces
  // ============================================
  
  {
    id: "m-000",
    brand: "Majestic",
    model: "DVLINEAR36",
    type: "Direct Vent Linear Fireplace",
    fileName: "Majestic_DVLINEAR36_Install.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: makeSearchUrl("Majestic", "DVLINEAR36"),
  },
  {
    id: "m-001",
    brand: "Majestic",
    model: "DVLL36",
    type: "Direct Vent Linear Fireplace",
    fileName: "Majestic_DVLL36_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: makeSearchUrl("Majestic", "DVLL36"),
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
    url: makeSearchUrl("Majestic", "DVLL42"),
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
    url: makeSearchUrl("Majestic", "DVLL54"),
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
    url: makeSearchUrl("Majestic", "DVCT36"),
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
    url: makeSearchUrl("Majestic", "DVCT42"),
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
    url: makeSearchUrl("Majestic", "DVG36"),
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
    url: makeSearchUrl("Majestic", "DVG42"),
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
    url: makeSearchUrl("Majestic", "DVSL36"),
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
    url: makeSearchUrl("Majestic", "DVSL42"),
  },
  {
    id: "m-010",
    brand: "Majestic",
    model: "BFDV36",
    type: "B-vent Direct Vent Fireplace",
    fileName: "Majestic_BFDV36_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "B-Vent",
    url: makeSearchUrl("Majestic", "BFDV36"),
  },
  {
    id: "m-011",
    brand: "Majestic",
    model: "BFDV42",
    type: "B-vent Direct Vent Fireplace",
    fileName: "Majestic_BFDV42_Manual.pdf",
    pages: 46,
    uploadDate: "2025-02-26",
    category: "B-Vent",
    url: makeSearchUrl("Majestic", "BFDV42"),
  },
  {
    id: "m-012",
    brand: "Majestic",
    model: "BV36",
    type: "B-Vent Fireplace",
    fileName: "Majestic_BV36_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "B-Vent",
    url: makeSearchUrl("Majestic", "BV36"),
  },
  {
    id: "m-013",
    brand: "Majestic",
    model: "BV42",
    type: "B-Vent Fireplace",
    fileName: "Majestic_BV42_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "B-Vent",
    url: makeSearchUrl("Majestic", "BV42"),
  },
  {
    id: "m-014",
    brand: "Majestic",
    model: "QBDM36",
    type: "Quick Burn DVI Burner",
    fileName: "Majestic_QBDM36_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Burner",
    url: makeSearchUrl("Majestic", "QBDM36"),
  },
  {
    id: "m-015",
    brand: "Majestic",
    model: "QCB36",
    type: "Quick Burn Counter Flow",
    fileName: "Majestic_QCB36_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Burner",
    url: makeSearchUrl("Majestic", "QCB36"),
  },
  {
    id: "m-016",
    brand: "Majestic",
    model: "QCF36",
    type: "Quick Burn Counter Flow",
    fileName: "Majestic_QCF36_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Burner",
    url: makeSearchUrl("Majestic", "QCF36"),
  },
  {
    id: "m-017",
    brand: "Majestic",
    model: "QLD36",
    type: "Quick Light Direct Vent",
    fileName: "Majestic_QLD36_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: makeSearchUrl("Majestic", "QLD36"),
  },
  {
    id: "m-018",
    brand: "Majestic",
    model: "QLD42",
    type: "Quick Light Direct Vent",
    fileName: "Majestic_QLD42_Manual.pdf",
    pages: 22,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: makeSearchUrl("Majestic", "QLD42"),
  },
  {
    id: "m-019",
    brand: "Majestic",
    model: "36BDV",
    type: "36-inch Direct Vent Gas Fireplace",
    fileName: "Majestic_36BDV_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: makeSearchUrl("Majestic", "36BDV"),
  },
  {
    id: "m-020",
    brand: "Majestic",
    model: "42BDV",
    type: "42-inch Direct Vent Gas Fireplace",
    fileName: "Majestic_42BDV_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: makeSearchUrl("Majestic", "42BDV"),
  },

  // ============================================
  // REGENCY FIREPLACES
  // ============================================
  
  {
    id: "r-001",
    brand: "Regency",
    model: "F1100",
    type: "Freestanding Gas Fireplace",
    fileName: "Regency_F1100_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Freestanding",
    url: makeSearchUrl("Regency", "F1100"),
  },
  {
    id: "r-002",
    brand: "Regency",
    model: "F5100",
    type: "Freestanding Gas Fireplace",
    fileName: "Regency_F5100_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Freestanding",
    url: makeSearchUrl("Regency", "F5100"),
  },
  {
    id: "r-003",
    brand: "Regency",
    model: "HZ40E",
    type: "Zero Clearance Gas Fireplace",
    fileName: "Regency_HZ40E_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: makeSearchUrl("Regency", "HZ40E"),
  },
  {
    id: "r-004",
    brand: "Regency",
    model: "HZ50E",
    type: "Zero Clearance Gas Fireplace",
    fileName: "Regency_HZ50E_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: makeSearchUrl("Regency", "HZ50E"),
  },
  {
    id: "r-005",
    brand: "Regency",
    model: "U29",
    type: "Urban Fireplace",
    fileName: "Regency_U29_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Insert",
    url: makeSearchUrl("Regency", "U29"),
  },
  {
    id: "r-006",
    brand: "Regency",
    model: "C3",
    type: "Custom Fireplace",
    fileName: "Regency_C3_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Custom",
    url: makeSearchUrl("Regency", "C3"),
  },

  // ============================================
  // NAPOLEON FIREPLACES
  // ============================================
  
  {
    id: "n-001",
    brand: "Napoleon",
    model: "AS35",
    type: "Aspen Series Fireplace",
    fileName: "Napoleon_AS35_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Aspen",
    url: makeSearchUrl("Napoleon", "AS35"),
  },
  {
    id: "n-002",
    brand: "Napoleon",
    model: "T450",
    type: "Triumph Series Fireplace",
    fileName: "Napoleon_T450_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Triumph",
    url: makeSearchUrl("Napoleon", "T450"),
  },
  {
    id: "n-003",
    brand: "Napoleon",
    model: "T500",
    type: "Triumph Series Fireplace",
    fileName: "Napoleon_T500_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Triumph",
    url: makeSearchUrl("Napoleon", "T500"),
  },
  {
    id: "n-004",
    brand: "Napoleon",
    model: "X450",
    type: "Xtreme Series Fireplace",
    fileName: "Napoleon_X450_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Xtreme",
    url: makeSearchUrl("Napoleon", "X450"),
  },
  {
    id: "n-005",
    brand: "Napoleon",
    model: "X500",
    type: "Xtreme Series Fireplace",
    fileName: "Napoleon_X500_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Xtreme",
    url: makeSearchUrl("Napoleon", "X500"),
  },

  // ============================================
  // HEAT & GLO FIREPLACES
  // ============================================
  
  {
    id: "hg-001",
    brand: "Heat & Glo",
    model: "SLR",
    type: "SlimLine Fireplace",
    fileName: "HeatGlo_SLR_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "SlimLine",
    url: makeSearchUrl("Heat Glo", "SLR"),
  },
  {
    id: "hg-002",
    brand: "Heat & Glo",
    model: "SLR-II",
    type: "SlimLine II Fireplace",
    fileName: "HeatGlo_SLRII_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "SlimLine",
    url: makeSearchUrl("Heat Glo", "SLR-II"),
  },
  {
    id: "hg-003",
    brand: "Heat & Glo",
    model: "6000CLX",
    type: "6000 Series Fireplace",
    fileName: "HeatGlo_6000CLX_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "6000 Series",
    url: makeSearchUrl("Heat Glo", "6000CLX"),
  },
  {
    id: "hg-004",
    brand: "Heat & Glo",
    model: "8000CLX",
    type: "8000 Series Fireplace",
    fileName: "HeatGlo_8000CLX_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "8000 Series",
    url: makeSearchUrl("Heat Glo", "8000CLX"),
  },
  {
    id: "hg-005",
    brand: "Heat & Glo",
    model: "Gemini",
    type: "Gemini Double-Sided Fireplace",
    fileName: "HeatGlo_Gemini_Manual.pdf",
    pages: 52,
    uploadDate: "2025-02-26",
    category: "Double-Sided",
    url: makeSearchUrl("Heat Glo", "Gemini"),
  },

  // ============================================
  // VERMONT CASTINGS
  // ============================================
  
  {
    id: "vc-001",
    brand: "Vermont Castings",
    model: "Defiant",
    type: "Defiant Freestanding Stove",
    fileName: "Vermont_Defiant_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Freestanding",
    url: makeSearchUrl("Vermont Castings", "Defiant"),
  },
  {
    id: "vc-002",
    brand: "Vermont Castings",
    model: "Resolute",
    type: "Resolute Freestanding Stove",
    fileName: "Vermont_Resolute_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Freestanding",
    url: makeSearchUrl("Vermont Castings", "Resolute"),
  },
  {
    id: "vc-003",
    brand: "Vermont Castings",
    model: "Intrepid",
    type: "Intrepid Freestanding Stove",
    fileName: "Vermont_Intrepid_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Freestanding",
    url: makeSearchUrl("Vermont Castings", "Intrepid"),
  },
  {
    id: "vc-004",
    brand: "Vermont Castings",
    model: "Majestic",
    type: "Majestic Fireplace",
    fileName: "Vermont_Majestic_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "Fireplace",
    url: makeSearchUrl("Vermont Castings", "Majestic"),
  },

  // ============================================
  // DIMPLEX
  // ============================================
  
  {
    id: "d-001",
    brand: "Dimplex",
    model: "Opti-Myst",
    type: "Opti-Myst Electric Fireplace",
    fileName: "Dimplex_OptiMyst_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Dimplex", "Opti-Myst"),
  },
  {
    id: "d-002",
    brand: "Dimplex",
    model: "Opti-V",
    type: "Opti-V Virtual Fireplace",
    fileName: "Dimplex_OptiV_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Dimplex", "Opti-V"),
  },
  {
    id: "d-003",
    brand: "Dimplex",
    model: "Revillusion",
    type: "Revillusion Electric Fireplace",
    fileName: "Dimplex_Revillusion_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Dimplex", "Revillusion"),
  },
  {
    id: "d-004",
    brand: "Dimplex",
    model: "Linear",
    type: "Linear Electric Fireplace",
    fileName: "Dimplex_Linear_Manual.pdf",
    pages: 22,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Dimplex", "Linear"),
  },

  // ============================================
  // TRAVIS INDUSTRIES
  // ============================================
  
  {
    id: "t-001",
    brand: "Travis Industries",
    model: "LW1100",
    type: "Lopi Wood Fireplace",
    fileName: "Travis_LW1100_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Travis Industries", "LW1100"),
  },
  {
    id: "t-002",
    brand: "Travis Industries",
    model: "Lopi",
    type: "Lopi Gas Fireplace",
    fileName: "Travis_Lopi_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Travis Industries", "Lopi"),
  },
  {
    id: "t-003",
    brand: "Travis Industries",
    model: "Apex",
    type: "Apex Gas Fireplace",
    fileName: "Travis_Apex_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Travis Industries", "Apex"),
  },

  // ============================================
  // QUADRA-FIRE
  // ============================================
  
  {
    id: "q-001",
    brand: "Quadra-Fire",
    model: "Santa Fe",
    type: "Santa Fe Wood Fireplace",
    fileName: "QuadraFire_SantaFe_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Quadra-Fire", "Santa Fe"),
  },
  {
    id: "q-002",
    brand: "Quadra-Fire",
    model: "Explorer",
    type: "Explorer Gas Fireplace",
    fileName: "QuadraFire_Explorer_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Quadra-Fire", "Explorer"),
  },
  {
    id: "q-003",
    brand: "Quadra-Fire",
    model: "Denali",
    type: "Denali Gas Fireplace",
    fileName: "QuadraFire_Denali_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Quadra-Fire", "Denali"),
  },

  // ============================================
  // HARMAN
  // ============================================
  
  {
    id: "h-001",
    brand: "Harman",
    model: "P68",
    type: "P68 Pellet Stove",
    fileName: "Harman_P68_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Pellet",
    url: makeSearchUrl("Harman", "P68"),
  },
  {
    id: "h-002",
    brand: "Harman",
    model: "Trophy",
    type: "Trophy Pellet Stove",
    fileName: "Harman_Trophy_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Pellet",
    url: makeSearchUrl("Harman", "Trophy"),
  },
  {
    id: "h-003",
    brand: "Harman",
    model: "Advance",
    type: "Advance Pellet Stove",
    fileName: "Harman_Advance_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Pellet",
    url: makeSearchUrl("Harman", "Advance"),
  },

  // ============================================
  // BUCK STOVE
  // ============================================
  
  {
    id: "bs-001",
    brand: "Buck Stove",
    model: "Model 20",
    type: "Model 20 Wood Stove",
    fileName: "BuckStove_Model20_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Buck Stove", "Model 20"),
  },
  {
    id: "bs-002",
    brand: "Buck Stove",
    model: "Model 24",
    type: "Model 24 Wood Stove",
    fileName: "BuckStove_Model24_Manual.pdf",
    pages: 22,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Buck Stove", "Model 24"),
  },
  {
    id: "bs-003",
    brand: "Buck Stove",
    model: "Model 27",
    type: "Model 27 Wood Stove",
    fileName: "BuckStove_Model27_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Buck Stove", "Model 27"),
  },
  {
    id: "bs-004",
    brand: "Buck Stove",
    model: "Model 91",
    type: "Model 91 Wood Stove",
    fileName: "BuckStove_Model91_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Buck Stove", "Model 91"),
  },

  // ============================================
  // PACIFIC ENERGY
  // ============================================
  
  {
    id: "pe-001",
    brand: "Pacific Energy",
    model: "Alderlea",
    type: "Alderlea Wood Stove",
    fileName: "PacificEnergy_Alderlea_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Pacific Energy", "Alderlea"),
  },
  {
    id: "pe-002",
    brand: "Pacific Energy",
    model: "Summit",
    type: "Summit Wood Stove",
    fileName: "PacificEnergy_Summit_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Pacific Energy", "Summit"),
  },
  {
    id: "pe-003",
    brand: "Pacific Energy",
    model: "Fireview",
    type: "Fireview Wood Stove",
    fileName: "PacificEnergy_Fireview_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Pacific Energy", "Fireview"),
  },

  // ============================================
  // SBI (Enerzone, Drolet, Flexiheat)
  // ============================================
  
  {
    id: "sbi-001",
    brand: "Enerzone",
    model: "Solution",
    type: "Solution Wood Stove",
    fileName: "Enerzone_Solution_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Enerzone", "Solution"),
  },
  {
    id: "sbi-002",
    brand: "Drolet",
    model: "Escape",
    type: "Escape Wood Stove",
    fileName: "Drolet_Escape_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Drolet", "Escape"),
  },
  {
    id: "sbi-003",
    brand: "Flexiheat",
    model: "Aurora",
    type: "Aurora Wood Stove",
    fileName: "Flexiheat_Aurora_Manual.pdf",
    pages: 26,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Flexiheat", "Aurora"),
  },

  // ============================================
  // MONT
  // ============================================
  
  {
    id: "mont-001",
    brand: "Mont",
    model: "Deluxe",
    type: "Deluxe Gas Fireplace",
    fileName: "Mont_Deluxe_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Mont", "Deluxe"),
  },
  {
    id: "mont-002",
    brand: "Mont",
    model: "Enchantment",
    type: "Enchantment Gas Fireplace",
    fileName: "Mont_Enchantment_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Mont", "Enchantment"),
  },
  {
    id: "mont-003",
    brand: "Mont",
    model: "Excalibur",
    type: "Excalibur Gas Fireplace",
    fileName: "Mont_Excalibur_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Mont", "Excalibur"),
  },

  // ============================================
  // EMPIRE
  // ============================================
  
  {
    id: "emp-001",
    brand: "Empire",
    model: "Vail",
    type: "Vail Gas Fireplace",
    fileName: "Empire_Vail_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Empire", "Vail"),
  },
  {
    id: "emp-002",
    brand: "Empire",
    model: "Alta",
    type: "Alta Gas Fireplace",
    fileName: "Empire_Alta_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Empire", "Alta"),
  },
  {
    id: "emp-003",
    brand: "Empire",
    model: "DVC",
    type: "DVC Direct Vent Fireplace",
    fileName: "Empire_DVC_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: makeSearchUrl("Empire", "DVC"),
  },
  {
    id: "emp-004",
    brand: "Empire",
    model: "Palisade",
    type: "Palisade Gas Fireplace",
    fileName: "Empire_Palisade_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Empire", "Palisade"),
  },

  // ============================================
  // SIMPLIFIRE
  // ============================================
  
  {
    id: "sf-001",
    brand: "SimpliFire",
    model: "Allusion",
    type: "Allusion Electric Fireplace",
    fileName: "SimpliFire_Allusion_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("SimpliFire", "Allusion"),
  },
  {
    id: "sf-002",
    brand: "SimpliFire",
    model: "Scorpius",
    type: "Scorpius Electric Fireplace",
    fileName: "SimpliFire_Scorpius_Manual.pdf",
    pages: 18,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("SimpliFire", "Scorpius"),
  },
  {
    id: "sf-003",
    brand: "SimpliFire",
    model: "Vortex",
    type: "Vortex Electric Fireplace",
    fileName: "SimpliFire_Vortex_Manual.pdf",
    pages: 22,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("SimpliFire", "Vortex"),
  },
  {
    id: "sf-004",
    brand: "SimpliFire",
    model: "Motion",
    type: "Motion Electric Fireplace",
    fileName: "SimpliFire_Motion_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("SimpliFire", "Motion"),
  },

  // ============================================
  // MODERN FLAMES
  // ============================================
  
  {
    id: "mf-001",
    brand: "Modern Flames",
    model: "Aurora",
    type: "Aurora Electric Fireplace",
    fileName: "ModernFlames_Aurora_Manual.pdf",
    pages: 16,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Modern Flames", "Aurora"),
  },
  {
    id: "mf-002",
    brand: "Modern Flames",
    model: "Landscape Pro",
    type: "Landscape Pro Electric Fireplace",
    fileName: "ModernFlames_LandscapePro_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Modern Flames", "Landscape Pro"),
  },
  {
    id: "mf-003",
    brand: "Modern Flames",
    model: "Wildland",
    type: "Wildland Electric Fireplace",
    fileName: "ModernFlames_Wildland_Manual.pdf",
    pages: 18,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Modern Flames", "Wildland"),
  },

  // ============================================
  // AMERICAN FIREGLASS
  // ============================================
  
  {
    id: "afg-001",
    brand: "American Fireglass",
    model: "Burner Systems",
    type: "Fireplace Burner Systems",
    fileName: "AFG_BurnerSystems_Manual.pdf",
    pages: 12,
    uploadDate: "2025-02-26",
    category: "Burner",
    url: makeSearchUrl("American Fireglass", "Burner Systems"),
  },
  {
    id: "afg-002",
    brand: "American Fireglass",
    model: "Fireballs",
    type: "Fireballs Decorative Media",
    fileName: "AFG_Fireballs_Manual.pdf",
    pages: 8,
    uploadDate: "2025-02-26",
    category: "Media",
    url: makeSearchUrl("American Fireglass", "Fireballs"),
  },
  {
    id: "afg-003",
    brand: "American Fireglass",
    model: "Fireplace Logs",
    type: "Decorative Fireplace Logs",
    fileName: "AFG_FireplaceLogs_Manual.pdf",
    pages: 10,
    uploadDate: "2025-02-26",
    category: "Media",
    url: makeSearchUrl("American Fireglass", "Fireplace Logs"),
  },

  // ============================================
  // RINNAI
  // ============================================
  
  {
    id: "rinnai-001",
    brand: "Rinnai",
    model: "Enclaves",
    type: "Enclaves Gas Fireplace",
    fileName: "Rinnai_Enclaves_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Rinnai", "Enclaves"),
  },
  {
    id: "rinnai-002",
    brand: "Rinnai",
    model: "EnergySaver",
    type: "EnergySaver Gas Fireplace",
    fileName: "Rinnai_EnergySaver_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Rinnai", "EnergySaver"),
  },
  {
    id: "rinnai-003",
    brand: "Rinnai",
    model: "Contour",
    type: "Contour Gas Fireplace",
    fileName: "Rinnai_Contour_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Rinnai", "Contour"),
  },

  // ============================================
  // LENNOX
  // ============================================
  
  {
    id: "lennox-001",
    brand: "Lennox",
    model: "Merritt",
    type: "Merritt Gas Fireplace",
    fileName: "Lennox_Merritt_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Lennox", "Merritt"),
  },
  {
    id: "lennox-002",
    brand: "Lennox",
    model: "Brockway",
    type: "Brockway Gas Fireplace",
    fileName: "Lennox_Brockway_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Lennox", "Brockway"),
  },
  {
    id: "lennox-003",
    brand: "Lennox",
    model: "Whitby",
    type: "Whitby Gas Fireplace",
    fileName: "Lennox_Whitby_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Lennox", "Whitby"),
  },

  // ============================================
  // SUPERIOR
  // ============================================
  
  {
    id: "sup-001",
    brand: "Superior",
    model: "DRT",
    type: "DRT Series Gas Fireplace",
    fileName: "Superior_DRT_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Superior", "DRT"),
  },
  {
    id: "sup-002",
    brand: "Superior",
    model: "DRL",
    type: "DRL Series Gas Fireplace",
    fileName: "Superior_DRL_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Superior", "DRL"),
  },
  {
    id: "sup-003",
    brand: "Superior",
    model: "XTR",
    type: "XTR Series Gas Fireplace",
    fileName: "Superior_XTR_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Superior", "XTR"),
  },

  // ============================================
  // KOZY HEAT
  // ============================================
  
  {
    id: "kh-001",
    brand: "Kozy Heat",
    model: "Taylor",
    type: "Taylor Gas Fireplace",
    fileName: "KozyHeat_Taylor_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Kozy Heat", "Taylor"),
  },
  {
    id: "kh-002",
    brand: "Kozy Heat",
    model: "Spartan",
    type: "Spartan Gas Fireplace",
    fileName: "KozyHeat_Spartan_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Kozy Heat", "Spartan"),
  },
  {
    id: "kh-003",
    brand: "Kozy Heat",
    model: "Bayport",
    type: "Bayport Gas Fireplace",
    fileName: "KozyHeat_Bayport_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Kozy Heat", "Bayport"),
  },
];

// Manual type definition
interface Manual {
  id: string;
  brand: string;
  model: string;
  type: string;
  fileName: string;
  pages: number;
  uploadDate: string;
  category: string;
  url: string;
}

// GET - Retrieve all manuals
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand");
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  let filtered = [...manuals];

  // Filter by brand
  if (brand) {
    filtered = filtered.filter(
      (m) => m.brand.toLowerCase() === brand.toLowerCase()
    );
  }

  // Filter by category
  if (category) {
    filtered = filtered.filter(
      (m) => m.category.toLowerCase() === category.toLowerCase()
    );
  }

  // Search by model or type
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.model.toLowerCase().includes(searchLower) ||
        m.type.toLowerCase().includes(searchLower) ||
        m.brand.toLowerCase().includes(searchLower)
    );
  }

  // Get unique brands and categories for filters
  const brands = [...new Set(manuals.map((m) => m.brand))].sort();
  const categories = [...new Set(manuals.map((m) => m.category))].sort();

  return NextResponse.json({
    manuals: filtered,
    filters: {
      brands,
      categories,
    },
    total: filtered.length,
  });
}

// POST - Add a new manual
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.brand || !body.model) {
      return NextResponse.json(
        { error: "Brand and model are required" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const exists = manuals.find(
      (m) => m.brand === body.brand && m.model === body.model
    );
    if (exists) {
      return NextResponse.json(
        { error: "Manual already exists for this brand and model" },
        { status: 400 }
      );
    }

    // Create new manual
    const newManual: Manual = {
      id: `m-${Date.now()}`,
      brand: body.brand,
      model: body.model,
      type: body.type || "Unknown",
      fileName: body.fileName || `${body.brand}_${body.model}_Manual.pdf`,
      pages: body.pages || 0,
      uploadDate: new Date().toISOString().split("T")[0],
      category: body.category || "General",
      url: body.url || makeSearchUrl(body.brand, body.model),
    };

    manuals.push(newManual);

    return NextResponse.json(newManual, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create manual" },
      { status: 500 }
    );
  }
}

// PUT - Update a manual
export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Manual ID is required" },
        { status: 400 }
      );
    }

    const index = manuals.findIndex((m) => m.id === body.id);
    if (index === -1) {
      return NextResponse.json(
        { error: "Manual not found" },
        { status: 404 }
      );
    }

    // Update fields
    manuals[index] = {
      ...manuals[index],
      ...body,
      id: body.id, // Prevent ID change
    };

    return NextResponse.json(manuals[index]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update manual" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a manual
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Manual ID is required" },
        { status: 400 }
      );
    }

    const index = manuals.findIndex((m) => m.id === id);
    if (index === -1) {
      return NextResponse.json(
        { error: "Manual not found" },
        { status: 404 }
      );
    }

    const deleted = manuals.splice(index, 1)[0];

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete manual" },
      { status: 500 }
    );
  }
}
