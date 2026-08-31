import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/auth";

const DEFAULT_MEEKS_EMAILS = ["shawn.garvey@meeks.com"];
const DEFAULT_INTERNAL_EMAILS = [
  "chuff182@gmail.com",
  "aaronsfireplaceco.gabe@yahoo.com",
];

export type MeeksAccess =
  | {
      ok: true;
      email: string;
      orgId: string;
      isInternal: boolean;
      isMeeksPartner: boolean;
    }
  | {
      ok: false;
      status: 401 | 403;
      message: string;
    };

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function allowedMeeksEmails() {
  const configured = String(process.env.MEEKS_PORTAL_ALLOWED_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  return new Set([...DEFAULT_MEEKS_EMAILS, ...configured]);
}

function allowedInternalEmails() {
  const configured = String(process.env.HEARTHOS_INTERNAL_ALLOWED_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  return new Set([...DEFAULT_INTERNAL_EMAILS, ...configured]);
}

function metadataRole(user: any) {
  return String(
    user?.publicMetadata?.hearthRole ||
    user?.publicMetadata?.role ||
    user?.publicMetadata?.userRole ||
    user?.privateMetadata?.hearthRole ||
    user?.privateMetadata?.role ||
    user?.privateMetadata?.userRole ||
    user?.unsafeMetadata?.hearthRole ||
    user?.unsafeMetadata?.role ||
    user?.unsafeMetadata?.userRole ||
    ""
  ).toLowerCase();
}

function isInternalMetadataRole(role: string) {
  return ["admin", "owner", "dispatcher", "technician", "tech", "lead"].includes(role);
}

async function isInternalDbUser(email: string) {
  if (!email) return false;
  try {
    const [{ db, users }, { and, eq }, { getOrCreateDefaultOrg }] = await Promise.all([
      import("@/db"),
      import("drizzle-orm"),
      import("@/lib/org"),
    ]);
    const org = await getOrCreateDefaultOrg();
    const [row] = await db
      .select({ role: users.role, isOwner: users.isOwner, isActive: users.isActive })
      .from(users)
      .where(and(eq(users.orgId, org.id), eq(users.email, email)))
      .limit(1);

    if (!row || row.isActive === false) return false;
    return Boolean(row.isOwner) || ["admin", "dispatcher", "technician"].includes(String(row.role));
  } catch {
    return false;
  }
}

async function accessFromUser(user: any): Promise<MeeksAccess> {
  const email = normalizeEmail(user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress);
  if (!email) return { ok: false, status: 403, message: "No email address is attached to this login." };

  const isMeeksPartner = allowedMeeksEmails().has(email);
  const role = metadataRole(user);
  const isKnownInternal = allowedInternalEmails().has(email) || isInternalMetadataRole(role) || await isInternalDbUser(email);
  // HearthOS staff may not have consistent Clerk metadata yet. If someone is
  // signed into this Clerk app and they are not an approved Meeks partner email,
  // treat them as internal so the dashboard sidebar can open the portal.
  const isInternal = isKnownInternal || !isMeeksPartner;

  if (!isMeeksPartner && !isInternal) {
    return { ok: false, status: 403, message: "This login is not allowed to access the Meeks portal." };
  }

  const [{ db, organizations }, { eq }] = await Promise.all([
    import("@/db"),
    import("drizzle-orm"),
  ]);
  const orgSlug = String(process.env.MEEKS_ORGANIZATION_SLUG || "default");
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);
  if (!organization) {
    return { ok: false, status: 403, message: "The Meeks portal company is not configured." };
  }

  return { ok: true, email, orgId: organization.id, isInternal, isMeeksPartner };
}

export async function getMeeksPortalAccess(): Promise<MeeksAccess> {
  if (!isClerkConfigured()) {
    const [{ db, organizations }, { eq }] = await Promise.all([
      import("@/db"),
      import("drizzle-orm"),
    ]);
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, String(process.env.MEEKS_ORGANIZATION_SLUG || "default")))
      .limit(1);
    if (!organization) return { ok: false, status: 403, message: "The Meeks portal company is not configured." };
    return { ok: true, email: "local", orgId: organization.id, isInternal: true, isMeeksPartner: true };
  }

  const user = await currentUser();
  if (!user) return { ok: false, status: 401, message: "Sign in to access the Meeks portal." };
  return accessFromUser(user);
}

export async function getMeeksApiAccess(): Promise<MeeksAccess> {
  if (!isClerkConfigured()) {
    return getMeeksPortalAccess();
  }

  const { userId } = await auth();
  if (!userId) return { ok: false, status: 401, message: "Unauthorized" };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return accessFromUser(user);
}

export async function getMeeksInternalAccess(): Promise<MeeksAccess> {
  const access = await getMeeksApiAccess();
  if (!access.ok) return access;
  if (!access.isInternal) {
    return { ok: false, status: 403, message: "Only HearthOS internal users can move Meeks requests to the main calendar." };
  }
  return access;
}
