import { db, manuals } from "@/db";
import { getOrCreateDefaultOrg } from "@/lib/org";

const rows = [
  { brand: "FPX", model: "42 Apex NexGen-Hybrid", type: "Installation Manual", category: "Wood Fireplace", url: "https://www.travisindustries.com/docs/100-01577.pdf" },
  { brand: "FPX", model: "42 Apex NexGen-Hybrid", type: "Owner's Manual", category: "Wood Fireplace", url: "https://www.travisindustries.com/docs/100-01578.pdf" },
  { brand: "FPX", model: "42 Apex NexGen-Hybrid", type: "Single Page Flyer", category: "Wood Fireplace", url: "http://www.travisindustries.com/docs/SPF/SPF_42ApexNG_682.pdf" },
  { brand: "FPX", model: "36 Elite NexGen-Hybrid", type: "Installation Manual", category: "Wood Fireplace", url: "https://www.travisindustries.com/docs/100-01584.pdf" },
  { brand: "FPX", model: "36 Elite NexGen-Hybrid", type: "Owner's Manual", category: "Wood Fireplace", url: "https://www.travisindustries.com/docs/100-01585.pdf" },
  { brand: "FPX", model: "44 Elite NexGen-Hybrid", type: "Installation Manual", category: "Wood Fireplace", url: "https://www.travisindustries.com/docs/100-01582.pdf" },
  { brand: "FPX", model: "44 Elite NexGen-Hybrid", type: "Owner's Manual", category: "Wood Fireplace", url: "https://www.travisindustries.com/docs/100-01583.pdf" },
  { brand: "Lopi", model: "Answer NexGen-Hybrid", type: "Owner's/Installation Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01568.pdf" },
  { brand: "Lopi", model: "Liberty NexGen-Hybrid", type: "Owner's/Installation Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01586.pdf" },
  { brand: "Lopi", model: "Endeavor NexGen-Hybrid", type: "Owner's/Installation Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01574.pdf" },
  { brand: "Lopi", model: "Evergreen NexGen-Hybrid", type: "Owner's/Installation Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01575.pdf" },
  { brand: "Lopi", model: "Rockport NexGen-Hybrid", type: "Owner's/Installation Manual", category: "Wood Stove", url: "https://www.travisindustries.com/docs/100-01593.pdf" },
  { brand: "Lopi", model: "Large Flush NexGen-Hybrid Wood Insert", type: "Owner's/Installation Manual", category: "Wood Insert", url: "https://www.travisindustries.com/docs/100-01573.pdf" },
  { brand: "Lopi", model: "Medium Flush NexGen-Hybrid Wood Insert", type: "Owner's/Installation Manual", category: "Wood Insert", url: "https://www.travisindustries.com/docs/100-01572.pdf" },
  { brand: "FPX", model: "ProBuilder 36 CleanFace GSR2", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01488.pdf" },
  { brand: "FPX", model: "ProBuilder 42 CleanFace", type: "Installation Manual", category: "Gas Fireplace", url: "https://www.travisindustries.com/docs/100-01493.pdf" },
  { brand: "Lopi", model: "DVS EmberGlo GSR2 Insert", type: "Owner's Manual", category: "Gas Insert", url: "https://www.travisindustries.com/docs/100-01537.pdf" },
  { brand: "Lopi", model: "DVL EmberGlo GSR2 Insert", type: "Owner's Manual", category: "Gas Insert", url: "https://www.travisindustries.com/docs/100-01536.pdf" },
  { brand: "Lopi", model: "430 Mod-Fyre Insert", type: "All Manuals (select model)", category: "Gas Insert", url: "https://www.lopistoves.com/owner-resources/manuals/" },
  { brand: "Lopi", model: "616 Mod-Fyre / EmberGlo Insert", type: "All Manuals (select model)", category: "Gas Insert", url: "https://www.lopistoves.com/owner-resources/manuals/" },
  { brand: "Lopi", model: "Northfield / Greenfield / Cypress GSR2", type: "All Manuals (select model)", category: "Gas Stove", url: "https://www.lopistoves.com/owner-resources/manuals/" },
  { brand: "Lopi", model: "AGP Pellet Stove", type: "Owner's Manual", category: "Pellet Stove", url: "https://www.travisindustries.com/docs/100-01566.pdf" },
  { brand: "Lopi", model: "AGP Pellet Insert", type: "All Manuals (select model)", category: "Pellet Insert", url: "https://www.lopistoves.com/owner-resources/manuals/" },
];

async function run() {
  const org = await getOrCreateDefaultOrg();
  await db.insert(manuals).values(
    rows.map((row) => ({
      orgId: org.id,
      brand: row.brand,
      model: row.model,
      type: row.type,
      category: row.category,
      url: row.url,
      source: "url",
    }))
  );
  console.log(`Inserted ${rows.length} manuals.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to import manuals:", err);
  process.exit(1);
});
