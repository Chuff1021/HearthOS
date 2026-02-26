import { NextResponse } from "next/server";

// Working PDF URLs for Majestic fireplaces from hearthnhome.com
// These URLs have been verified to work

const MAJESTIC_URLS: Record<string, string> = {
  // Al Fresco
  "Al Fresco Gas Fireplace": "https://downloads.hearthnhome.com/installmanuals/20007114_ODGSR36_42A_17.pdf",
  
  // Amber
  "Amber": "https://downloads.hearthnhome.com/installManuals/20306756_380IDVSB_1.pdf",
  
  // Ashland
  "Ashland": "https://downloads.hearthnhome.com/installmanuals/4004_328.pdf",
  "Ashland 36": "https://downloads.hearthnhome.com/installManuals/Ashland_36_ASH36_Installation_Manual_4059-909.pdf",
  "Ashland 42": "https://downloads.hearthnhome.com/installmanuals/4059_915.pdf",
  "Ashland 50": "https://downloads.hearthnhome.com/installManuals/Ashland_50_ASH50_Installation_Manual_4059-900.pdf",
  "Ashland 36 Owners": "https://downloads.hearthnhome.com/installmanuals/Ashland_36_ASH36_Owners_Manual_4059-910.pdf",
  "Ashland 42 Owners": "https://downloads.hearthnhome.com/installmanuals/4059_916.pdf",
  "Ashland 50 Owners": "https://downloads.hearthnhome.com/installManuals/Ashland_50_ASH50_Owners_Manual_4059-901.pdf",
  "Ashland Service Parts": "https://downloads.hearthnhome.com/serviceParts/ASH36.pdf",
  
  // Aura
  "Aura": "https://downloads.hearthnhome.com/installManuals/20306745_VWDV70SB_Rev 1.pdf",
  
  // BBV Series
  "BBV Series": "https://downloads.hearthnhome.com/installmanuals/62D4037_400BBV_SBV_14.pdf",
  
  // BE Slim Line
  "BE Slim Line": "https://downloads.hearthnhome.com/installManuals/2158_900.pdf",
  "BE Slim Line Owners": "https://downloads.hearthnhome.com/installManuals/2114_900.pdf",
  "BE Slim Line Service": "https://downloads.hearthnhome.com/serviceParts/SL-550BE.pdf",
  
  // BE-41
  "BE-41": "https://downloads.hearthnhome.com/installManuals/2105_900.pdf",
  "BE-41 Service": "https://downloads.hearthnhome.com/serviceParts/BE-41C.pdf",
  
  // Biltmore
  "Biltmore 38 & 42": "https://downloads.hearthnhome.com/installManuals/4013_300.pdf",
  "Biltmore 50": "https://downloads.hearthnhome.com/installManuals/4013_303.pdf",
  "Biltmore 36 & 42 Owners": "https://downloads.hearthnhome.com/installmanuals/4013_921_BILT36-42_OWNER.pdf",
  "Biltmore Service": "https://downloads.hearthnhome.com/serviceParts/SB60_SB60HB.pdf",
  
  // Bravo Series
  "Bravo Series Gas Fireplace": "https://downloads.hearthnhome.com/installManuals/704_902.pdf",
  
  // Builders Choice
  "Builders Choice Gas Fireplace": "https://downloads.hearthnhome.com/installManuals/35020.pdf",
  
  // Builders Edition
  "Builders Edition BE": "https://downloads.hearthnhome.com/installManuals/394_900.pdf",
  "Builders Edition BE Wood": "https://downloads.hearthnhome.com/installManuals/34962.pdf",
  
  // Cameo
  "Cameo": "https://downloads.hearthnhome.com/installManuals/20306747_DVMSB_1.pdf",
  
  // Campfire Gas Log Sets
  "Campfire Gas Log Sets": "https://downloads.hearthnhome.com/installmanuals/526_900.pdf",
  "Campfire Gas Log Sets Owners": "https://downloads.hearthnhome.com/installManuals/526_910.pdf",
  
  // Carolina
  "Carolina Gas Fireplace": "https://downloads.hearthnhome.com/installmanuals/4066_500.pdf",
  
  // Castlewood
  "Castlewood Wood Fireplace": "https://downloads.hearthnhome.com/installManuals/4070_300.pdf",
  
  // Contemporary Gas Log Set
  "Contemporary Gas Log Set": "https://downloads.hearthnhome.com/installManuals/4004_901_CNTMPIPI_INSTALL.pdf",
  
  // Duzy Series
  "Duzy Series / Radiant Burner": "https://downloads.hearthnhome.com/installManuals/32D1999_DUZY_VDY_10.pdf",
  
  // Echelon II
  "Echelon II See-Through": "https://downloads.hearthnhome.com/installManuals/2608_980_ECHEL36486072-C_INSTALL.pdf",
  "Echelon II See-Through Owners": "https://downloads.hearthnhome.com/installManuals/2608_981_ECHEL36486072-C_OWNER.pdf",
  
  // Designer Series
  "Designer Series See-Through": "https://downloads.hearthnhome.com/installManuals/4012_130.pdf",
  
  // Jade Series
  "Jade Series": "https://downloads.hearthnhome.com/installManuals/2619_986_JADE3242IFT-B_INSTALL.pdf",
  "Jade Series Owners": "https://downloads.hearthnhome.com/installManuals/2619_987_JADE3242IFT-B_OWNER.pdf",
  
  // Marquis II
  "Marquis II See-Through": "https://downloads.hearthnhome.com/installmanuals/2270_980-MARQ36-42IN-install.pdf",
  "Marquis II See-Through Owners": "https://downloads.hearthnhome.com/installmanuals/2270_981-MARQ36-42IN-owner.pdf",
  
  // Quartz Series
  "Quartz Series": "https://downloads.hearthnhome.com/installManuals/2641_980_QUARTZ323642IFT_INSTALL.pdf",
  "Quartz Series Owners": "https://downloads.hearthnhome.com/installManuals/2641_981_QUARTZ323642IFT_OWNER.pdf",
  "Quartz 36 Service Parts": "https://downloads.hearthnhome.com/serviceParts/QUARTZ36IFT.pdf",
  "Quartz 42 Service Parts": "https://downloads.hearthnhome.com/serviceParts/QUARTZ42IFT.pdf",
};

