import postgres from 'postgres';

export type GabeJobType =
  | 'manual_ingestion'
  | 'diagram_reprocess'
  | 'regression_test'
  | 'content_site_improvement';

export type GabeJobStatus = 'queued' | 'active' | 'completed' | 'failed';

export type GabeJob = {
  id: string;
  jobType: GabeJobType;
  status: GabeJobStatus;
  recurring: boolean;
  intervalMin?: number;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  runAt: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for gabe ops');
  if (!sqlClient) sqlClient = postgres(process.env.DATABASE_URL, { prepare: false, max: 3 });
  return sqlClient;
}

async function ensureTables() {
  const sql = getSql();
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists gabe_jobs (
          id text primary key,
          job_type text not null,
          status text not null,
          recurring boolean not null default false,
          interval_min integer,
          payload jsonb,
          result jsonb,
          error text,
          run_at timestamptz not null,
          started_at timestamptz,
          finished_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `;
      await sql`create index if not exists idx_gabe_jobs_status_runat on gabe_jobs (status, run_at);`;
      await sql`create index if not exists idx_gabe_jobs_type on gabe_jobs (job_type, created_at desc);`;
    })();
  }
  await initPromise;
}

function mapRow(r: any): GabeJob {
  return {
    id: r.id,
    jobType: r.job_type,
    status: r.status,
    recurring: !!r.recurring,
    intervalMin: r.interval_min ?? undefined,
    payload: r.payload || undefined,
    result: r.result || undefined,
    error: r.error || undefined,
    runAt: new Date(r.run_at).toISOString(),
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : undefined,
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : undefined,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function id() {
  return `job-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

export async function ensureDefaultRecurringJobs() {
  const sql = getSql();
  await ensureTables();
  const defaults: Array<{ jobType: GabeJobType; intervalMin: number }> = [
    { jobType: 'manual_ingestion', intervalMin: 240 },
    { jobType: 'diagram_reprocess', intervalMin: 360 },
    { jobType: 'regression_test', intervalMin: 30 },
    { jobType: 'content_site_improvement', intervalMin: 720 },
  ];

  for (const d of defaults) {
    const existing = await sql`select id from gabe_jobs where recurring=true and job_type=${d.jobType} limit 1`;
    if (existing.length === 0) {
      await createJob({
        jobType: d.jobType,
        recurring: true,
        intervalMin: d.intervalMin,
        runAt: new Date().toISOString(),
      });
    }
  }
}

export async function createJob(input: {
  jobType: GabeJobType;
  recurring?: boolean;
  intervalMin?: number;
  runAt?: string;
  payload?: Record<string, unknown>;
}): Promise<GabeJob> {
  const sql = getSql();
  await ensureTables();
  const now = new Date().toISOString();
  const jid = id();
  const runAt = input.runAt || now;
  await sql`
    insert into gabe_jobs (id, job_type, status, recurring, interval_min, payload, run_at, created_at, updated_at)
    values (${jid}, ${input.jobType}, 'queued', ${!!input.recurring}, ${input.intervalMin ?? null}, ${JSON.stringify(input.payload || {})}::jsonb, ${runAt}, ${now}, ${now})
  `;
  const rows = await sql`select * from gabe_jobs where id=${jid} limit 1`;
  return mapRow(rows[0]);
}

export async function listJobs(limit = 100): Promise<GabeJob[]> {
  const sql = getSql();
  await ensureTables();
  const rows = await sql`select * from gabe_jobs order by run_at asc, created_at desc limit ${Math.max(1, Math.min(limit, 500))}`;
  return rows.map(mapRow);
}

export async function runSupervisorTick(baseUrl: string) {
  const sql = getSql();
  await ensureTables();
  await ensureDefaultRecurringJobs();

  const due = await sql`
    select * from gabe_jobs
    where status='queued' and run_at <= now()
    order by run_at asc
    limit 5
  `;

  const results: Array<{ id: string; status: GabeJobStatus; note?: string; error?: string }> = [];

  for (const r of due) {
    const j = mapRow(r);
    await sql`update gabe_jobs set status='active', started_at=now(), updated_at=now() where id=${j.id}`;
    try {
      let result: any = {};
      if (j.jobType === 'regression_test') {
        const res = await fetch(`${baseUrl}/api/gabe/test-engine`, { cache: 'no-store' });
        result = await res.json();
      } else if (j.jobType === 'manual_ingestion') {
        result = { queued: true, action: 'run ingest_manual.js for new manuals' };
      } else if (j.jobType === 'diagram_reprocess') {
        result = { queued: true, action: 'reprocess diagrams via OCR pipeline' };
      } else {
        result = { queued: true, action: 'run content/site refinement checks' };
      }

      await sql`
        update gabe_jobs
        set status='completed', result=${JSON.stringify(result)}::jsonb, finished_at=now(), updated_at=now()
        where id=${j.id}
      `;
      results.push({ id: j.id, status: 'completed', note: j.jobType });

      if (j.recurring && j.intervalMin) {
        const nextRun = new Date(Date.now() + j.intervalMin * 60 * 1000).toISOString();
        await createJob({
          jobType: j.jobType,
          recurring: true,
          intervalMin: j.intervalMin,
          runAt: nextRun,
          payload: j.payload,
        });
      }
    } catch (err) {
      await sql`
        update gabe_jobs
        set status='failed', error=${err instanceof Error ? err.message : 'job_failed'}, finished_at=now(), updated_at=now()
        where id=${j.id}
      `;
      results.push({ id: j.id, status: 'failed', error: err instanceof Error ? err.message : 'job_failed' });
    }
  }

  return results;
}
