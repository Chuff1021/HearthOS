import postgres from "postgres";
import { createHash, createHmac } from "node:crypto";
import { stableUuid } from "../ingest/ids";

let sql: ReturnType<typeof postgres> | null = null;
const workerMetrics = {
  processed: 0,
  retries: 0,
  failed: 0,
  lastRunAt: null as string | null,
  totalLatencyMs: 0,
  activationEvents: 0,
};

function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 4 });
  return sql;
}

export async function ensureGovernanceHardeningTables() {
  const s = db();
  if (!s) return;
  await s`create table if not exists gabe_source_worker_jobs (
      job_id text primary key, source_id text not null, job_type text not null, status text not null default 'queued',
      attempts int not null default 0, max_attempts int not null default 5, last_error text, next_retry_at timestamptz,
      payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
  await s`create table if not exists gabe_source_checksum_snapshots (
      snapshot_id text primary key, source_id text not null, checksum text, metadata_hash text, observed_at timestamptz not null default now(),
      changed_binary boolean not null default false, changed_metadata boolean not null default false, revision_hint text, notes text)`;
  await s`create table if not exists gabe_source_supersession_edges (
      edge_id text primary key, from_source_id text not null, to_source_id text not null, relation text not null default 'supersedes',
      confidence double precision not null default 0, status text not null default 'proposed', reason text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
  await s`create table if not exists gabe_source_activation_audit (
      event_id text primary key, source_id text not null, event_type text not null, actor text, action text, reason text,
      details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now())`;
  await s`create table if not exists gabe_source_dead_letter_jobs (
      dlq_id text primary key, job_id text not null, source_id text not null, reason text, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now())`;
  await s`create table if not exists gabe_source_diff_summaries (
      diff_id text primary key, source_id text not null, snapshot_from_id text, snapshot_to_id text, summary_json jsonb not null default '{}'::jsonb, summary_text text, created_at timestamptz not null default now())`;
  await s`create table if not exists gabe_source_signed_actions (
      signed_action_id text primary key, source_id text not null, actor text not null, actor_role text not null, action text not null,
      payload_hash text not null, signature text not null, verified boolean not null default false, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now())`;
}

function backoffMs(attempt: number) {
  const base = Number(process.env.GOVERNANCE_RETRY_BASE_MS || 60_000);
  const max = Number(process.env.GOVERNANCE_RETRY_MAX_MS || 30 * 60_000);
  return Math.min(max, base * Math.pow(2, Math.max(0, attempt - 1)));
}

export async function enqueueSourceJob(input: { source_id: string; job_type: string; payload?: any; dedupeKey?: string }) {
  const s = db(); if (!s) return null;
  await ensureGovernanceHardeningTables();
  const dedupe = input.dedupeKey || `${input.source_id}|${input.job_type}`;
  const existing = await s<any[]>`select job_id from gabe_source_worker_jobs where source_id=${input.source_id} and job_type=${input.job_type} and status in ('queued','retry','running') limit 1`;
  if (existing[0]) return { job_id: existing[0].job_id, deduped: true };

  const job_id = stableUuid(`${dedupe}|${Date.now()}`);
  await s`insert into gabe_source_worker_jobs (job_id, source_id, job_type, status, payload, created_at, updated_at)
          values (${job_id}, ${input.source_id}, ${input.job_type}, 'queued', ${JSON.stringify(input.payload || {})}::jsonb, now(), now())`;
  return { job_id, deduped: false };
}

function buildDiffSummary(prev: any | null, curr: any) {
  const changes: any = {
    title_changed: prev ? prev.title !== curr.title : false,
    revision_changed: prev ? prev.revision !== curr.revision : false,
    model_changed: prev ? prev.model !== curr.model : false,
    family_changed: prev ? prev.family !== curr.family : false,
    size_changed: prev ? prev.size !== curr.size : false,
    publication_date_changed: prev ? String(prev.publication_date || "") !== String(curr.publication_date || "") : false,
    effective_date_changed: prev ? String(prev.effective_date || "") !== String(curr.effective_date || "") : false,
    checksum_only_change: prev ? prev.checksum !== curr.checksum && prev.revision === curr.revision : false,
    possible_supersession_indicator: Boolean(curr.revision && prev?.revision && String(curr.revision) > String(prev.revision)),
  };
  const summaryText = Object.entries(changes).filter(([, v]) => Boolean(v)).map(([k]) => k.replace(/_/g, " ")).join(", ") || "no notable metadata changes";
  return { summary_json: changes, summary_text: summaryText };
}

async function persistDiffSummary(source_id: string, fromSnapshot: any | null, toSnapshot: any, prevSource: any | null, currSource: any) {
  const s = db(); if (!s) return;
  const diff = buildDiffSummary(prevSource, currSource);
  const diff_id = stableUuid(`${source_id}|${toSnapshot.snapshot_id}|diff`);
  await s`insert into gabe_source_diff_summaries (diff_id, source_id, snapshot_from_id, snapshot_to_id, summary_json, summary_text, created_at)
          values (${diff_id}, ${source_id}, ${fromSnapshot?.snapshot_id || null}, ${toSnapshot.snapshot_id}, ${JSON.stringify(diff.summary_json)}::jsonb, ${diff.summary_text}, now())`;

  if (diff.summary_json.possible_supersession_indicator) {
    await s`insert into gabe_source_review_queue (queue_id, source_id, reason, severity, status, created_at, updated_at)
            values (${stableUuid(`${source_id}|possible_supersession_indicator`)}, ${source_id}, 'possible_supersession_indicator', 'medium', 'open', now(), now())
            on conflict do nothing`;
  }
}

export async function processNextSourceJob() {
  const s = db(); if (!s) return { ok: false, reason: "no_db" };
  await ensureGovernanceHardeningTables();
  const started = Date.now();

  const jobs = await s<any[]>`
    with c as (
      select job_id from gabe_source_worker_jobs
      where status in ('queued','retry') and (next_retry_at is null or next_retry_at <= now())
      order by updated_at asc
      limit 1
      for update skip locked
    )
    update gabe_source_worker_jobs j
    set status='running', attempts=j.attempts+1, updated_at=now()
    from c
    where j.job_id=c.job_id
    returning j.*`;
  const job = jobs[0];
  if (!job) return { ok: true, message: "no_jobs" };

  try {
    if (job.job_type === "download_parse") {
      const srcRows = await s<any[]>`select * from gabe_source_registry where source_id=${job.source_id} limit 1`;
      const src = srcRows[0];
      if (!src) throw new Error("source_not_found");

      const prevSnapshot = (await s<any[]>`select * from gabe_source_checksum_snapshots where source_id=${src.source_id} order by observed_at desc limit 1`)[0] || null;
      const prevSource = src;

      const res = await fetch(src.source_url, { redirect: "follow" });
      const buf = Buffer.from(await res.arrayBuffer());
      const checksum = createHash("sha256").update(buf).digest("hex");
      const metadataHash = createHash("sha256").update(`${src.title}|${src.revision || ""}|${src.document_kind || ""}|${src.model || ""}|${src.family || ""}|${src.size || ""}`).digest("hex");

      const changedBinary = prevSnapshot ? prevSnapshot.checksum !== checksum : true;
      const changedMetadata = prevSnapshot ? prevSnapshot.metadata_hash !== metadataHash : true;

      const snapshot = {
        snapshot_id: stableUuid(`${src.source_id}|${Date.now()}|${checksum}`),
        source_id: src.source_id,
        checksum,
        metadata_hash: metadataHash,
      };
      await s`insert into gabe_source_checksum_snapshots (snapshot_id, source_id, checksum, metadata_hash, observed_at, changed_binary, changed_metadata)
              values (${snapshot.snapshot_id}, ${snapshot.source_id}, ${snapshot.checksum}, ${snapshot.metadata_hash}, now(), ${changedBinary}, ${changedMetadata})`;

      const ingestStatus = changedBinary || changedMetadata ? "changed" : "downloaded";
      await s`update gabe_source_registry set checksum=${checksum}, ingest_status=${ingestStatus}, last_checked_at=now(), updated_at=now() where source_id=${src.source_id}`;
      const currSource = (await s<any[]>`select * from gabe_source_registry where source_id=${src.source_id} limit 1`)[0];
      await persistDiffSummary(src.source_id, prevSnapshot, snapshot, prevSource, currSource);

      if (src.revision) {
        const peers = await s<any[]>`select * from gabe_source_registry where title=${src.title} and source_id<>${src.source_id} and revision is not null`;
        for (const p of peers) {
          if (String(src.revision) > String(p.revision)) {
            await upsertSupersessionEdge(src.source_id, p.source_id, 0.9, "revision_order");
          } else if (String(src.revision) === String(p.revision) && src.checksum && p.checksum && src.checksum !== p.checksum) {
            await s`insert into gabe_source_review_queue (queue_id, source_id, reason, severity, status, created_at, updated_at)
                    values (${stableUuid(`${src.source_id}|ambiguous_revision`)}, ${src.source_id}, 'ambiguous_revision', 'high', 'open', now(), now())
                    on conflict do nothing`;
          }
        }
      }

      await auditSourceEvent({ source_id: src.source_id, event_type: "download_parse", action: "processed", reason: ingestStatus, details: { changedBinary, changedMetadata } });
    }

    await s`update gabe_source_worker_jobs set status='completed', updated_at=now() where job_id=${job.job_id}`;
    workerMetrics.processed += 1;
    workerMetrics.lastRunAt = new Date().toISOString();
    workerMetrics.totalLatencyMs += Date.now() - started;
    return { ok: true, job_id: job.job_id };
  } catch (e: any) {
    const attempts = Number(job.attempts || 0);
    const maxAttempts = Number(job.max_attempts || 5);
    const terminal = attempts >= maxAttempts;
    const retryAt = terminal ? null : new Date(Date.now() + backoffMs(attempts));

    await s`update gabe_source_worker_jobs
            set status=${terminal ? "failed" : "retry"}, last_error=${String(e?.message || e)}, next_retry_at=${retryAt}, updated_at=now()
            where job_id=${job.job_id}`;

    if (terminal) {
      const dlq_id = stableUuid(`${job.job_id}|dlq`);
      await s`insert into gabe_source_dead_letter_jobs (dlq_id, job_id, source_id, reason, payload, created_at)
              values (${dlq_id}, ${job.job_id}, ${job.source_id}, ${String(e?.message || e)}, ${JSON.stringify(job.payload || {})}::jsonb, now())`;
      workerMetrics.failed += 1;
    } else {
      workerMetrics.retries += 1;
    }

    await auditSourceEvent({ source_id: job.source_id, event_type: "worker_error", action: terminal ? "failed" : "retry", reason: String(e?.message || e), details: { job_id: job.job_id } });
    return { ok: false, job_id: job.job_id, error: String(e?.message || e) };
  }
}

export async function runWorkerLoop(opts?: { concurrency?: number; pollMs?: number; iterations?: number }) {
  const concurrency = Math.max(1, Number(opts?.concurrency || process.env.GOVERNANCE_WORKER_CONCURRENCY || 2));
  const pollMs = Math.max(250, Number(opts?.pollMs || process.env.GOVERNANCE_WORKER_POLL_MS || 2000));
  const iterations = Number(opts?.iterations || process.env.GOVERNANCE_WORKER_ITERATIONS || 0); // 0 = infinite

  let loops = 0;
  while (iterations === 0 || loops < iterations) {
    await Promise.all(Array.from({ length: concurrency }).map(() => processNextSourceJob()));
    loops += 1;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { ok: true, loops, concurrency, pollMs };
}

export async function upsertSupersessionEdge(from_source_id: string, to_source_id: string, confidence: number, reason: string) {
  const s = db(); if (!s) return;
  const edge_id = stableUuid(`${from_source_id}|${to_source_id}|supersedes`);
  const status = confidence >= 0.85 ? "accepted" : "proposed";
  await s`insert into gabe_source_supersession_edges (edge_id, from_source_id, to_source_id, relation, confidence, status, reason, created_at, updated_at)
          values (${edge_id}, ${from_source_id}, ${to_source_id}, 'supersedes', ${confidence}, ${status}, ${reason}, now(), now())
          on conflict (edge_id) do update set confidence=excluded.confidence, status=excluded.status, reason=excluded.reason, updated_at=now()`;

  if (status === "accepted") {
    await s`update gabe_source_registry set supersedes_source_id=${to_source_id}, updated_at=now() where source_id=${from_source_id}`;
    await s`update gabe_source_registry set superseded_by_source_id=${from_source_id}, updated_at=now() where source_id=${to_source_id}`;
  } else {
    await s`insert into gabe_source_review_queue (queue_id, source_id, reason, severity, status, created_at, updated_at)
            values (${stableUuid(`${from_source_id}|supersession_ambiguous`)}, ${from_source_id}, 'supersession_ambiguous', 'high', 'open', now(), now())
            on conflict do nothing`;
  }
}

export async function auditSourceEvent(input: { source_id: string; event_type: string; actor?: string; action?: string; reason?: string; details?: any }) {
  const s = db(); if (!s) return null;
  const event_id = stableUuid(`${input.source_id}|${input.event_type}|${Date.now()}|${Math.random()}`);
  await s`insert into gabe_source_activation_audit (event_id, source_id, event_type, actor, action, reason, details, created_at)
          values (${event_id}, ${input.source_id}, ${input.event_type}, ${input.actor || "system"}, ${input.action || null}, ${input.reason || null}, ${JSON.stringify(input.details || {})}::jsonb, now())`;
  return { event_id };
}

const RBAC: Record<string, string[]> = {
  reviewer: ["approve", "reject", "mark_ambiguous", "request_reparse"],
  approver: ["approve", "reject", "mark_ambiguous", "request_reparse", "mark_superseded"],
  publisher: ["activate", "deactivate", "mark_superseded", "approve", "reject"],
};

function roleAllowed(role: string, action: string) {
  return (RBAC[role] || []).includes(action);
}

function signPayload(input: { actor: string; actor_role: string; action: string; source_id: string; reason?: string; notes?: string }) {
  const payload = JSON.stringify(input);
  const payload_hash = createHash("sha256").update(payload).digest("hex");
  const secret = process.env.GOVERNANCE_SIGNING_SECRET || "dev-governance-secret";
  const signature = createHmac("sha256", secret).update(payload_hash).digest("hex");
  return { payload_hash, signature, verified: Boolean(process.env.GOVERNANCE_SIGNING_SECRET) };
}

export async function reviewerAction(input: {
  source_id: string;
  actor: string;
  actor_role?: "reviewer" | "approver" | "publisher";
  action: "approve" | "reject" | "activate" | "deactivate" | "mark_superseded" | "request_reparse" | "mark_ambiguous";
  reason?: string;
  notes?: string;
}) {
  const s = db(); if (!s) return null;
  await ensureGovernanceHardeningTables();
  const role = input.actor_role || "reviewer";
  if (!roleAllowed(role, input.action)) {
    await auditSourceEvent({ source_id: input.source_id, event_type: "review_action_denied", actor: input.actor, action: input.action, reason: "rbac_denied", details: { role } });
    return { ok: false, error: "rbac_denied" };
  }

  const actionMap: Record<string, { activation?: string; ingest?: string; queueStatus?: string }> = {
    approve: { activation: "approved", queueStatus: "closed" },
    reject: { activation: "rejected", queueStatus: "closed" },
    activate: { activation: "active", queueStatus: "closed" },
    deactivate: { activation: "inactive" },
    mark_superseded: { activation: "superseded" },
    request_reparse: { ingest: "queued", queueStatus: "open" },
    mark_ambiguous: { activation: "pending_review", queueStatus: "open" },
  };
  const m = actionMap[input.action];

  if (m.activation) await s`update gabe_source_registry set activation_status=${m.activation}, updated_at=now() where source_id=${input.source_id}`;
  if (m.ingest) await s`update gabe_source_registry set ingest_status=${m.ingest}, updated_at=now() where source_id=${input.source_id}`;
  if (m.queueStatus) await s`update gabe_source_review_queue set status=${m.queueStatus}, notes=${input.notes || null}, updated_at=now() where source_id=${input.source_id} and status='open'`;

  const signed = signPayload({ actor: input.actor, actor_role: role, action: input.action, source_id: input.source_id, reason: input.reason, notes: input.notes });
  const signed_action_id = stableUuid(`${input.source_id}|${input.actor}|${input.action}|${Date.now()}`);
  await s`insert into gabe_source_signed_actions (signed_action_id, source_id, actor, actor_role, action, payload_hash, signature, verified, details, created_at)
          values (${signed_action_id}, ${input.source_id}, ${input.actor}, ${role}, ${input.action}, ${signed.payload_hash}, ${signed.signature}, ${signed.verified}, ${JSON.stringify({ reason: input.reason, notes: input.notes })}::jsonb, now())`;

  if (input.action === "activate" || input.action === "deactivate") workerMetrics.activationEvents += 1;
  await auditSourceEvent({ source_id: input.source_id, event_type: "review_action", actor: input.actor, action: input.action, reason: input.reason, details: { notes: input.notes, role } });
  return { ok: true, signed_action_id };
}

export async function governanceExpandedDashboard() {
  const s = db(); if (!s) return null;
  await ensureGovernanceHardeningTables();
  const [queued] = await s<any[]>`select count(*)::int as c from gabe_source_worker_jobs where status in ('queued','retry','running')`;
  const [parseFail] = await s<any[]>`select count(*)::int as c from gabe_source_worker_jobs where status='failed'`;
  const [changed] = await s<any[]>`select count(*)::int as c from gabe_source_checksum_snapshots where changed_binary=true or changed_metadata=true`;
  const [pending] = await s<any[]>`select count(*)::int as c from gabe_source_review_queue where status='open'`;
  const [pendingAge] = await s<any[]>`select coalesce(avg(extract(epoch from (now()-created_at))),0)::float8 as sec from gabe_source_review_queue where status='open'`;
  const recently = await s<any[]>`select source_id, activation_status, updated_at from gabe_source_registry where activation_status in ('active','inactive') order by updated_at desc limit 20`;
  const [supStatus] = await s<any[]>`select count(*)::int as c from gabe_source_supersession_edges where status='accepted'`;
  const [jurCount] = await s<any[]>`select count(*)::int as c from gabe_jurisdiction_registry`;
  const actorHistory = await s<any[]>`select source_id, actor, action, created_at from gabe_source_signed_actions order by created_at desc limit 30`;
  const latestDiff = await s<any[]>`select source_id, summary_text, summary_json, created_at from gabe_source_diff_summaries order by created_at desc limit 30`;
  const supersessionSuggestions = await s<any[]>`select from_source_id, to_source_id, confidence, status, reason from gabe_source_supersession_edges where status='proposed' order by confidence desc limit 30`;

  const throughput = workerMetrics.processed;
  const retryRate = throughput > 0 ? workerMetrics.retries / Math.max(1, throughput) : 0;
  const failedParseRate = throughput > 0 ? workerMetrics.failed / Math.max(1, throughput) : 0;
  const activationLatencySec = workerMetrics.activationEvents > 0 ? (workerMetrics.totalLatencyMs / workerMetrics.activationEvents) / 1000 : 0;

  return {
    queued_downloads: queued?.c || 0,
    worker_backlog: queued?.c || 0,
    parse_failures: parseFail?.c || 0,
    changed_checksum_sources: changed?.c || 0,
    pending_approvals: pending?.c || 0,
    review_queue_aging_seconds_avg: pendingAge?.sec || 0,
    recently_activated_deactivated: recently,
    supersession_graph_status: { accepted_edges: supStatus?.c || 0, suggestions: supersessionSuggestions },
    jurisdiction_coverage_health: { mapped_jurisdictions: jurCount?.c || 0 },
    latest_diff_summary: latestDiff,
    actor_history: actorHistory,
    worker_metrics: {
      throughput,
      retry_rate: retryRate,
      failed_parse_rate: failedParseRate,
      activation_latency_seconds_estimate: activationLatencySec,
      last_run_at: workerMetrics.lastRunAt,
    },
  };
}

export async function governanceWorkerStatus() {
  const s = db(); if (!s) return null;
  await ensureGovernanceHardeningTables();
  const [queued] = await s<any[]>`select count(*)::int as c from gabe_source_worker_jobs where status in ('queued','retry')`;
  const [running] = await s<any[]>`select count(*)::int as c from gabe_source_worker_jobs where status='running'`;
  const [failed] = await s<any[]>`select count(*)::int as c from gabe_source_worker_jobs where status='failed'`;
  return {
    queued_jobs: queued?.c || 0,
    running_jobs: running?.c || 0,
    failed_jobs: failed?.c || 0,
    throughput: workerMetrics.processed,
    retry_rate: workerMetrics.processed ? workerMetrics.retries / workerMetrics.processed : 0,
    failed_parse_rate: workerMetrics.processed ? workerMetrics.failed / workerMetrics.processed : 0,
    last_run_at: workerMetrics.lastRunAt,
  };
}