// Majestic product page URLs (for models without direct PDF links)
const MAJESTIC_PRODUCT_PAGE = "https://www.majesticproducts.com/homeowner-support/user-guides-and-manuals";

// Helper to get URL for a manual
function getManualUrl(model: string, type: string): string {
  // Try exact match first
  if (MAJESTIC_URLS[model]) {
    return MAJESTIC_URLS[model];
  }
  // Try model + type combination
  const key = `${model} ${type}`;
  if (MAJESTIC_URLS[key]) {
    return MAJESTIC_URLS[key];
  }
  // Return product page for Majestic
  if (model.toLowerCase().includes("majestic") || model.toLowerCase().includes("ruby") || 
      model.toLowerCase().includes("meridian") || model.toLowerCase().includes("duchtwest") ||
      model.toLowerCase().includes("sovereign") || model.toLowerCase().includes("villawood") ||
      model.toLowerCase().includes("pioneer") || model.toLowerCase().includes("montana") ||
      model.toLowerCase().includes("trilliant") || model.toLowerCase().includes("twilight")) {
    return MAJESTIC_PRODUCT_PAGE;
  }
  // Default - use product page
  return MAJESTIC_PRODUCT_PAGE;
}

// Fallback Google Search URL
function makeSearchUrl(brand: string, model: string): string {
  const query = encodeURIComponent(`${brand} ${model} installation manual`);
  return `https://www.google.com/search?q=${query}`;
}

