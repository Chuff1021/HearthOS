import { NextResponse } from "next/server";

// In-memory storage for fireplace manuals
// Uses manufacturer URLs for technicians to access real manuals
let manuals: Manual[] = [
  // ============================================
  // MAJESTIC PRODUCTS - Direct Vent Fireplaces
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.majesticproducts.com/support/manuals",
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
    url: "https://www.regency-fire.com/en/Support/Pages/Manuals.aspx",
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
    url: "https://www.regency-fire.com/en/Support/Pages/Manuals.aspx",
  },
  {
    id: "r-003",
    brand: "Regency",
    model: "HZ40E",
    type: "Zero Clearance Fireplace",
    fileName: "Regency_HZ40E_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: "https://www.regency-fire.com/en/Support/Pages/Manuals.aspx",
  },
  {
    id: "r-004",
    brand: "Regency",
    model: "HZ50E",
    type: "Zero Clearance Fireplace",
    fileName: "Regency_HZ50E_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: "https://www.regency-fire.com/en/Support/Pages/Manuals.aspx",
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
    url: "https://www.regency-fire.com/en/Support/Pages/Manuals.aspx",
  },
  {
    id: "r-006",
    brand: "Regency",
    model: "C3",
    type: "Catalytic Heater",
    fileName: "Regency_C3_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Heater",
    url: "https://www.regency-fire.com/en/Support/Pages/Manuals.aspx",
  },

  // ============================================
  // NAPOLEON FIREPLACES
  // ============================================
  
  {
    id: "n-001",
    brand: "Napoleon",
    model: "AS35",
    type: "Aspen Small Freestanding",
    fileName: "Napoleon_AS35_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Freestanding",
    url: "https://www.napoleon.com/support/manuals/",
  },
  {
    id: "n-002",
    brand: "Napoleon",
    model: "T450",
    type: "T-Series Fireplace",
    fileName: "Napoleon_T450_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: "https://www.napoleon.com/support/manuals/",
  },
  {
    id: "n-003",
    brand: "Napoleon",
    model: "T500",
    type: "T-Series Fireplace",
    fileName: "Napoleon_T500_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: "https://www.napoleon.com/support/manuals/",
  },
  {
    id: "n-004",
    brand: "Napoleon",
    model: "X450",
    type: "X-Series Fireplace",
    fileName: "Napoleon_X450_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: "https://www.napoleon.com/support/manuals/",
  },
  {
    id: "n-005",
    brand: "Napoleon",
    model: "X500",
    type: "X-Series Fireplace",
    fileName: "Napoleon_X500_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: "https://www.napoleon.com/support/manuals/",
  },

  // ============================================
  // HEAT & GLO FIREPLACES
  // ============================================
  
  {
    id: "hg-001",
    brand: "Heat & Glo",
    model: "SLR",
    type: "Slim Line Fireplace",
    fileName: "HeatGlo_SLR_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.heatnglo.com/support/manuals",
  },
  {
    id: "hg-002",
    brand: "Heat & Glo",
    model: "SLR-II",
    type: "Slim Line II Fireplace",
    fileName: "HeatGlo_SLRII_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.heatnglo.com/support/manuals",
  },
  {
    id: "hg-003",
    brand: "Heat & Glo",
    model: "6000CLX",
    type: "6000 Series Fireplace",
    fileName: "HeatGlo_6000CLX_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.heatnglo.com/support/manuals",
  },
  {
    id: "hg-004",
    brand: "Heat & Glo",
    model: "8000CLX",
    type: "8000 Series Fireplace",
    fileName: "HeatGlo_8000CLX_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.heatnglo.com/support/manuals",
  },
  {
    id: "hg-005",
    brand: "Heat & Glo",
    model: "Gemini",
    type: "Dual Burner Fireplace",
    fileName: "HeatGlo_Gemini_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.heatnglo.com/support/manuals",
  },

  // ============================================
  // VERMONT CASTINGS
  // ============================================
  
  {
    id: "vc-001",
    brand: "Vermont Castings",
    model: "Defiant",
    type: "Freestanding Wood Fireplace",
    fileName: "Vermont_Defiant_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: "https://www.vermontcastings.com/support/manuals",
  },
  {
    id: "vc-002",
    brand: "Vermont Castings",
    model: "Resolute",
    type: "Freestanding Wood Fireplace",
    fileName: "Vermont_Resolute_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: "https://www.vermontcastings.com/support/manuals",
  },
  {
    id: "vc-003",
    brand: "Vermont Castings",
    model: "Intrepid",
    type: "Freestanding Wood Fireplace",
    fileName: "Vermont_Intrepid_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: "https://www.vermontcastings.com/support/manuals",
  },
  {
    id: "vc-004",
    brand: "Vermont Castings",
    model: "Majestic",
    type: "Zero Clearance Fireplace",
    fileName: "Vermont_Majestic_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Zero Clearance",
    url: "https://www.vermontcastings.com/support/manuals",
  },

  // ============================================
  // DIMPLEX
  // ============================================
  
  {
    id: "d-001",
    brand: "Dimplex",
    model: "Opti-Myst",
    type: "Electric Fireplace",
    fileName: "Dimplex_OptiMyst_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.dimplex.com/support/manuals",
  },
  {
    id: "d-002",
    brand: "Dimplex",
    model: "Opti-V",
    type: "Electric Fireplace",
    fileName: "Dimplex_OptiV_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.dimplex.com/support/manuals",
  },
  {
    id: "d-003",
    brand: "Dimplex",
    model: "Revillusion",
    type: "Electric Fireplace",
    fileName: "Dimplex_Revillusion_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.dimplex.com/support/manuals",
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
    url: "https://www.dimplex.com/support/manuals",
  },

  // ============================================
  // TRAVIS INDUSTRIES (LOPI)
  // ============================================
  
  {
    id: "t-001",
    brand: "Travis Industries",
    model: "LW1100",
    type: "Lopi Wood Fireplace",
    fileName: "Travis_LW1100_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: "https://www.lopi.com/support/manuals",
  },
  {
    id: "t-002",
    brand: "Travis Industries",
    model: "Lopi",
    type: "Gas Fireplace Insert",
    fileName: "Travis_Lopi_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Insert",
    url: "https://www.lopi.com/support/manuals",
  },
  {
    id: "t-003",
    brand: "Travis Industries",
    model: "Apex",
    type: "Modern Gas Fireplace",
    fileName: "Travis_Apex_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.lopi.com/support/manuals",
  },

  // ============================================
  // QUADRA-FIRE
  // ============================================
  
  {
    id: "q-001",
    brand: "Quadra-Fire",
    model: "Santa Fe",
    type: "Wood Fireplace",
    fileName: "Quadra_SantaFe_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: "https://www.quadrafire.com/support/manuals",
  },
  {
    id: "q-002",
    brand: "Quadra-Fire",
    model: "Explorer",
    type: "Gas Fireplace",
    fileName: "Quadra_Explorer_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.quadrafire.com/support/manuals",
  },
  {
    id: "q-003",
    brand: "Quadra-Fire",
    model: "Denali",
    type: "Large Wood Fireplace",
    fileName: "Quadra_Denali_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: "https://www.quadrafire.com/support/manuals",
  },

  // ============================================
  // HARMAN
  // ============================================
  
  {
    id: "h-001",
    brand: "Harman",
    model: "P68",
    type: "Pellet Fireplace",
    fileName: "Harman_P68_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Pellet",
    url: "https://www.harmanstoves.com/support/manuals",
  },
  {
    id: "h-002",
    brand: "Harman",
    model: "Trophy",
    type: "Pellet Fireplace",
    fileName: "Harman_Trophy_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Pellet",
    url: "https://www.harmanstoves.com/support/manuals",
  },
  {
    id: "h-003",
    brand: "Harman",
    model: "Advance",
    type: "Advanced Pellet Fireplace",
    fileName: "Harman_Advance_Manual.pdf",
    pages: 52,
    uploadDate: "2025-02-26",
    category: "Pellet",
    url: "https://www.harmanstoves.com/support/manuals",
  },

  // ============================================
  // BUCK STOVE
  // ============================================
  
  {
    id: "bs-001",
    brand: "Buck Stove",
    model: "Model 20",
    type: "Wood Burning Stove",
    fileName: "Buck_Model20_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Wood Stove",
    url: "https://www.buckstove.com/manuals",
  },
  {
    id: "bs-002",
    brand: "Buck Stove",
    model: "Model 24",
    type: "Wood Burning Stove",
    fileName: "Buck_Model24_Manual.pdf",
    pages: 22,
    uploadDate: "2025-02-26",
    category: "Wood Stove",
    url: "https://www.buckstove.com/manuals",
  },
  {
    id: "bs-003",
    brand: "Buck Stove",
    model: "Model 27",
    type: "Large Wood Burning Stove",
    fileName: "Buck_Model27_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Wood Stove",
    url: "https://www.buckstove.com/manuals",
  },
  {
    id: "bs-004",
    brand: "Buck Stove",
    model: "Model 91",
    type: "Gas Stove",
    fileName: "Buck_Model91_Manual.pdf",
    pages: 18,
    uploadDate: "2025-02-26",
    category: "Gas Stove",
    url: "https://www.buckstove.com/manuals",
  },

  // ============================================
  // PACIFIC ENERGY
  // ============================================
  
  {
    id: "pe-001",
    brand: "Pacific Energy",
    model: "Alderlea",
    type: "Wood Stove",
    fileName: "Pacific_Alderlea_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Wood Stove",
    url: "https://www.pacificenergy.net/support/manuals",
  },
  {
    id: "pe-002",
    brand: "Pacific Energy",
    model: "Summit",
    type: "High Efficiency Wood Stove",
    fileName: "Pacific_Summit_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Wood Stove",
    url: "https://www.pacificenergy.net/support/manuals",
  },
  {
    id: "pe-003",
    brand: "Pacific Energy",
    model: "Fireview",
    type: "Wood Stove with View",
    fileName: "Pacific_Fireview_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Wood Stove",
    url: "https://www.pacificenergy.net/support/manuals",
  },

  // ============================================
  // SBI (Enerzone, Drolet)
  // ============================================
  
  {
    id: "sbi-001",
    brand: "Enerzone",
    model: "Solution",
    type: "Wood Fireplace",
    fileName: "Enerzone_Solution_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: "https://www.enerzone.ca/support/manuals",
  },
  {
    id: "sbi-002",
    brand: "Drolet",
    model: "Escape",
    type: "Wood Insert",
    fileName: "Drolet_Escape_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Insert",
    url: "https://www.drolet.ca/en/support/manuals",
  },
  {
    id: "sbi-003",
    brand: "Flexiheat",
    model: "Aurora",
    type: "Gas Fireplace",
    fileName: "Flexiheat_Aurora_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.flexiheat.ca/manuals",
  },

  // ============================================
  // MONT
  // ============================================
  
  {
    id: "mont-001",
    brand: "Mont",
    model: "Deluxe",
    type: "Direct Vent Fireplace",
    fileName: "Mont_Deluxe_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.montfireplaces.com/support/manuals",
  },
  {
    id: "mont-002",
    brand: "Mont",
    model: "Enchantment",
    type: "Linear Fireplace",
    fileName: "Mont_Enchantment_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.montfireplaces.com/support/manuals",
  },
  {
    id: "mont-003",
    brand: "Mont",
    model: "Excalibur",
    type: "Premium Fireplace",
    fileName: "Mont_Excalibur_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.montfireplaces.com/support/manuals",
  },

  // ============================================
  // EMPIRE
  // ============================================
  
  {
    id: "emp-001",
    brand: "Empire",
    model: "Vail",
    type: "Direct Vent Fireplace",
    fileName: "Empire_Vail_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.empirecomfort.com/manuals",
  },
  {
    id: "emp-002",
    brand: "Empire",
    model: "Alta",
    type: "Linear Fireplace",
    fileName: "Empire_Alta_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.empirecomfort.com/manuals",
  },
  {
    id: "emp-003",
    brand: "Empire",
    model: "DVC",
    type: "Direct Vent Counterflow",
    fileName: "Empire_DVC_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.empirecomfort.com/manuals",
  },
  {
    id: "emp-004",
    brand: "Empire",
    model: "Palisade",
    type: "Large Linear Fireplace",
    fileName: "Empire_Palisade_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.empirecomfort.com/manuals",
  },

  // ============================================
  // SIMPLIFIRE
  // ============================================
  
  {
    id: "sf-001",
    brand: "SimpliFire",
    model: "Allusion",
    type: "Electric Fireplace",
    fileName: "SimpliFire_Allusion_Manual.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.simplifire.com/support/manuals",
  },
  {
    id: "sf-002",
    brand: "SimpliFire",
    model: "Scorpius",
    type: "Plasma Fireplace",
    fileName: "SimpliFire_Scorpius_Manual.pdf",
    pages: 18,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.simplifire.com/support/manuals",
  },
  {
    id: "sf-003",
    brand: "SimpliFire",
    model: "Vortex",
    type: "Linear Electric",
    fileName: "SimpliFire_Vortex_Manual.pdf",
    pages: 22,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.simplifire.com/support/manuals",
  },
  {
    id: "sf-004",
    brand: "SimpliFire",
    model: "Motion",
    type: "Wall Mount Fireplace",
    fileName: "SimpliFire_Motion_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.simplifire.com/support/manuals",
  },

  // ============================================
  // MODERN FLAMES
  // ============================================
  
  {
    id: "mf-001",
    brand: "Modern Flames",
    model: "Aurora",
    type: "Modern Linear Fireplace",
    fileName: "ModernFlames_Aurora_Manual.pdf",
    pages: 26,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.modernflames.com/manuals",
  },
  {
    id: "mf-002",
    brand: "Modern Flames",
    model: "Landscape Pro",
    type: "Landscape Series",
    fileName: "ModernFlames_LandscapePro_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: "https://www.modernflames.com/manuals",
  },
  {
    id: "mf-003",
    brand: "Modern Flames",
    model: "Wildland",
    type: "Outdoor Fireplace",
    fileName: "ModernFlames_Wildland_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Outdoor",
    url: "https://www.modernflames.com/manuals",
  },

  // ============================================
  // AMERICAN FIREGLASS
  // ============================================
  
  {
    id: "afg-001",
    brand: "American Fireglass",
    model: "Burner Systems",
    type: "Glass Fireplace Burner",
    fileName: "AFG_BurnerSystems_Manual.pdf",
    pages: 12,
    uploadDate: "2025-02-26",
    category: "Burner",
    url: "https://www.americanfireglass.com/manuals",
  },
  {
    id: "afg-002",
    brand: "American Fireglass",
    model: "Fireballs",
    type: "Decorative Fire Media",
    fileName: "AFG_Fireballs_Manual.pdf",
    pages: 8,
    uploadDate: "2025-02-26",
    category: "Accessories",
    url: "https://www.americanfireglass.com/manuals",
  },
  {
    id: "afg-003",
    brand: "American Fireglass",
    model: "Fireplace Logs",
    type: "Ceramic Fiber Logs",
    fileName: "AFG_FireplaceLogs_Manual.pdf",
    pages: 10,
    uploadDate: "2025-02-26",
    category: "Accessories",
    url: "https://www.americanfireglass.com/manuals",
  },

  // ============================================
  // RINNAI
  // ============================================
  
  {
    id: "rinnai-001",
    brand: "Rinnai",
    model: "Enclaves",
    type: "Direct Vent Fireplace",
    fileName: "Rinnai_Enclaves_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.rinnai.us/fireplaces/support",
  },
  {
    id: "rinnai-002",
    brand: "Rinnai",
    model: "EnergySaver",
    type: "Direct Vent Heater",
    fileName: "Rinnai_EnergySaver_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.rinnai.us/fireplaces/support",
  },
  {
    id: "rinnai-003",
    brand: "Rinnai",
    model: "Contour",
    type: "Modern Linear Fireplace",
    fileName: "Rinnai_Contour_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.rinnai.us/fireplaces/support",
  },

  // ============================================
  // LENNOX
  // ============================================
  
  {
    id: "lennox-001",
    brand: "Lennox",
    model: "Merritt",
    type: "Direct Vent Fireplace",
    fileName: "Lennox_Merritt_Manual.pdf",
    pages: 38,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.lennoxhearthproducts.com/support/manuals",
  },
  {
    id: "lennox-002",
    brand: "Lennox",
    model: "Brockway",
    type: "Corner Fireplace",
    fileName: "Lennox_Brockway_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.lennoxhearthproducts.com/support/manuals",
  },
  {
    id: "lennox-003",
    brand: "Lennox",
    model: "Whitby",
    type: "See-Through Fireplace",
    fileName: "Lennox_Whitby_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.lennoxhearthproducts.com/support/manuals",
  },

  // ============================================
  // SUPERIOR
  // ============================================
  
  {
    id: "sup-001",
    brand: "Superior",
    model: "DRT",
    type: "Direct Vent Fireplace",
    fileName: "Superior_DRT_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.superiorfireplace.us/support/manuals",
  },
  {
    id: "sup-002",
    brand: "Superior",
    model: "DRL",
    type: "Linear Fireplace",
    fileName: "Superior_DRL_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.superiorfireplace.us/support/manuals",
  },
  {
    id: "sup-003",
    brand: "Superior",
    model: "XTR",
    type: "Extreme Performance",
    fileName: "Superior_XTR_Manual.pdf",
    pages: 42,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.superiorfireplace.us/support/manuals",
  },

  // ============================================
  // KOZY HEAT
  // ============================================
  
  {
    id: "kh-001",
    brand: "Kozy Heat",
    model: "Taylor",
    type: "Direct Vent Fireplace",
    fileName: "KozyHeat_Taylor_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.kozyheat.com/support/manuals",
  },
  {
    id: "kh-002",
    brand: "Kozy Heat",
    model: "Spartan",
    type: "Linear Fireplace",
    fileName: "KozyHeat_Spartan_Manual.pdf",
    pages: 34,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.kozyheat.com/support/manuals",
  },
  {
    id: "kh-003",
    brand: "Kozy Heat",
    model: "Bayport",
    type: "Traditional Fireplace",
    fileName: "KozyHeat_Bayport_Manual.pdf",
    pages: 30,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://www.kozyheat.com/support/manuals",
  },
];

