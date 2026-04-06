import postgres from 'postgres';

export interface TechLocationPoint {
  techId: string;
  techName?: string;
  techEmail?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
}

export interface TechMileageSummary {
  dayMiles: number;
  weekMiles: number;
  monthMiles: number;
}

let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sqlClient;
}

async function ensureTable() {
  const sql = getSql();
  if (!sql) return;
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists tech_locations_live (
          id bigserial primary key,
          tech_id text not null,
          tech_name text,
          tech_email text,
          lat double precision not null,
          lng double precision not null,
          accuracy double precision,
          speed double precision,
          heading double precision,
          ts timestamptz not null default now()
        );
      `;
      await sql`create index if not exists idx_tech_locations_live_tech_ts on tech_locations_live (tech_id, ts desc);`;
      await sql`create index if not exists idx_tech_locations_live_email_ts on tech_locations_live (tech_email, ts desc);`;
    })();
  }
  await initPromise;
}

export async function addLocationPoint(point: TechLocationPoint) {
  const sql = getSql();
  if (!sql) return point;
  await ensureTable();

  await sql`
    insert into tech_locations_live
      (tech_id, tech_name, tech_email, lat, lng, accuracy, speed, heading, ts)
    values
      (${point.techId}, ${point.techName || null}, ${point.techEmail || null}, ${point.lat}, ${point.lng}, ${point.accuracy ?? null}, ${point.speed ?? null}, ${point.heading ?? null}, ${point.timestamp});
  `;

  // Probabilistic 30-day pruning (runs ~1% of inserts to avoid write amplification)
  if (Math.random() < 0.01) {
    await sql`
      delete from tech_locations_live
      where ts < now() - interval '30 days';
    `;
  }

  return point;
}

export async function getLatestLocationsByTech(): Promise<TechLocationPoint[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureTable();

  const rows = await sql<{
    tech_id: string;
    tech_name: string | null;
    tech_email: string | null;
    lat: number;
    lng: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    ts: string;
  }[]>`
    select distinct on (tech_id)
      tech_id, tech_name, tech_email, lat, lng, accuracy, speed, heading, ts
    from tech_locations_live
    where ts >= now() - interval '24 hours'
    order by tech_id, ts desc;
  `;

  return rows.map((r) => ({
    techId: r.tech_id,
    techName: r.tech_name || undefined,
    techEmail: r.tech_email || undefined,
    lat: Number(r.lat),
    lng: Number(r.lng),
    accuracy: r.accuracy ?? undefined,
    speed: r.speed ?? undefined,
    heading: r.heading ?? undefined,
    timestamp: new Date(r.ts).toISOString(),
  }));
}

export async function getLocationHistory(techId: string, limit = 100): Promise<TechLocationPoint[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureTable();

  const rows = await sql<{
    tech_id: string;
    tech_name: string | null;
    tech_email: string | null;
    lat: number;
    lng: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    ts: string;
  }[]>`
    select tech_id, tech_name, tech_email, lat, lng, accuracy, speed, heading, ts
    from tech_locations_live
    where tech_id = ${techId}
    order by ts desc
    limit ${Math.max(1, Math.min(limit, 1000))};
  `;

  return rows.map((r) => ({
    techId: r.tech_id,
    techName: r.tech_name || undefined,
    techEmail: r.tech_email || undefined,
    lat: Number(r.lat),
    lng: Number(r.lng),
    accuracy: r.accuracy ?? undefined,
    speed: r.speed ?? undefined,
    heading: r.heading ?? undefined,
    timestamp: new Date(r.ts).toISOString(),
  }));
}

function haversineMiles(a: TechLocationPoint, b: TechLocationPoint) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function shouldCountSegment(prev: TechLocationPoint, next: TechLocationPoint) {
  const prevAt = new Date(prev.timestamp).getTime();
  const nextAt = new Date(next.timestamp).getTime();
  if (!Number.isFinite(prevAt) || !Number.isFinite(nextAt) || nextAt <= prevAt) return false;

  const minutes = (nextAt - prevAt) / 60000;
  if (minutes > 120) return false;

  const distance = haversineMiles(prev, next);
  if (distance < 0.02) return false;
  if (distance > 25) return false;

  const accuracy = Math.max(prev.accuracy || 0, next.accuracy || 0);
  if (accuracy > 250 && distance < 0.25) return false;

  const mph = distance / (minutes / 60);
  if (mph > 95) return false;

  return true;
}

function sumMiles(points: TechLocationPoint[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (shouldCountSegment(points[i - 1], points[i])) {
      total += haversineMiles(points[i - 1], points[i]);
    }
  }
  return Number(total.toFixed(1));
}

export async function getMileageSummary(techId: string): Promise<TechMileageSummary> {
  const sql = getSql();
  if (!sql) return { dayMiles: 0, weekMiles: 0, monthMiles: 0 };
  await ensureTable();

  const rows = await sql<{
    tech_id: string;
    tech_name: string | null;
    tech_email: string | null;
    lat: number;
    lng: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    ts: string;
  }[]>`
    select tech_id, tech_name, tech_email, lat, lng, accuracy, speed, heading, ts
    from tech_locations_live
    where tech_id = ${techId}
      and ts >= now() - interval '31 days'
    order by ts asc;
  `;

  const points = rows.map((r) => ({
    techId: r.tech_id,
    techName: r.tech_name || undefined,
    techEmail: r.tech_email || undefined,
    lat: Number(r.lat),
    lng: Number(r.lng),
    accuracy: r.accuracy ?? undefined,
    speed: r.speed ?? undefined,
    heading: r.heading ?? undefined,
    timestamp: new Date(r.ts).toISOString(),
  }));

  const now = Date.now();
  const dayCutoff = now - 24 * 60 * 60 * 1000;
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const monthCutoff = now - 30 * 24 * 60 * 60 * 1000;

  return {
    dayMiles: sumMiles(points.filter((p) => new Date(p.timestamp).getTime() >= dayCutoff)),
    weekMiles: sumMiles(points.filter((p) => new Date(p.timestamp).getTime() >= weekCutoff)),
    monthMiles: sumMiles(points.filter((p) => new Date(p.timestamp).getTime() >= monthCutoff)),
  };
}
