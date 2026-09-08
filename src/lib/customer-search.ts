import "server-only";
import { and, ilike, or, sql } from "drizzle-orm";
import { customers } from "@/db";

export function customerSearchPredicate(query: string) {
  const terms = query.trim().slice(0, 160).split(/\s+/).filter(Boolean).slice(0, 12);
  return and(...terms.map((term) => {
    const literal = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    return or(
      ilike(customers.firstName, literal), ilike(customers.lastName, literal),
      ilike(customers.companyName, literal), ilike(customers.email, literal),
      ilike(customers.phone, literal), ilike(customers.phoneAlt, literal),
      ilike(customers.addressLine1, literal), ilike(customers.addressLine2, literal),
      ilike(customers.city, literal), ilike(customers.state, literal), ilike(customers.zip, literal),
      ilike(customers.qbCustomerId, literal),
      /^\+?[\d().-]+$/.test(term) && term.replace(/\D/g, "").length >= 4
        ? sql`regexp_replace(coalesce(${customers.phone}, '') || coalesce(${customers.phoneAlt}, ''), '[^0-9]', '', 'g') LIKE ${`%${term.replace(/\D/g, "")}%`}`
        : undefined,
    );
  }));
}

export function customerAddress(customer: typeof customers.$inferSelect) {
  return { line1: customer.addressLine1 || "", line2: customer.addressLine2 || "", city: customer.city || "", state: customer.state || "", zip: customer.zip || "" };
}
