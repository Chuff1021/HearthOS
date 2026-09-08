import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { and, eq, sql } from "drizzle-orm";
import { canUseCrmApi, employeeRole, verifiedPrimaryEmail, type CrmActor } from "./access-policy";

export class CrmAccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Compatibility boundary for Aaron's existing, single-organization release.
// No schema writes, employee auto-creation, metadata grants, or demo fallback.
export const requireCrmActor = cache(async (): Promise<CrmActor> => {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    throw new CrmAccessError("Authentication is not configured. Contact your administrator.", 503);
  }
  const session = await auth();
  if (!session.userId) throw new CrmAccessError("Sign in to access HearthOS.", 401);
  const user = await currentUser();
  const email = user ? verifiedPrimaryEmail(user) : null;
  if (!email) throw new CrmAccessError("A verified primary email is required.", 403);
  const { db, users, organizations } = await import("@/db");
  const rows = await db.select({ employee: users, orgId: organizations.id })
    .from(users).innerJoin(organizations, eq(users.orgId, organizations.id))
    .where(and(eq(organizations.slug, "default"), sql`lower(${users.email}) = ${email}`)).limit(2);
  if (rows.length !== 1 || !rows[0].employee.isActive) {
    throw new CrmAccessError("This account is not an active HearthOS team member.", 403);
  }
  const { employee, orgId } = rows[0];
  const role = employeeRole(employee);
  if (!role) throw new CrmAccessError("This account has no supported business role.", 403);
  return {
    clerkUserId: session.userId, orgId, employeeId: employee.id, email, role,
    name: [employee.firstName, employee.lastName].filter(Boolean).join(" ") || email,
  };
});

export async function authorizeCrmApi(route: string, method: string): Promise<Response | null> {
  try {
    const actor = await requireCrmActor();
    if (!canUseCrmApi(actor, route, method)) throw new CrmAccessError("You do not have permission for this action.", 403);
    return null;
  } catch (error) {
    return Response.json(
      { error: error instanceof CrmAccessError ? error.message : "Unable to verify business access." },
      { status: error instanceof CrmAccessError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function requireCrmAdmin() {
  const actor = await requireCrmActor();
  if (actor.role !== "owner" && actor.role !== "admin") throw new CrmAccessError("Administrator access required.", 403);
  return actor;
}
