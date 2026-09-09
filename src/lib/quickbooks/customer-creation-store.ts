import { and, eq } from "drizzle-orm";
import { auditLogs, customers, db, organizations } from "@/db";
import { customerRequestId, type CustomerCreationStore, type CustomerInput } from "./customer-creation";

export function customerCreationStore(orgId: string, realmId: string, employeeId: string, input: CustomerInput): CustomerCreationStore {
  const requestId = customerRequestId(orgId, realmId, input);
  const completionId = customerRequestId(orgId, realmId, input, "complete");
  const event = (id: string, action: string) => and(eq(auditLogs.id, id), eq(auditLogs.orgId, orgId),
    eq(auditLogs.entityType, "customer_creation"), eq(auditLogs.action, action));
  return {
    async completed() {
      const [row] = await db.select({ value: auditLogs.newValue }).from(auditLogs).where(event(completionId, "complete")).limit(1);
      const value = row?.value as { localId?: string; qbCustomerId?: string; realmId?: string } | undefined;
      if (!value) return null;
      if (value.realmId !== realmId || !value.localId || !value.qbCustomerId) throw new Error("Invalid customer completion record");
      const [customer] = await db.select({ localId: customers.id, qbCustomerId: customers.qbCustomerId }).from(customers)
        .where(and(eq(customers.orgId, orgId), eq(customers.id, value.localId), eq(customers.qbCustomerId, value.qbCustomerId))).limit(1);
      if (!customer?.qbCustomerId) throw new Error("Completed customer no longer exists");
      return { localId: customer.localId, qbCustomerId: customer.qbCustomerId };
    },
    async claim() {
      const rows = await db.insert(auditLogs).values({ id: requestId, orgId, userId: employeeId,
        entityType: "customer_creation", action: "request", newValue: { realmId } }).onConflictDoNothing().returning({ id: auditLogs.id });
      return rows.length === 1;
    },
    async claimed() {
      const rows = await db.select({ id: auditLogs.id }).from(auditLogs).where(event(requestId, "request")).limit(1);
      return rows.length === 1;
    },
    async finish(customer) {
      return db.transaction(async tx => {
        const [connection] = await tx.select({ realmId: organizations.qbRealmId }).from(organizations)
          .where(eq(organizations.id, orgId)).for("update");
        if (connection?.realmId !== realmId) throw new Error("QuickBooks connection changed during customer creation");
        const now = new Date();
        const words = input.displayName.split(/\s+/);
        await tx.insert(customers).values({ orgId, qbCustomerId: customer.Id,
          firstName: input.firstName || words[0], lastName: input.lastName || (input.firstName ? "" : words.slice(1).join(" ")),
          companyName: input.companyName || null, email: input.email || null, phone: input.phone || null,
          addressLine1: input.address.line1 || null, addressLine2: input.address.line2 || null,
          city: input.address.city || null, state: input.address.state || null, zip: input.address.zip || null,
          source: "quickbooks", isActive: true, lastSyncedAt: now, updatedAt: now,
        }).onConflictDoNothing();
        // Existing global QB uniqueness must never overwrite a different organization.
        const [saved] = await tx.select({ localId: customers.id, qbCustomerId: customers.qbCustomerId }).from(customers)
          .where(and(eq(customers.orgId, orgId), eq(customers.qbCustomerId, customer.Id))).limit(1);
        if (!saved?.qbCustomerId) throw new Error("Customer ownership conflict");
        await tx.insert(auditLogs).values({ id: completionId, orgId, userId: employeeId,
          entityType: "customer_creation", entityId: saved.localId, action: "complete",
          newValue: { realmId, localId: saved.localId, qbCustomerId: saved.qbCustomerId } }).onConflictDoNothing();
        return { localId: saved.localId, qbCustomerId: saved.qbCustomerId };
      });
    },
  };
}
