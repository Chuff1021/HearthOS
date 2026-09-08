// Deployment-controlled compatibility links for verified login emails that differ
// from legacy staff contact emails. Roles and active status still come from users.
export function employeeIdForVerifiedEmail(raw: string | undefined, verifiedEmail: string): string | null {
  if (!raw) return null;
  const aliases: unknown = JSON.parse(raw);
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) {
    throw new Error("Invalid employee login alias configuration");
  }
  const normalized = new Map<string, string>();
  for (const [key, id] of Object.entries(aliases)) {
    const email = key.trim().toLowerCase();
    if (!email.includes("@") || normalized.has(email) || typeof id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Invalid employee login alias configuration");
    }
    normalized.set(email, id);
  }
  return normalized.get(verifiedEmail.trim().toLowerCase()) || null;
}
