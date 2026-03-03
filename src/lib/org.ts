import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";

export async function getOrCreateDefaultOrg() {
  const slug = "default";
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const created = await db
    .insert(organizations)
    .values({
      name: "HearthOS",
      slug,
      subscriptionTier: "starter",
      settings: {
        brandPrimary: "#FF4400",
        brandSecondary: "#1a1a2e",
        supportEmail: "",
        supportPhone: "",
        content: {
          homepageHeadline: "Run your fireplace service business in one place",
          homepageSubheadline:
            "Scheduling, dispatch, invoicing, and AI-assisted support for modern fireplace companies.",
          primaryCtaText: "Book a Demo",
          primaryCtaLink: "/contact",
          secondaryCtaText: "View Features",
          secondaryCtaLink: "/features",
          heroImageUrl: "",
          featureOneTitle: "Dispatch & Scheduling",
          featureOneBody: "Drag-and-drop scheduling with technician availability.",
          featureTwoTitle: "QuickBooks Sync",
          featureTwoBody: "Keep invoices and customers in sync automatically.",
          featureThreeTitle: "GABE AI",
          featureThreeBody: "Instant answers for techs on the job.",
        },
        integrations: {
          qbAutoSync: true,
          qbSyncInterval: "15",
          gabeEnabled: true,
          gabeModel: "llama-3.1-8b-instant",
        },
      },
    })
    .returning();

  return created[0];
}
