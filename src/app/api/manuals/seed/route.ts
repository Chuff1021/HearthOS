import { NextResponse } from "next/server";
import postgres from "postgres";

const MANUAL_LIBRARY = [
  { brand: "Lopi", model: "Answer Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508034.pdf", pages: 20 },
  { brand: "Lopi", model: "Answer Premier Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508038.pdf", pages: 20 },
  { brand: "Lopi", model: "Premiere Answer Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508035.pdf", pages: 20 },
  { brand: "Lopi", model: "Answer-95 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508036.pdf", pages: 20 },
  { brand: "Lopi", model: "Answer (NT) Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508131.pdf", pages: 20 },
  { brand: "Lopi", model: "Patriot Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508039.pdf", pages: 24 },
  { brand: "Lopi", model: "Parlor (ND) Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/100-01141.pdf", pages: 24 },
  { brand: "Lopi", model: "1250 Wood Stove Republic", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/100-01432.pdf", pages: 24 },
  { brand: "Lopi", model: "380 or M380 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508000.pdf", pages: 16 },
  { brand: "Lopi", model: "380T Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508001.pdf", pages: 16 },
  { brand: "Lopi", model: "380/440 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508002.pdf", pages: 16 },
  { brand: "Lopi", model: "380-96 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508004.pdf", pages: 16 },
  { brand: "Lopi", model: "Endeavor (380 NT) Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508005.pdf", pages: 20 },
  { brand: "Lopi", model: "440 / M440 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508006.pdf", pages: 16 },
  { brand: "Lopi", model: "440T Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508007.pdf", pages: 16 },
  { brand: "Lopi", model: "440 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508008.pdf", pages: 16 },
  { brand: "Lopi", model: "1750 Wood Stove Republic", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/100-01433.pdf", pages: 24 },
  { brand: "Lopi", model: "Sheffield Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508129.pdf", pages: 20 },
  { brand: "Lopi", model: "Leyden Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/100-01177_005.pdf", pages: 24 },
  { brand: "Lopi", model: "Elan Wood FS/Ins", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508040.pdf", pages: 20 },
  { brand: "Lopi", model: "Elan Wood FS", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508047.pdf", pages: 20 },
  { brand: "Lopi", model: "Elan-96 Wood FS", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508045.pdf", pages: 20 },
  { brand: "Lopi", model: "520 or M520 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508000.pdf", pages: 16 },
  { brand: "Lopi", model: "520-96 Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508012.pdf", pages: 16 },
  { brand: "Lopi", model: "Liberty Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/93508013.pdf", pages: 20 },
  { brand: "Lopi", model: "Liberty Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.travisindustries.com/Docs/100-01337.pdf", pages: 20 },
  { brand: "Lopi", model: "Rockport Wood Stove", type: "Owners Manual", category: "Wood Stove", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 24 },
  { brand: "Lopi", model: "1250-I Wood Insert Republic", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/100-01434.pdf", pages: 24 },
  { brand: "Lopi", model: "X or SX Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508014.pdf", pages: 16 },
  { brand: "Lopi", model: "X-88 Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508031.pdf", pages: 16 },
  { brand: "Lopi", model: "X-96 Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508032.pdf", pages: 16 },
  { brand: "Lopi", model: "Revere (X-NT) Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508132.pdf", pages: 20 },
  { brand: "Lopi", model: "Flex Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508018.pdf", pages: 16 },
  { brand: "Lopi", model: "Freedom Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508020.pdf", pages: 20 },
  { brand: "Lopi", model: "Freedom Bay (ND) Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/100-01163.pdf", pages: 20 },
  { brand: "Lopi", model: "Flush Bay Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508025.pdf", pages: 16 },
  { brand: "Lopi", model: "1750-I Wood Insert Republic", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/100-01435.pdf", pages: 24 },
  { brand: "Lopi", model: "Freedom Bay Wood Insert", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/93508026.pdf", pages: 20 },
  { brand: "Lopi", model: "Flush Wood Insert Declaration", type: "Owners Manual", category: "Wood Insert", url: "https://www.travisindustries.com/Docs/100-01157.pdf", pages: 24 },
  { brand: "Lopi", model: "Medium Flush NexGen-Fyre Wood Insert Arch/Rect", type: "Owners Manual", category: "Wood Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 28 },
  { brand: "Lopi", model: "Large Flush NexGen-Fyre Wood Insert Arch/Rect", type: "Owners Manual", category: "Wood Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 28 },
  { brand: "Lopi", model: "400 PS Pellet Stove", type: "Owners Manual", category: "Pellet Stove", url: "https://www.travisindustries.com/Docs/93508043.pdf", pages: 20 },
  { brand: "Lopi", model: "FoxFire (400) PS Pellet Stove", type: "Owners Manual", category: "Pellet Stove", url: "https://www.travisindustries.com/Docs/93508048.pdf", pages: 20 },
  { brand: "Lopi", model: "Pioneer (Heritage) PS Pellet Stove", type: "Owners Manual", category: "Pellet Stove", url: "https://www.travisindustries.com/Docs/93508050.pdf", pages: 24 },
  { brand: "Lopi", model: "Yankee PS Pellet Stove", type: "Owners Manual", category: "Pellet Stove", url: "https://www.travisindustries.com/Docs/100-01156.pdf", pages: 24 },
  { brand: "Lopi", model: "Leyden Pellet Stove", type: "Owners Manual", category: "Pellet Stove", url: "https://www.travisindustries.com/Docs/100-01184.pdf", pages: 24 },
  { brand: "Lopi", model: "Deerfield Pellet Stove", type: "Owners Manual", category: "Pellet Stove", url: "https://www.travisindustries.com/Docs/100-01445.pdf", pages: 24 },
  { brand: "Lopi", model: "AGP Pellet Stove", type: "Owners Manual", category: "Pellet Stove", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 24 },
  { brand: "Lopi", model: "Pioneer Bay (Heritage) PI Pellet Insert", type: "Owners Manual", category: "Pellet Insert", url: "https://www.travisindustries.com/Docs/93508051.pdf", pages: 24 },
  { brand: "Lopi", model: "Yankee Bay PI Pellet Insert", type: "Owners Manual", category: "Pellet Insert", url: "https://www.travisindustries.com/Docs/100-01145.pdf", pages: 24 },
  { brand: "Lopi", model: "AGP Pellet Insert", type: "Owners Manual", category: "Pellet Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 24 },
  { brand: "Lopi", model: "DVS EmberGlo GSR2 Insert", type: "Owners/Install Manual", category: "Gas Insert", url: "https://waves-console-travis-industries-inc.s3.amazonaws.com/content/138605/100-01537.pdf", pages: 40 },
  { brand: "Lopi", model: "616 GSR Insert", type: "Owners Manual", category: "Gas Insert", url: "https://www.travisindustries.com/Docs/100-01271_000.pdf", pages: 32 },
  { brand: "Lopi", model: "864 TV 40K GSR2 Fireplace", type: "Install Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01481.pdf", pages: 40 },
  { brand: "Lopi", model: "564 GSR2 35K Deluxe Fireplace", type: "Owners Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01551.pdf", pages: 36 },
  { brand: "Lopi", model: "Berkshire Gas Stove", type: "Owners Manual", category: "Gas Stove", url: "https://www.travisindustries.com/Docs/100-01187_000.pdf", pages: 28 },
  { brand: "Lopi", model: "Berkshire GSR2 Deluxe Stove", type: "Owners Manual", category: "Gas Stove", url: "https://www.travisindustries.com/Docs/100-01440.pdf", pages: 28 },
  { brand: "Lopi", model: "Northfield GSR2 Deluxe Stove", type: "Owners Manual", category: "Gas Stove", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 28 },
  { brand: "Lopi", model: "Greenfield GSR2 Deluxe Stove", type: "Owners Manual", category: "Gas Stove", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 28 },
  { brand: "Lopi", model: "Cypress GSR2 Gas Stove", type: "Owners Manual", category: "Gas Stove", url: "https://www.travisindustries.com/Docs/100-01444.pdf", pages: 28 },
  { brand: "Lopi", model: "430 EmberGlo Insert", type: "Owners Manual", category: "Gas Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 32 },
  { brand: "Lopi", model: "616 EmberGlo Insert", type: "Owners Manual", category: "Gas Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 32 },
  { brand: "Lopi", model: "Radiant GSB2 Medium/Large Gas Insert", type: "Owners Manual", category: "Gas Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 32 },
  { brand: "Lopi", model: "864 GSR2 Fireplace 40K/31K CF", type: "Owners Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01501.pdf", pages: 40 },
  { brand: "Lopi", model: "3615 HO GSR2 Fireplace", type: "Install Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01372.pdf", pages: 44 },
  { brand: "Lopi", model: "4237 Fireplace", type: "Install Manual", category: "Gas Fireplace", url: "https://www.travisdealer.com/TechnicalNotices/100-01406.pdf", pages: 40 },
  { brand: "Majestic", model: "Al Fresco", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installmanuals/20007114_ODGSR36_42A_17.pdf", pages: 24 },
  { brand: "Majestic", model: "Amber", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/20306756_380IDVSB_1.pdf", pages: 20 },
  { brand: "Majestic", model: "Ashland", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installmanuals/4004_328.pdf", pages: 32 },
  { brand: "Majestic", model: "Ashland 36", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/Ashland_36_ASH36_Installation_Manual_4059-909.pdf", pages: 36 },
  { brand: "Majestic", model: "Ashland 42", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installmanuals/4059_915.pdf", pages: 40 },
  { brand: "Majestic", model: "Ashland 50", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/Ashland_50_ASH50_Installation_Manual_4059-900.pdf", pages: 44 },
  { brand: "Majestic", model: "Aura", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/20306745_VWDV70SB_Rev 1.pdf", pages: 28 },
  { brand: "Majestic", model: "BBV Series", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installmanuals/62D4037_400BBV_SBV_14.pdf", pages: 32 },
  { brand: "Majestic", model: "BE Slim Line", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/2158_900.pdf", pages: 24 },
  { brand: "Majestic", model: "BE-41", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/2105_900.pdf", pages: 20 },
  { brand: "Majestic", model: "Biltmore 38", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/4013_300.pdf", pages: 28 },
  { brand: "Majestic", model: "Biltmore 42", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/4013_300.pdf", pages: 28 },
  { brand: "Majestic", model: "Biltmore 50", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/4013_303.pdf", pages: 32 },
  { brand: "Majestic", model: "Bravo Series", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/704_902.pdf", pages: 24 },
  { brand: "Majestic", model: "Builders Choice", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/35020.pdf", pages: 20 },
  { brand: "Majestic", model: "Builders Edition", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/394_900.pdf", pages: 18 },
  { brand: "Majestic", model: "Cameo", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://downloads.hearthnhome.com/installManuals/20306747_DVMSB_1.pdf", pages: 24 },
  { brand: "Majestic", model: "Campfire Gas Logs", type: "Gas Log Set", category: "Gas Log", url: "https://downloads.hearthnhome.com/installmanuals/526_900.pdf", pages: 16 },
  { brand: "Majestic", model: "Carolina", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Carolina+Gas+Fireplace+installation+manual", pages: 32 },
  { brand: "Majestic", model: "Castlewood", type: "Wood Fireplace", category: "Wood Fireplace", url: "https://www.google.com/search?q=Majestic+Castlewood+Wood+Fireplace+installation+manual", pages: 28 },
  { brand: "Majestic", model: "Contemporary Gas Log", type: "Gas Log Set", category: "Gas Log", url: "https://www.google.com/search?q=Majestic+Contemporary+Gas+Log+Set+installation+manual", pages: 20 },
  { brand: "Majestic", model: "Duzy Series", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Duzy+Series+/+Radiant+Burner+installation+manual", pages: 24 },
  { brand: "Majestic", model: "Echelon II", type: "See-Through Fireplace", category: "See-Through", url: "https://www.google.com/search?q=Majestic+Echelon+II+See-Through+installation+manual", pages: 36 },
  { brand: "Majestic", model: "Designer Series", type: "See-Through Fireplace", category: "See-Through", url: "https://www.google.com/search?q=Majestic+Designer+Series+See-Through+installation+manual", pages: 32 },
  { brand: "Majestic", model: "Jade Series", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Jade+Series+installation+manual", pages: 32 },
  { brand: "Majestic", model: "Marquis II", type: "See-Through Fireplace", category: "See-Through", url: "https://www.google.com/search?q=Majestic+Marquis+II+See-Through+installation+manual", pages: 28 },
  { brand: "Majestic", model: "Quartz Series", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Quartz+Series+installation+manual", pages: 32 },
  { brand: "Majestic", model: "Ruby", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Ruby+Freestanding+/+Insert+installation+manual", pages: 40 },
  { brand: "Majestic", model: "Meridian", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Meridian/Meridian+Platinum+installation+manual", pages: 44 },
  { brand: "Majestic", model: "Direct Vent Linear", type: "Linear Fireplace", category: "Linear", url: "https://www.google.com/search?q=Majestic+Direct+Vent+Linear+Fireplace+installation+manual", pages: 48 },
  { brand: "Majestic", model: "DVLL36", type: "Direct Vent Linear Fireplace", category: "Direct Vent", url: "https://downloads.hearthnhome.com/4000_700.pdf", pages: 48 },
  { brand: "Majestic", model: "DVLL42", type: "Direct Vent Linear Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+DVLL42+installation+manual", pages: 52 },
  { brand: "Majestic", model: "DVLL54", type: "Direct Vent Linear Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+DVLL54+installation+manual", pages: 56 },
  { brand: "Majestic", model: "DVCT36", type: "Direct Vent Corner Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+DVCT36+installation+manual", pages: 44 },
  { brand: "Majestic", model: "DVCT42", type: "Direct Vent Corner Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+DVCT42+installation+manual", pages: 48 },
  { brand: "Majestic", model: "DVG36", type: "Direct Vent Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+DVG36+installation+manual", pages: 40 },
  { brand: "Majestic", model: "DVG42", type: "Direct Vent Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+DVG42+installation+manual", pages: 44 },
  { brand: "Majestic", model: "DVSL36", type: "Direct Vent Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+DVSL36+installation+manual", pages: 36 },
  { brand: "Majestic", model: "BFDV36", type: "Direct Vent Fireplace", category: "Direct Vent", url: "https://www.google.com/search?q=Majestic+BFDV36+installation+manual", pages: 40 },
  { brand: "Majestic", model: "BV36", type: "B-Vent Fireplace", category: "B-Vent", url: "https://www.google.com/search?q=Majestic+BV36+installation+manual", pages: 32 },
  { brand: "Majestic", model: "QBDM36", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+QBDM36+installation+manual", pages: 36 },
  { brand: "Majestic", model: "QCB36", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+QCB36+installation+manual", pages: 36 },
  { brand: "Majestic", model: "QCF36", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+QCF36+installation+manual", pages: 36 },
  { brand: "Majestic", model: "QLD36", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+QLD36+installation+manual", pages: 40 },
  { brand: "Majestic", model: "36BDV", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+36BDV+installation+manual", pages: 40 },
  { brand: "Majestic", model: "Avalon 36", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Avalon+installation+manual", pages: 44 },
  { brand: "Majestic", model: "Avalon 42", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Avalon+installation+manual", pages: 48 },
  { brand: "Majestic", model: "Bronze 36", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+Bronze+installation+manual", pages: 40 },
  { brand: "Majestic", model: "8000 Series", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+8000+installation+manual", pages: 52 },
  { brand: "Majestic", model: "8500 Series", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Majestic+8500+installation+manual", pages: 56 },
  { brand: "Regency", model: "F1100", type: "Gas Insert", category: "Gas Insert", url: "https://www.regency-fire.com/Product-Resources", pages: 48 },
  { brand: "Regency", model: "F5100", type: "Gas Insert", category: "Gas Insert", url: "https://www.regency-fire.com/Product-Resources", pages: 52 },
  { brand: "Regency", model: "HZ40E", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.regency-fire.com/Product-Resources", pages: 44 },
  { brand: "Regency", model: "HZ50E", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.regency-fire.com/Product-Resources", pages: 48 },
  { brand: "Regency", model: "U29", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.regency-fire.com/Product-Resources", pages: 40 },
  { brand: "Regency", model: "C3", type: "Gas Stove", category: "Gas Stove", url: "https://www.regency-fire.com/Product-Resources", pages: 36 },
  { brand: "Napoleon", model: "AS35", type: "Gas Stove", category: "Gas Stove", url: "https://www.napoleon.com/us/en/manuals/", pages: 36 },
  { brand: "Napoleon", model: "T450", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.napoleon.com/us/en/manuals/", pages: 44 },
  { brand: "Napoleon", model: "T500", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.napoleon.com/us/en/manuals/", pages: 48 },
  { brand: "Napoleon", model: "X450", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.napoleon.com/us/en/manuals/", pages: 40 },
  { brand: "Napoleon", model: "X500", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.napoleon.com/us/en/manuals/", pages: 44 },
  { brand: "Heat & Glo", model: "SLR", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.heatnglo.com/support/manuals", pages: 52 },
  { brand: "Heat & Glo", model: "SLR-II", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.heatnglo.com/support/manuals", pages: 48 },
  { brand: "Heat & Glo", model: "6000CLX", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.heatnglo.com/support/manuals", pages: 56 },
  { brand: "Heat & Glo", model: "8000CLX", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.heatnglo.com/support/manuals", pages: 60 },
  { brand: "Heat & Glo", model: "Gemini", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.heatnglo.com/support/manuals", pages: 52 },
  { brand: "Vermont Castings", model: "Defiant", type: "Wood Stove", category: "Wood Stove", url: "https://www.vermontcastings.com/support/", pages: 44 },
  { brand: "Vermont Castings", model: "Resolute", type: "Wood Stove", category: "Wood Stove", url: "https://www.vermontcastings.com/support/", pages: 40 },
  { brand: "Vermont Castings", model: "Intrepid", type: "Wood Stove", category: "Wood Stove", url: "https://www.vermontcastings.com/support/", pages: 36 },
  { brand: "Vermont Castings", model: "Majestic", type: "Wood Stove", category: "Wood Stove", url: "https://www.vermontcastings.com/support/", pages: 42 },
  { brand: "Dimplex", model: "Opti-Myst", type: "Electric Fireplace", category: "Electric", url: "https://www.dimplex.com/support/", pages: 28 },
  { brand: "Dimplex", model: "Opti-V", type: "Electric Fireplace", category: "Electric", url: "https://www.dimplex.com/support/", pages: 24 },
  { brand: "Dimplex", model: "Revillusion", type: "Electric Fireplace", category: "Electric", url: "https://www.dimplex.com/support/", pages: 32 },
  { brand: "Dimplex", model: "Linear", type: "Electric Fireplace", category: "Electric", url: "https://www.dimplex.com/support/", pages: 28 },
  { brand: "Travis Industries", model: "LW1100", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.tfirex.com/support/", pages: 48 },
  { brand: "Travis Industries", model: "Lopi", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.tfirex.com/support/", pages: 52 },
  { brand: "Travis Industries", model: "Apex", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.tfirex.com/support/", pages: 56 },
  { brand: "Quadra-Fire", model: "Santa Fe", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Quadra-Fire+Santa+Fe+installation+manual", pages: 44 },
  { brand: "Quadra-Fire", model: "Explorer", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Quadra-Fire+Explorer+installation+manual", pages: 48 },
  { brand: "Quadra-Fire", model: "Denali", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Quadra-Fire+Denali+installation+manual", pages: 52 },
  { brand: "Harman", model: "P68", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Harman+P68+installation+manual", pages: 40 },
  { brand: "Harman", model: "Trophy", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Harman+Trophy+installation+manual", pages: 36 },
  { brand: "Harman", model: "Advance", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Harman+Advance+installation+manual", pages: 44 },
  { brand: "Buck Stove", model: "Model 20", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Buck+Stove+Model+20+installation+manual", pages: 24 },
  { brand: "Buck Stove", model: "Model 24", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Buck+Stove+Model+24+installation+manual", pages: 28 },
  { brand: "Buck Stove", model: "Model 27", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Buck+Stove+Model+27+installation+manual", pages: 32 },
  { brand: "Buck Stove", model: "Model 91", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Buck+Stove+Model+91+installation+manual", pages: 36 },
  { brand: "Pacific Energy", model: "Alderlea", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Pacific+Energy+Alderlea+installation+manual", pages: 32 },
  { brand: "Pacific Energy", model: "Summit", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Pacific+Energy+Summit+installation+manual", pages: 36 },
  { brand: "Pacific Energy", model: "Fireview", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=Pacific+Energy+Fireview+installation+manual", pages: 34 },
  { brand: "SBI", model: "Enerzone", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=SBI+Enerzone+installation+manual", pages: 40 },
  { brand: "SBI", model: "Drolet", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=SBI+Drolet+installation+manual", pages: 36 },
  { brand: "SBI", model: "Flexiheat", type: "Wood Stove", category: "Wood Stove", url: "https://www.google.com/search?q=SBI+Flexiheat+installation+manual", pages: 38 },
  { brand: "Mont", model: "Deluxe", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Mont+Deluxe+installation+manual", pages: 40 },
  { brand: "Mont", model: "Enchantment", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Mont+Enchantment+installation+manual", pages: 44 },
  { brand: "Mont", model: "Excalibur", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Mont+Excalibur+installation+manual", pages: 48 },
  { brand: "Empire", model: "Vail", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Empire+Vail+installation+manual", pages: 36 },
  { brand: "Empire", model: "Alta", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Empire+Alta+installation+manual", pages: 40 },
  { brand: "Empire", model: "DVC", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Empire+DVC+installation+manual", pages: 44 },
  { brand: "Empire", model: "Palisade", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Empire+Palisade+installation+manual", pages: 48 },
  { brand: "SimpliFire", model: "Allusion", type: "Electric Fireplace", category: "Electric", url: "https://www.google.com/search?q=SimpliFire+Allusion+installation+manual", pages: 28 },
  { brand: "SimpliFire", model: "Scorpius", type: "Electric Fireplace", category: "Electric", url: "https://www.google.com/search?q=SimpliFire+Scorpius+installation+manual", pages: 24 },
  { brand: "SimpliFire", model: "Vortex", type: "Electric Fireplace", category: "Electric", url: "https://www.google.com/search?q=SimpliFire+Vortex+installation+manual", pages: 26 },
  { brand: "SimpliFire", model: "Motion", type: "Electric Fireplace", category: "Electric", url: "https://www.google.com/search?q=SimpliFire+Motion+installation+manual", pages: 30 },
  { brand: "Modern Flames", model: "Aurora", type: "Electric Fireplace", category: "Electric", url: "https://www.google.com/search?q=Modern+Flames+Aurora+installation+manual", pages: 24 },
  { brand: "Modern Flames", model: "Landscape Pro", type: "Electric Fireplace", category: "Electric", url: "https://www.google.com/search?q=Modern+Flames+Landscape+Pro+installation+manual", pages: 32 },
  { brand: "Modern Flames", model: "Wildland", type: "Electric Fireplace", category: "Electric", url: "https://www.google.com/search?q=Modern+Flames+Wildland+installation+manual", pages: 28 },
  { brand: "American Fireglass", model: "Burner Systems", type: "Fire Feature", category: "Fire Feature", url: "https://www.google.com/search?q=American+Fireglass+Burner+installation+manual", pages: 20 },
  { brand: "American Fireglass", model: "Fireballs", type: "Fire Feature", category: "Fire Feature", url: "https://www.google.com/search?q=American+Fireglass+Fireballs+installation+manual", pages: 16 },
  { brand: "American Fireglass", model: "Fireplace Logs", type: "Gas Log Set", category: "Gas Log", url: "https://www.google.com/search?q=American+Fireglass+Logs+installation+manual", pages: 18 },
  { brand: "Rinnai", model: "Enclaves", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Rinnai+Enclaves+installation+manual", pages: 40 },
  { brand: "Rinnai", model: "EnergySaver", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Rinnai+EnergySaver+installation+manual", pages: 36 },
  { brand: "Rinnai", model: "Contour", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Rinnai+Contour+installation+manual", pages: 38 },
  { brand: "Lennox", model: "Merritt", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Lennox+Merritt+installation+manual", pages: 44 },
  { brand: "Lennox", model: "Brockway", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Lennox+Brockway+installation+manual", pages: 40 },
  { brand: "Lennox", model: "Whitby", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Lennox+Whitby+installation+manual", pages: 42 },
  { brand: "Superior", model: "DRT", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Superior+DRT+installation+manual", pages: 48 },
  { brand: "Superior", model: "DRL", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Superior+DRL+installation+manual", pages: 52 },
  { brand: "Superior", model: "XTR", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Superior+XTR+installation+manual", pages: 44 },
  { brand: "Kozy Heat", model: "Taylor", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Kozy+Heat+Taylor+installation+manual", pages: 40 },
  { brand: "Kozy Heat", model: "Spartan", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Kozy+Heat+Spartan+installation+manual", pages: 44 },
  { brand: "Kozy Heat", model: "Bayport", type: "Gas Fireplace", category: "Gas Fireplace", url: "https://www.google.com/search?q=Kozy+Heat+Bayport+installation+manual", pages: 36 },
  { brand: "FPX", model: "42 Apex NexGen-Hybrid", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01577.pdf", pages: 40 },
  { brand: "FPX", model: "42 Apex NexGen-Hybrid", type: "Owner's Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01578.pdf", pages: 36 },
  { brand: "FPX", model: "42 Apex NexGen-Hybrid", type: "Single Page Flyer", category: "Gas Fireplace", url: "http://www.travisindustries.com/docs/SPF/SPF_42ApexNG_682.pdf", pages: 1 },
  { brand: "FPX", model: "36 Elite NexGen-Hybrid", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01584.pdf", pages: 40 },
  { brand: "FPX", model: "36 Elite NexGen-Hybrid", type: "Owner's Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01585.pdf", pages: 36 },
  { brand: "FPX", model: "36 Elite NexGen-Hybrid", type: "Framing Worksheet", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/18100018.pdf", pages: 2 },
  { brand: "FPX", model: "36 Elite NexGen-Hybrid", type: "Firebrick Order Form", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/Firebrick_36Elite.pdf", pages: 1 },
  { brand: "FPX", model: "44 Elite NexGen-Hybrid", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01582.pdf", pages: 40 },
  { brand: "FPX", model: "44 Elite NexGen-Hybrid", type: "Owner's Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01583.pdf", pages: 36 },
  { brand: "FPX", model: "44 Elite NexGen-Hybrid", type: "Framing Worksheet", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/18100019.pdf", pages: 2 },
  { brand: "FPX", model: "44 Elite NexGen-Hybrid", type: "Firebrick Order Form", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/Firebrick_44Elite.pdf", pages: 1 },
  { brand: "Lopi", model: "Answer NexGen-Hybrid", type: "Owner's/Install Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01568.pdf", pages: 32 },
  { brand: "Lopi", model: "Evergreen NexGen-Hybrid", type: "Owner's/Install Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01575.pdf", pages: 32 },
  { brand: "Lopi", model: "Endeavor NexGen-Hybrid", type: "Owner's/Install Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01574.pdf", pages: 32 },
  { brand: "Lopi", model: "Liberty NexGen-Hybrid", type: "Owner's/Install Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01586.pdf", pages: 32 },
  { brand: "Lopi", model: "Large Flush NexGen-Hybrid Wood Insert", type: "Owner's/Install Manual", category: "Wood Insert", url: "https://www.travisindustries.com/docs/100-01573.pdf", pages: 32 },
  { brand: "Lopi", model: "Medium Flush NexGen-Hybrid Wood Insert", type: "Owner's/Install Manual", category: "Wood Insert", url: "https://www.travisindustries.com/docs/100-01572.pdf", pages: 32 },
  { brand: "Lopi", model: "Rockport NexGen-Hybrid", type: "Owner's/Install Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01593.pdf", pages: 32 },
  { brand: "FPX", model: "ProBuilder 36 CleanFace GSR2", type: "Owner's Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01495.pdf", pages: 28 },
  { brand: "FPX", model: "ProBuilder 36 CleanFace", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01488.pdf", pages: 32 },
  { brand: "FPX", model: "ProBuilder 42/54/72 Linear MV/GSR2", type: "Owner's Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01523.pdf", pages: 28 },
  { brand: "FPX", model: "ProBuilder 24 CleanFace", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01512.pdf", pages: 32 },
  { brand: "FPX", model: "ProBuilder 42 CleanFace", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01493.pdf", pages: 32 },
  { brand: "FPX/Lopi", model: "430 Mod-Fyre Gas Insert", type: "All Manuals", category: "Gas Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 0 },
  { brand: "FPX/Lopi", model: "616 Mod-Fyre / EmberGlo Gas Insert", type: "All Manuals", category: "Gas Insert", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 0 },
  { brand: "FPX", model: "32/34 DVS/DVL Ember-Glo GSR2 Inserts", type: "All Manuals", category: "Gas Insert", url: "https://www.fireplacex.com/owner-resources/manuals/", pages: 0 },
  { brand: "Lopi", model: "Northfield / Greenfield / Cypress GSR2 Gas Stoves", type: "All Manuals", category: "Gas Stove", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 0 },
  { brand: "Lopi", model: "AGP Pellet Stove & Insert", type: "All Manuals", category: "Pellet Stove", url: "https://www.lopistoves.com/owner-resources/manuals/", pages: 0 },
];

export async function POST() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No DATABASE_URL" }, { status: 500 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Ensure organizations table and default org exist
    await sql`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        logo_url TEXT,
        timezone TEXT DEFAULT 'America/Chicago',
        settings JSONB DEFAULT '{}',
        subscription_tier TEXT DEFAULT 'starter',
        qb_realm_id TEXT,
        qb_access_token TEXT,
        qb_refresh_token TEXT,
        qb_token_expires_at TIMESTAMPTZ,
        qb_connected BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    const orgs = await sql`SELECT id FROM organizations WHERE slug = 'default' LIMIT 1`;
    let orgId: string;
    if (orgs.length > 0) {
      orgId = orgs[0].id;
    } else {
      const created = await sql`INSERT INTO organizations (name, slug) VALUES ('HearthOS', 'default') RETURNING id`;
      orgId = created[0].id;
    }

    // Ensure manuals table exists
    await sql`
      CREATE TABLE IF NOT EXISTS manuals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL,
        brand VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        type VARCHAR(100),
        category VARCHAR(100),
        url TEXT NOT NULL,
        pages INTEGER,
        source VARCHAR(50) DEFAULT 'url',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    // Ensure manual_sections table exists
    await sql`
      CREATE TABLE IF NOT EXISTS manual_sections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        manual_id UUID NOT NULL,
        page_start INTEGER NOT NULL,
        page_end INTEGER,
        title VARCHAR(255),
        snippet TEXT NOT NULL,
        tags JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    let created = 0;
    let skipped = 0;

    for (const entry of MANUAL_LIBRARY) {
      try {
        // Check if already exists
        const existing = await sql`
          SELECT id FROM manuals WHERE org_id = ${orgId} AND brand = ${entry.brand} AND model = ${entry.model} AND COALESCE(type, '') = ${entry.type || ''} LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await sql`
          INSERT INTO manuals (org_id, brand, model, type, category, url, pages, source)
          VALUES (${orgId}, ${entry.brand}, ${entry.model}, ${entry.type || null}, ${entry.category || null}, ${entry.url}, ${entry.pages || null}, 'seed')
        `;
        created++;
      } catch {
        skipped++;
      }
    }

    await sql.end();
    return NextResponse.json({ created, skipped, total: MANUAL_LIBRARY.length, orgId });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 }
    );
  }
}
