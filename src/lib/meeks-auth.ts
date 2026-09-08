import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/auth";
import { requireCrmActor } from "@/lib/security/crm-access";
import { isOfficeActor, verifiedPrimaryEmail } from "@/lib/security/access-policy";

const DEFAULT_MEEKS_EMAILS = ["shawn.garvey@meeks.com"];

export type MeeksAccess =
  | {
      ok: true;
      email: string;
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


async function accessFromUser(user: any): Promise<MeeksAccess> {
  const email = user ? verifiedPrimaryEmail(user) : null;
  if (!email) return { ok: false, status: 403, message: "No email address is attached to this login." };

  const isMeeksPartner = allowedMeeksEmails().has(email);
  const actor = await requireCrmActor().catch(() => null);
  const isInternal = Boolean(actor && isOfficeActor(actor));

  if (!isMeeksPartner && !isInternal) {
    return { ok: false, status: 403, message: "This login is not allowed to access the Meeks portal." };
  }

  return { ok: true, email, isInternal, isMeeksPartner };
}

export async function getMeeksPortalAccess(): Promise<MeeksAccess> {
  if (!isClerkConfigured()) {
    return { ok: false, status: 403, message: "Portal authentication is not configured." };
  }

  const user = await currentUser();
  if (!user) return { ok: false, status: 401, message: "Sign in to access the Meeks portal." };
  return accessFromUser(user);
}

export async function getMeeksApiAccess(): Promise<MeeksAccess> {
  if (!isClerkConfigured()) {
    return { ok: false, status: 403, message: "Portal authentication is not configured." };
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