export interface Manual {
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

// GET /api/manuals - Get all manuals or filter by search
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase();
  const brand = searchParams.get("brand");
  const category = searchParams.get("category");

  let filtered = [...manuals];

  if (search) {
    filtered = filtered.filter(
      (m) =>
        m.brand.toLowerCase().includes(search) ||
        m.model.toLowerCase().includes(search) ||
        m.type.toLowerCase().includes(search)
    );
  }

  if (brand) {
    filtered = filtered.filter((m) => m.brand === brand);
  }

  if (category) {
    filtered = filtered.filter((m) => m.category === category);
  }

  return NextResponse.json(filtered);
}

// POST /api/manuals - Add a new manual
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newManual: Manual = {
      id: `m-${Date.now()}`,
      brand: body.brand,
      model: body.model,
      type: body.type || "",
      fileName: body.fileName || "",
      pages: body.pages || 0,
      uploadDate: new Date().toISOString().split("T")[0],
      category: body.category || "General",
      url: body.url || "",
    };

    manuals.push(newManual);
    return NextResponse.json(newManual, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// PUT /api/manuals - Update a manual
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const index = manuals.findIndex((m) => m.id === body.id);

    if (index === -1) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    manuals[index] = { ...manuals[index], ...body };
    return NextResponse.json(manuals[index]);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// DELETE /api/manuals - Delete a manual
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Manual ID required" }, { status: 400 });
  }

  const index = manuals.findIndex((m) => m.id === id);

  if (index === -1) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  manuals.splice(index, 1);
  return NextResponse.json({ success: true });
}
