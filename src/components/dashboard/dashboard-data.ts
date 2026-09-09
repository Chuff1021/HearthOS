export type DashboardSource = "profit" | "customers" | "vendors" | "dispatch" | "jobs" | "activity";

export const QUICK_ADD_JOB_HREF = "/jobs?create=1";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing data");
  return value as Record<string, unknown>;
}

function numbers(value: unknown, keys: string[]) {
  const row = record(value);
  if (keys.some((key) => typeof row[key] !== "number" || !Number.isFinite(row[key]))) {
    throw new Error("Missing numeric data");
  }
  return row;
}

function strings(value: unknown, keys: string[]) {
  const row = record(value);
  if (keys.some((key) => typeof row[key] !== "string")) throw new Error("Missing text data");
  return row;
}

function rows(value: unknown, validate: (row: unknown) => void) {
  if (!Array.isArray(value)) throw new Error("Missing rows");
  value.forEach(validate);
  return value;
}

// Validate the fields consumed here; never interpret a malformed success as an empty dataset.
export function parseDashboardPayload(source: DashboardSource, value: unknown): unknown {
  const data = source === "jobs" && Array.isArray(value) ? { jobs: value } : record(value);
  if (data.error) throw new Error("Source unavailable");
  switch (source) {
    case "profit": {
      const stats = numbers(data.windowStats, ["revenue", "profit", "invoiceCount", "cogs", "billable"]);
      if (stats.margin !== null) numbers(stats, ["margin"]);
      break;
    }
    case "customers":
      numbers(data.moneyBar, ["totalDue", "openInvoiceCount", "overdueCount"]);
      rows(data.items, (item) => {
        strings(item, ["id", "displayName"]);
        const row = numbers(item, ["balance", "totalRevenue"]);
        if (row.lastActivity !== null) strings(row, ["lastActivity"]);
      });
      break;
    case "vendors":
      numbers(data.moneyBar, ["totalOwed", "openBillCount", "overdueCount", "openPOValue"]);
      break;
    case "dispatch":
      numbers(data.stats, ["activeTechs", "onJob", "unassigned"]);
      rows(data.techs, (item) => {
        const tech = strings(item, ["id", "name"]);
        numbers(tech, ["jobsToday", "jobsDone"]);
        for (const key of ["currentJob", "nextJob"]) {
          if (tech[key] != null) strings(tech[key], ["id", "title", "customer"]);
        }
      });
      rows(data.unassignedJobs, (item) => { strings(item, ["id", "title", "scheduledTime"]); });
      break;
    case "jobs": {
      const jobs = rows(data.jobs, (item) => {
        const job = strings(item, ["id", "title", "customerName", "status", "scheduledTimeStart"]);
        rows(job.assignedTechs, (tech) => { strings(tech, ["id", "name"]); });
      });
      if (typeof data.total === "number" && data.total > jobs.length) throw new Error("Incomplete schedule");
      return jobs;
    }
    case "activity":
      return rows(data.activity, (item) => {
        const row = strings(item, ["id", "type", "title", "href", "at"]);
        if (row.amount !== null) numbers(row, ["amount"]);
      });
  }
  return data;
}

export async function fetchDashboardData<T>(source: DashboardSource, url: string, signal: AbortSignal, request = fetch): Promise<T> {
  const response = await request(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Source unavailable");
  return parseDashboardPayload(source, await response.json()) as T;
}

export function assignmentCoverage(jobs: Array<{ assignedTechs: unknown[] }> | null) {
  if (!jobs?.length) return null;
  return Math.round(jobs.filter((job) => job.assignedTechs.length > 0).length / jobs.length * 100);
}
