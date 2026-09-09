import { createHash } from "node:crypto";
import type { QBCustomer } from "./types";

export type CustomerInput = {
  displayName: string; firstName: string; lastName: string; companyName: string;
  email: string; phone: string;
  address: { line1: string; line2: string; city: string; state: string; zip: string };
};
export class CustomerCreationError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export function parseCustomerInput(value: unknown): CustomerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  const field = (source: Record<string, unknown>, key: string, max: number) => {
    const raw = source[key];
    if (raw === undefined || raw === null) return "";
    if (typeof raw !== "string" || raw.trim().length > max || /[\u0000-\u001f]/.test(raw)) throw invalid();
    return raw.trim();
  };
  const firstName = field(body, "firstName", 100), lastName = field(body, "lastName", 100);
  const displayName = field(body, "displayName", 100) || [firstName, lastName].filter(Boolean).join(" ");
  const email = field(body, "email", 255);
  if (!displayName || displayName.length > 100 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw invalid();
  if (body.address !== undefined && (!body.address || typeof body.address !== "object" || Array.isArray(body.address))) throw invalid();
  const address = (body.address || {}) as Record<string, unknown>;
  return { displayName, firstName, lastName, companyName: field(body, "companyName", 255), email,
    phone: field(body, "phone", 50), address: { line1: field(address, "line1", 500), line2: field(address, "line2", 500),
      city: field(address, "city", 100), state: field(address, "state", 50), zip: field(address, "zip", 20) } };
}
function invalid() { return new CustomerCreationError("Enter a customer name and valid contact/address fields.", "INVALID_CUSTOMER", 400); }
export function customerRequestId(orgId: string, realmId: string, input: CustomerInput, phase = "request") {
  const hex = createHash("sha256").update(JSON.stringify(["customer-create-v1", phase, orgId, realmId, input])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function toQbCustomer(input: CustomerInput): Partial<QBCustomer> {
  return { DisplayName: input.displayName, GivenName: input.firstName || undefined, FamilyName: input.lastName || undefined,
    CompanyName: input.companyName || undefined, PrimaryEmailAddr: input.email ? { Address: input.email } : undefined,
    PrimaryPhone: input.phone ? { FreeFormNumber: input.phone } : undefined,
    BillAddr: { Line1: input.address.line1, Line2: input.address.line2, City: input.address.city,
      CountrySubDivisionCode: input.address.state, PostalCode: input.address.zip }, Active: true };
}
export function matchesCreatedCustomer(customer: QBCustomer, input: CustomerInput) {
  const normalize = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
  const requested = toQbCustomer(input);
  const pairs = [ [customer.DisplayName, requested.DisplayName], [customer.GivenName, requested.GivenName],
    [customer.FamilyName, requested.FamilyName], [customer.CompanyName, requested.CompanyName],
    [customer.PrimaryEmailAddr?.Address, input.email], [customer.PrimaryPhone?.FreeFormNumber, input.phone],
    ...(["Line1", "Line2", "City", "CountrySubDivisionCode", "PostalCode"] as const).map(key => [customer.BillAddr?.[key], requested.BillAddr?.[key]]) ];
  return typeof customer.Id === "string" && /^[0-9]{1,50}$/.test(customer.Id) && customer.Active !== false
    && pairs.every(([actual, expected]) => normalize(actual) === normalize(expected));
}
export type CustomerCreationStore = {
  completed: () => Promise<{ localId: string; qbCustomerId: string } | null>;
  claim: () => Promise<boolean>;
  claimed: () => Promise<boolean>;
  finish: (customer: QBCustomer) => Promise<{ localId: string; qbCustomerId: string }>;
};
export async function executeCustomerCreation(input: CustomerInput, store: CustomerCreationStore, provider: {
  create: () => Promise<QBCustomer>;
  find: () => Promise<QBCustomer[]>;
}, reconcile: boolean) {
  const completed = await store.completed();
  if (completed) return { customer: { ...input, id: completed.qbCustomerId, localId: completed.localId }, recovered: true };
  const review = () => new CustomerCreationError("Creation needs review. Use Check creation status before trying to create this customer again.", "CUSTOMER_CREATE_REVIEW_REQUIRED", 409);
  if (reconcile) {
    if (!await store.claimed()) throw new CustomerCreationError("No recorded creation attempt was found. Contact your administrator before retrying.", "CUSTOMER_CREATE_REVIEW_REQUIRED", 409);
    try {
      const found = (await provider.find()).filter(customer => matchesCreatedCustomer(customer, input));
      if (found.length !== 1) throw review();
      const saved = await store.finish(found[0]);
      return { customer: { ...input, id: saved.qbCustomerId, localId: saved.localId }, recovered: true };
    } catch { throw review(); }
  }
  // The durable claim is committed before contacting the provider. Unknown outcomes
  // never replay a create, including after process restart or a lost HTTP response.
  if (!await store.claim()) throw review();
  try {
    const customer = await provider.create();
    if (!matchesCreatedCustomer(customer, input)) throw review();
    const saved = await store.finish(customer);
    return { customer: { ...input, id: saved.qbCustomerId, localId: saved.localId }, recovered: false };
  } catch { throw review(); }
}
