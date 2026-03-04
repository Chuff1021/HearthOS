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

  // Keep table bounded
  await sql`
    delete from tech_locations_live
    where id in (
      select id from tech_locations_live
      order by ts desc
      offset 50000
    );
  `;

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
