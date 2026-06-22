import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import {
  customers,
  db,
  fireplaceUnits,
  invoiceLineItems,
  invoices,
  properties,
  servicePlans,
} from "@/db";
import { getJobs } from "@/app/api/jobs/route";
import { isClerkConfigured } from "@/lib/auth";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { listLatestServiceOutreach } from "@/lib/service-map-outreach-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ServiceCategory = "gas" | "wood" | "pellet" | "unknown";

type CustomerPoint = {
  id: string;
  qbCustomerId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  phoneAlt: string | null;
  address: string;
  zoneKey: string;
  zoneLabel: string;
  propertyId: string | null;
  lat: number | null;
  lng: number | null;
  serviceCategory: ServiceCategory;
  isTarget: boolean;
  lastServiceDate: string | null;
  serviceCount18mo: number;
  serviceCountTotal: number;
  hasServicePlan: boolean;
  scheduled: boolean;
  scheduledJobId: string | null;
  scheduledDate: string | null;
  outreachStatus: string | null;
  outreachNote: string | null;
  outreachContactDate: string | null;
  outreachNeedsFollowUp: boolean;
  outreachFollowUpDate: string | null;
  outreachUpdatedAt: string | null;
  evidence: string[];
  scheduleUrl: string;
};

const TARGET_WINDOW_MONTHS = 18;
const SERVICE_RE = /\b(service|serviced|inspection|inspect|clean|cleaning|sweep|sweeping|maintenance|tune[- ]?up)\b/i;
const GAS_RE = /\b(gas|propane|lp|natural gas|ng|pilot|thermopile|thermocouple|burner|log set|logset)\b/i;
const WOOD_RE = /\b(wood|chimney|sweep|creosote|masonry|stove|insert|flue|damper|cap)\b/i;
const PELLET_RE = /\b(pellet|pellets|auger|hopper|burn pot|combustion blower|exhaust blower)\b/i;

function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (!text) return null;
  return text.includes("T") ? text.slice(0, 10) : text.slice(0, 10);
}

