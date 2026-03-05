import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  }
  return sqlClient;
}

async function ensureTable() {
  const sql = getSql();
  if (!sql) return;
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists gabe_run_metadata (
          id bigserial primary key,
          ts timestamptz not null default now(),
          payload jsonb not null
        );
      `;
      await sql`create index if not exists idx_gabe_run_metadata_ts on gabe_run_metadata (ts desc);`;
    })();
  }
  await initPromise;
}

export async function appendRunMetadata(payload: Record<string, unknown>) {
  const sql = getSql();
  if (!sql) return;
  await ensureTable();
  await sql`insert into gabe_run_metadata (payload) values (${JSON.stringify(payload)}::jsonb)`;
}