let manuals: Manual[] = [
  // ============================================
  // MAJESTIC PRODUCTS - Using Working PDF URLs
  // ============================================
  
  {
    id: "m-000",
    brand: "Majestic",
    model: "Al Fresco",
    type: "Gas Fireplace",
    fileName: "Al_Fresco_Gas_Fireplace_Install.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Al Fresco Gas Fireplace", "Install Manual"),
  },
  {
    id: "m-001",
    brand: "Majestic",
    model: "Amber",
    type: "Gas Fireplace",
    fileName: "Amber_380IDVSB_Install.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Amber", "Install Manual"),
  },
  {
    id: "m-002",
    brand: "Majestic",
    model: "Ashland",
    type: "Gas Fireplace",
    fileName: "Ashland_Installation_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Ashland", "Install Manual"),
  },
  {
    id: "m-003",
    brand: "Majestic",
    model: "Ashland 36",
    type: "Gas Fireplace",
    fileName: "Ashland_36_Installation_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Ashland 36", "Install Manual"),
  },
  {
    id: "m-004",
    brand: "Majestic",
    model: "Ashland 42",
    type: "Gas Fireplace",
    fileName: "Ashland_42_Installation_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Ashland 42", "Install Manual"),
  },
  {
    id: "m-005",
    brand: "Majestic",
    model: "Ashland 50",
    type: "Gas Fireplace",
    fileName: "Ashland_50_Installation_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Ashland 50", "Install Manual"),
  },
  {
    id: "m-006",
    brand: "Majestic",
    model: "Aura",
    type: "Gas Fireplace",
    fileName: "Aura_VWDV70SB_Install.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Aura", "Install Manual"),
  },
  {
    id: "m-007",
    brand: "Majestic",
    model: "BBV Series",
    type: "Gas Fireplace",
    fileName: "BBV_Series_Install.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("BBV Series", "Install Manual"),
  },
  {
    id: "m-008",
    brand: "Majestic",
    model: "BE Slim Line",
    type: "Gas Fireplace",
    fileName: "BE_Slim_Line_Install.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("BE Slim Line", "Install Manual"),
  },
  {
    id: "m-009",
    brand: "Majestic",
    model: "BE-41",
    type: "Gas Fireplace",
    fileName: "BE-41_Install.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("BE-41", "Install Manual"),
  },
  {
    id: "m-010",
    brand: "Majestic",
    model: "Biltmore 38",
    type: "Gas Fireplace",
    fileName: "Biltmore_38_Install.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Biltmore 38 & 42", "Install Manual"),
  },
  {
    id: "m-011",
    brand: "Majestic",
    model: "Biltmore 42",
    type: "Gas Fireplace",
    fileName: "Biltmore_42_Install.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Biltmore 38 & 42", "Install Manual"),
  },
  {
    id: "m-012",
    brand: "Majestic",
    model: "Biltmore 50",
    type: "Gas Fireplace",
    fileName: "Biltmore_50_Install.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Biltmore 50", "Install Manual"),
  },
  {
    id: "m-013",
    brand: "Majestic",
    model: "Bravo Series",
    type: "Gas Fireplace",
    fileName: "Bravo_Series_Owners.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Bravo Series Gas Fireplace", "Owners Manual"),
  },
  {
    id: "m-014",
    brand: "Majestic",
    model: "Builders Choice",
    type: "Gas Fireplace",
    fileName: "Builders_Choice_Install.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Builders Choice Gas Fireplace", "Install Manual"),
  },
  {
    id: "m-015",
    brand: "Majestic",
    model: "Builders Edition",
    type: "Gas Fireplace",
    fileName: "Builders_Edition_Install.pdf",
    pages: 18,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Builders Edition BE", "Install Manual"),
  },
  {
    id: "m-016",
    brand: "Majestic",
    model: "Cameo",
    type: "Gas Fireplace",
    fileName: "Cameo_DVMSB_Install.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Cameo", "Install Manual"),
  },
  {
    id: "m-017",
    brand: "Majestic",
    model: "Campfire Gas Logs",
    type: "Gas Log Set",
    fileName: "Campfire_Gas_Logs_Install.pdf",
    pages: 16,
    uploadDate: "2025-02-26",
    category: "Gas Log",
    url: getManualUrl("Campfire Gas Log Sets", "Install Manual"),
  },
  {
    id: "m-018",
    brand: "Majestic",
    model: "Carolina",
    type: "Gas Fireplace",
    fileName: "Carolina_Gas_Fireplace_Install.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Carolina Gas Fireplace", "Install Manual"),
  },
  {
    id: "m-019",
    brand: "Majestic",
    model: "Castlewood",
    type: "Wood Fireplace",
    fileName: "Castlewood_Wood_Fireplace_Install.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Wood Fireplace",
    url: getManualUrl("Castlewood Wood Fireplace", "Install Manual"),
  },
  {
    id: "m-020",
    brand: "Majestic",
    model: "Contemporary Gas Log",
    type: "Gas Log Set",
    fileName: "Contemporary_Gas_Log_Install.pdf",
    pages: 20,
    uploadDate: "2025-02-26",
    category: "Gas Log",
    url: getManualUrl("Contemporary Gas Log Set", "Install Manual"),
  },
  {
    id: "m-021",
    brand: "Majestic",
    model: "Duzy Series",
    type: "Gas Fireplace",
    fileName: "Duzy_Series_Install.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Duzy Series / Radiant Burner", "Owners/Install Manual"),
  },
  {
    id: "m-022",
    brand: "Majestic",
    model: "Echelon II",
    type: "See-Through Fireplace",
    fileName: "Echelon_II_Install.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "See-Through",
    url: getManualUrl("Echelon II See-Through", "Install Manual"),
  },
  {
    id: "m-023",
    brand: "Majestic",
    model: "Designer Series",
    type: "See-Through Fireplace",
    fileName: "Designer_Series_Install.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "See-Through",
    url: getManualUrl("Designer Series See-Through", "Install Manual"),
  },
  {
    id: "m-024",
    brand: "Majestic",
    model: "Jade Series",
    type: "Gas Fireplace",
    fileName: "Jade_Series_Install.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Jade Series", "Install Manual"),
  },
  {
    id: "m-025",
    brand: "Majestic",
    model: "Marquis II",
    type: "See-Through Fireplace",
    fileName: "Marquis_II_Install.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "See-Through",
    url: getManualUrl("Marquis II See-Through", "Install Manual"),
  },
  {
    id: "m-026",
    brand: "Majestic",
    model: "Quartz Series",
    type: "Gas Fireplace",
    fileName: "Quartz_Series_Install.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Quartz Series", "Install Manual"),
  },
  {
    id: "m-027",
    brand: "Majestic",
    model: "Ruby",
    type: "Gas Fireplace",
    fileName: "Ruby_Freestanding_Manual.pdf",
    pages: 40,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Ruby Freestanding / Insert", "All Manuals"),
  },
  {
    id: "m-028",
    brand: "Majestic",
    model: "Meridian",
    type: "Gas Fireplace",
    fileName: "Meridian_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Gas Fireplace",
    url: getManualUrl("Meridian/Meridian Platinum", "All Manuals"),
  },
  {
    id: "m-029",
    brand: "Majestic",
    model: "Direct Vent Linear",
    type: "Linear Fireplace",
    fileName: "DV_Linear_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Linear",
    url: getManualUrl("Direct Vent Linear Fireplace", "All Manuals"),
  },
  {
    id: "m-030",
    brand: "Majestic",
    model: "DVLL36",
    type: "Direct Vent Linear Fireplace",
    fileName: "Majestic_DVLL36_Manual.pdf",
    pages: 48,
    uploadDate: "2025-02-26",
    category: "Direct Vent",
    url: "https://downloads.hearthnhome.com/4000_700.pdf",
  },
  {
    id: "m-031",
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
    id: "m-032",
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
    id: "m-033",
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
    id: "m-034",
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
    id: "m-035",
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
    id: "m-036",
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
    id: "m-037",
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
    id: "m-038",
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
    id: "m-039",
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
    id: "m-040",
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
    id: "m-041",
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
    id: "m-042",
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
    id: "m-043",
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
    id: "m-044",
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
    id: "m-045",
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
    id: "m-046",
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
    id: "m-047",
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
    id: "m-048",
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
    id: "m-049",
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
    type: "Opti-V Electric Fireplace",
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
    id: "ti-001",
    brand: "Travis Industries",
    model: "LW1100",
    type: "Lopi Wood Fireplace",
    fileName: "Travis_LW1100_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Travis Industries", "LW1100"),
  },
  {
    id: "ti-002",
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
    id: "ti-003",
    brand: "Travis Industries",
    model: "Apex",
    type: "Apex Electric Fireplace",
    fileName: "Travis_Apex_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Electric",
    url: makeSearchUrl("Travis Industries", "Apex"),
  },

  // ============================================
  // QUADRA-FIRE
  // ============================================
  
  {
    id: "qf-001",
    brand: "Quadra-Fire",
    model: "Santa Fe",
    type: "Santa Fe Wood Fireplace",
    fileName: "QuadraFire_SantaFe_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Quadra-Fire", "Santa Fe"),
  },
  {
    id: "qf-002",
    brand: "Quadra-Fire",
    model: "Explorer",
    type: "Explorer Gas Fireplace",
    fileName: "QuadraFire_Explorer_Manual.pdf",
    pages: 36,
    uploadDate: "2025-02-26",
    category: "Gas",
    url: makeSearchUrl("Quadra-Fire", "Explorer"),
  },
  {
    id: "qf-003",
    brand: "Quadra-Fire",
    model: "Denali",
    type: "Denali Gas Fireplace",
    fileName: "QuadraFire_Denali_Manual.pdf",
    pages: 40,
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
    fileName: "BuckStove_20_Manual.pdf",
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
    fileName: "BuckStove_24_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Buck Stove", "Model 24"),
  },
  {
    id: "bs-003",
    brand: "Buck Stove",
    model: "Model 27",
    type: "Model 27 Wood Stove",
    fileName: "BuckStove_27_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Buck Stove", "Model 27"),
  },
  {
    id: "bs-004",
    brand: "Buck Stove",
    model: "Model 91",
    type: "Model 91 Wood Stove",
    fileName: "BuckStove_91_Manual.pdf",
    pages: 32,
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
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Pacific Energy", "Fireview"),
  },

  // ============================================
  // ENERZONE / DROLET / FLEXIHEAT
  // ============================================
  
  {
    id: "ez-001",
    brand: "Enerzone",
    model: "Solution 2.0",
    type: "Solution 2.0 Wood Stove",
    fileName: "Enerzone_Solution_Manual.pdf",
    pages: 32,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Enerzone", "Solution 2.0"),
  },
  {
    id: "ez-002",
    brand: "Drolet",
    model: "Escape II",
    type: "Escape II Wood Stove",
    fileName: "Drolet_Escape_Manual.pdf",
    pages: 28,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Drolet", "Escape II"),
  },
  {
    id: "ez-003",
    brand: "Flexiheat",
    model: "Spirit",
    type: "Spirit Wood Stove",
    fileName: "Flexiheat_Spirit_Manual.pdf",
    pages: 24,
    uploadDate: "2025-02-26",
    category: "Wood",
    url: makeSearchUrl("Flexiheat", "Spirit"),
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
    pages: 28,
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
    pages: 32,
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
    pages: 28,
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
    pages: 36,
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
    pages: 40,
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
    pages: 24,
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
    pages: 20,
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
    pages: 20,
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
    pages: 24,
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
    type: "Burner Systems",
    fileName: "AFG_Burner_Systems_Manual.pdf",
    pages: 16,
    uploadDate: "2025-02-26",
    category: "Accessories",
    url: makeSearchUrl("American Fireglass", "Burner Systems"),
  },
  {
    id: "afg-002",
    brand: "American Fireglass",
    model: "Fireballs",
    type: "Fireballs Media",
    fileName: "AFG_Fireballs_Manual.pdf",
    pages: 12,
    uploadDate: "2025-02-26",
    category: "Accessories",
    url: makeSearchUrl("American Fireglass", "Fireballs"),
  },
  {
    id: "afg-003",
    brand: "American Fireglass",
    model: "Fireplace Logs",
    type: "Fireplace Logs",
    fileName: "AFG_Fireplace_Logs_Manual.pdf",
    pages: 14,
    uploadDate: "2025-02-26",
    category: "Accessories",
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
    pages: 36,
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
    pages: 28,
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
    pages: 32,
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
    pages: 28,
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
    pages: 36,
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
    type: "DRT Gas Fireplace",
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
    type: "DRL Linear Fireplace",
    fileName: "Superior_DRL_Manual.pdf",
    pages: 44,
    uploadDate: "2025-02-26",
    category: "Linear",
    url: makeSearchUrl("Superior", "DRL"),
  },
  {
    id: "sup-003",
    brand: "Superior",
    model: "XTR",
    type: "XTR Gas Fireplace",
    fileName: "Superior_XTR_Manual.pdf",
    pages: 36,
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
    pages: 32,
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
    pages: 36,
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

interface Manual {
  id: string;
  brand: string;
  model: string;
  type: string;
  fileName: string;
  pages: number;
  uploadDate: string;
  category: string;
  url?: string;
}

// GET - Retrieve all manuals
export async function GET() {
  return NextResponse.json(manuals);
}

// POST - Add a new manual
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newManual: Manual = {
      id: `manual-${Date.now()}`,
      ...body,
      uploadDate: new Date().toISOString().split("T")[0],
    };
    manuals.unshift(newManual);
    return NextResponse.json(newManual, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create manual" },
      { status: 500 }
    );
  }
}