function dateMs(value: string | null) {
  if (!value) return 0;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function displayNameFor(c: {
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  return (
    c.companyName ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.email ||
    "Unnamed customer"
  );
}

function customerAddress(c: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  return [c.addressLine1, c.addressLine2, [c.city, c.state, c.zip].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
}

function propertyAddress(p: {
  address: string;
  city: string;
  state: string;
  zip: string;
}) {
  return [p.address, [p.city, p.state, p.zip].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
}

function zoneFromAddress(input: {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const zip = String(input.zip || "").trim();
  if (zip && zip !== "00000") {
    const shortZip = zip.slice(0, 5);
    return { zoneKey: `zip:${shortZip}`, zoneLabel: shortZip };
  }
  const city = String(input.city || "").trim();
  const state = String(input.state || "").trim();
  if ((city && city.toLowerCase() !== "unknown") || state) {
    const label = [city, state].filter(Boolean).join(", ");
    return { zoneKey: `area:${label.toLowerCase()}`, zoneLabel: label };
  }
  return { zoneKey: "unknown", zoneLabel: "Unknown zone" };
}

function inferCategory(text: string): ServiceCategory | null {
  if (PELLET_RE.test(text)) return "pellet";
  if (WOOD_RE.test(text)) return "wood";
  if (GAS_RE.test(text)) return "gas";
  return null;
}

function serviceCategoryFromScores(scores: Record<ServiceCategory, number>): ServiceCategory {
  const ranked: ServiceCategory[] = ["gas", "wood", "pellet"];
  let best: ServiceCategory = "unknown";
  let bestScore = 0;
  for (const category of ranked) {
    if (scores[category] > bestScore) {
      best = category;
      bestScore = scores[category];
    }
  }
  return best;
}

function scheduleUrlFor(customer: CustomerPoint) {
  const params = new URLSearchParams({
    create: "1",
    customerId: customer.id,
    customerName: customer.displayName,
    address: customer.address,
    title: `${customer.displayName} - service`,
    jobType: "service",
  });
  return `/schedule?${params.toString()}`;
}

function isScheduledServiceJob(job: any) {
  const status = String(job.status || "");
  if (!["scheduled", "in_progress"].includes(status)) return false;
  const date = isoDate(job.scheduledDate);
  if (!date) return false;
  const typeText = [job.jobType, job.title, job.notes, job.fireplaceUnit?.type].filter(Boolean).join(" ");
  return SERVICE_RE.test(typeText) || ["service", "inspection", "cleaning"].includes(String(job.jobType));
}

async function requireInternalUser() {
  if (!isClerkConfigured()) return null;

  const { userId } = await auth();
  if (userId) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const authError = await requireInternalUser();
    if (authError) return authError;

    const org = await getOrCreateDefaultOrg();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - TARGET_WINDOW_MONTHS);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const cutoffTime = dateMs(cutoffIso);

    const [customerRows, propertyRows, unitRows, invoiceRows, planRows, jobRows, latestOutreach] = await Promise.all([
      db.select().from(customers).where(eq(customers.orgId, org.id)),
      db.select().from(properties).where(eq(properties.orgId, org.id)),
      db.select().from(fireplaceUnits).where(eq(fireplaceUnits.orgId, org.id)),
      db
        .select({
          customerId: invoices.customerId,
          issueDate: invoices.issueDate,
          notes: invoices.notes,
          lineDescription: invoiceLineItems.description,
        })
        .from(invoices)
        .leftJoin(invoiceLineItems, eq(invoiceLineItems.invoiceId, invoices.id))
        .where(eq(invoices.orgId, org.id)),
      db.select().from(servicePlans).where(eq(servicePlans.orgId, org.id)),
      getJobs().catch(() => []),
      listLatestServiceOutreach(org.id).catch(() => new Map()),
    ]);

    const propsByCustomer = new Map<string, typeof propertyRows[number][]>();
    for (const p of propertyRows) {
      const list = propsByCustomer.get(p.customerId) || [];
      list.push(p);
      propsByCustomer.set(p.customerId, list);
    }

    const unitsByProperty = new Map<string, typeof unitRows[number][]>();
    for (const unit of unitRows) {
      const list = unitsByProperty.get(unit.propertyId) || [];
      list.push(unit);
      unitsByProperty.set(unit.propertyId, list);
    }

    const invoiceEvidence = new Map<string, Array<{ date: string; text: string }>>();
    for (const row of invoiceRows) {
      const text = [row.notes, row.lineDescription].filter(Boolean).join(" ");
      if (!SERVICE_RE.test(text)) continue;
      const date = isoDate(row.issueDate);
      if (!date) continue;
      const list = invoiceEvidence.get(row.customerId) || [];
      list.push({ date, text });
      invoiceEvidence.set(row.customerId, list);
    }

    const plansByCustomer = new Set(planRows.filter((p) => p.isActive !== false).map((p) => p.customerId));
    const customerIds = new Set(customerRows.flatMap((c) => [c.id, c.qbCustomerId].filter(Boolean) as string[]));
    const jobEvidence = new Map<string, Array<{ date: string; text: string }>>();
    const scheduledByCustomer = new Map<string, { id: string; date: string }>();
    for (const job of jobRows) {
      const customerId = String(job.customerId || "");
      if (!customerIds.has(customerId)) continue;
      if (isScheduledServiceJob(job)) {
        const scheduledDate = isoDate(job.scheduledDate);
        if (scheduledDate) {
          const existing = scheduledByCustomer.get(customerId);
          if (!existing || dateMs(scheduledDate) < dateMs(existing.date)) {
            scheduledByCustomer.set(customerId, { id: String(job.id || ""), date: scheduledDate });
          }
        }
      }
      const text = [job.jobType, job.title, job.notes, job.fireplaceUnit?.type, job.fireplaceUnit?.brand, job.fireplaceUnit?.model]
        .filter(Boolean)
        .join(" ");
      if (!SERVICE_RE.test(text) && !["service", "inspection", "cleaning"].includes(String(job.jobType))) continue;
      const date = isoDate(job.completedAt || job.scheduledDate);
      if (!date) continue;
      const list = jobEvidence.get(customerId) || [];
      list.push({ date, text });
      jobEvidence.set(customerId, list);
    }

    const items: CustomerPoint[] = customerRows
      .filter((c) => c.isActive !== false)
      .map((c) => {
        const props = (propsByCustomer.get(c.id) || []).sort((a, b) => {
          const aScore = (a.isPrimary ? 2 : 0) + (a.lat && a.lng ? 1 : 0);
          const bScore = (b.isPrimary ? 2 : 0) + (b.lat && b.lng ? 1 : 0);
          return bScore - aScore;
        });
        const primary = props[0] || null;
        const units = props.flatMap((p) => unitsByProperty.get(p.id) || []);
        const scores: Record<ServiceCategory, number> = { gas: 0, wood: 0, pellet: 0, unknown: 0 };
        const evidence: string[] = [];
        const serviceDates: string[] = [];

        for (const unit of units) {
          const text = [unit.fuelType, unit.brand, unit.model, unit.nickname, unit.notes].filter(Boolean).join(" ");
          const category = inferCategory(text);
          if (category) scores[category] += 4;
          const last = isoDate(unit.lastServiceDate);
          if (last) {
            serviceDates.push(last);
            evidence.push("fireplace unit service history");
          }
        }

        for (const row of invoiceEvidence.get(c.id) || []) {
          serviceDates.push(row.date);
          const category = inferCategory(row.text);
          if (category) scores[category] += 2;
          evidence.push("invoice service line");
        }

        for (const id of [c.id, c.qbCustomerId].filter(Boolean) as string[]) {
          for (const row of jobEvidence.get(id) || []) {
            serviceDates.push(row.date);
            const category = inferCategory(row.text);
            if (category) scores[category] += 3;
            evidence.push("job service history");
          }
        }

        const serviceCountTotal = serviceDates.length;
        const serviceCount18mo = serviceDates.filter((date) => dateMs(date) >= cutoffTime).length;
        const lastServiceDate = serviceDates.sort((a, b) => dateMs(b) - dateMs(a))[0] || null;
        const displayName = displayNameFor(c);
        const address = primary ? propertyAddress(primary) : customerAddress(c);
        const zone = primary ? zoneFromAddress(primary) : zoneFromAddress(c);
        const lat = primary?.lat != null ? Number(primary.lat) : null;
        const lng = primary?.lng != null ? Number(primary.lng) : null;
        const scheduled =
          scheduledByCustomer.get(c.id) ||
          (c.qbCustomerId ? scheduledByCustomer.get(c.qbCustomerId) : undefined) ||
          null;
        const outreach = latestOutreach.get(c.id) || null;

        const item: CustomerPoint = {
          id: c.id,
          qbCustomerId: c.qbCustomerId,
          displayName,
          email: c.email,
          phone: c.phone,
          phoneAlt: c.phoneAlt,
          address,
          zoneKey: zone.zoneKey,
          zoneLabel: zone.zoneLabel,
          propertyId: primary?.id || null,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          serviceCategory: serviceCategoryFromScores(scores),
          isTarget: serviceCount18mo > 0,
          lastServiceDate,
          serviceCount18mo,
          serviceCountTotal,
          hasServicePlan: plansByCustomer.has(c.id),
          scheduled: Boolean(scheduled),
          scheduledJobId: scheduled?.id || null,
          scheduledDate: scheduled?.date || null,
          outreachStatus: outreach?.outcome || null,
          outreachNote: outreach?.note || null,
          outreachContactDate: outreach?.contactDate || null,
          outreachNeedsFollowUp: Boolean(outreach?.needsFollowUp),
          outreachFollowUpDate: outreach?.followUpDate || null,
          outreachUpdatedAt: outreach?.createdAt || null,
          evidence: [...new Set(evidence)].slice(0, 4),
          scheduleUrl: "",
        };
        item.scheduleUrl = scheduleUrlFor(item);
        return item;
      });

    const mapped = items.filter((item) => item.lat != null && item.lng != null);
    const target = items.filter((item) => item.isTarget);

    return NextResponse.json({
      windowMonths: TARGET_WINDOW_MONTHS,
      cutoffDate: cutoffIso,
      items,
      summaries: {
        customers: items.length,
        mapped: mapped.length,
        unmapped: target.filter((item) => item.lat == null || item.lng == null).length,
        targetCustomers: target.length,
        targetMapped: target.filter((item) => item.lat != null && item.lng != null).length,
        unscheduledTargets: target.filter((item) => !item.scheduled).length,
        scheduledTargets: target.filter((item) => item.scheduled).length,
        gas: target.filter((item) => item.serviceCategory === "gas").length,
        wood: target.filter((item) => item.serviceCategory === "wood").length,
        pellet: target.filter((item) => item.serviceCategory === "pellet").length,
        unknown: target.filter((item) => item.serviceCategory === "unknown").length,
      },
    });
  } catch (err) {
    console.error("Service map failed:", err);
    return NextResponse.json({ error: "Failed to load service map" }, { status: 500 });
  }
}
