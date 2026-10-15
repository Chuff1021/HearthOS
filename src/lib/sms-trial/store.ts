import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { advanceStatus, assertSmsActor, nextBusinessDay, normalizePhone, SmsError, trialTemplates, type SmsConfig, type SmsEvent } from './domain';
import type { CrmActor } from '@/lib/security/access-policy';

export function smsTrialStore(sql: Sql, config: SmsConfig) {
  async function scopedJob(tx: Sql, actor: CrmActor, jobId: string, sending = false) {
    assertSmsActor(actor, config);
    const [trial] = await tx`SELECT * FROM hearth_sms_trial WHERE org_id=${actor.orgId}`;
    if (!trial || trial.job_id !== jobId || trial.recipient !== config.recipient || trial.employee_id !== config.employeeId) throw new SmsError('SMS test job not found.', 404);
    if (sending && (!config.enabled || !trial.enabled)) throw new SmsError('SMS trial is paused.', 409);
    const [customer] = await tx`SELECT * FROM customers WHERE id=${trial.customer_id} AND org_id=${actor.orgId}`;
    const [employee] = await tx`SELECT * FROM users WHERE id=${trial.employee_id} AND org_id=${actor.orgId} AND is_active=true`;
    const [record] = await tx`SELECT payload FROM hearth_jobs_store WHERE id=${jobId}`;
    const job = typeof record?.payload === 'string' ? JSON.parse(record.payload) : record?.payload;
    if (!customer?.is_active || normalizePhone(customer.phone || '') !== config.recipient || !employee || !job
      || ![customer.id, customer.qb_customer_id].includes(job.customerId)
      || !job.assignedTechs?.some((t: { id: string }) => t.id === config.employeeId)) throw new SmsError('Test customer or technician no longer matches. Contact the office.', 409);
    if (sending && !['scheduled', 'in_progress'].includes(job.status)) throw new SmsError('This job is not active.', 409);
    return { trial, job };
  }
  async function log(tx: Sql, actor: CrmActor, action: string, value: Record<string, unknown>) {
    await tx`INSERT INTO audit_logs(org_id,action,entity_type,entity_id,new_value)
      VALUES(${actor.orgId},${action},'sms_trial',${actor.orgId},${tx.json({ ...value, employeeId: actor.employeeId })})`;
  }
  async function queue(tx: Sql, actor: CrmActor, jobId: string, event: SmsEvent) {
    const [message] = await tx`INSERT INTO hearth_sms_messages(id,org_id,job_id,event,template,recipient,employee_id)
      VALUES(${randomUUID()},${actor.orgId},${jobId},${event},${trialTemplates[event]},${config.recipient},${actor.employeeId})
      ON CONFLICT(org_id,job_id,event) DO UPDATE SET event=hearth_sms_messages.event RETURNING *`;
    return message;
  }
  return {
    async setup(actor: CrmActor) {
      assertSmsActor(actor, config, true);
      if (!config.enabled) throw new SmsError('SMS trial is not enabled.', 409);
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.orgId}:sms-trial`},0))`;
        const [previous] = await tx`SELECT * FROM hearth_sms_trial WHERE org_id=${actor.orgId}`;
        if (previous?.job_id) { await scopedJob(tx, actor, previous.job_id); return previous.job_id as string; }
        const [org] = await tx`SELECT id FROM organizations WHERE id=${actor.orgId} AND slug='default'`;
        const [employee] = await tx`SELECT * FROM users WHERE id=${config.employeeId} AND org_id=${actor.orgId} AND is_active=true AND lower(first_name)='colton' AND lower(last_name)='huff'`;
        if (!org || !employee) throw new SmsError('Verified Colton employee mapping is missing.', 409);
        const matches = await tx`SELECT * FROM customers WHERE org_id=${actor.orgId} AND lower(first_name)='colton' AND lower(last_name)='huff' AND is_active=true`;
        const exact = matches.filter(c => normalizePhone(c.phone || '') === config.recipient);
        if (exact.length > 1) throw new SmsError('Multiple matching customers; office review needed.', 409);
        let customer = exact[0];
        if (!customer) [customer] = await tx`INSERT INTO customers(org_id,first_name,last_name,phone,source,notes,tags)
          VALUES(${actor.orgId},'Colton','Huff',${config.recipient},'sms_trial','Owner-authorized SMS test only. No QuickBooks sync.',${tx.json(['sms-trial'])}) RETURNING *`;
        const jobId = randomUUID();
        const payload = { id: jobId, jobNumber: `SMS-TEST-${jobId.slice(0,8)}`, title: 'TEST - SMS Scheduling / On My Way',
          customerId: customer.qb_customer_id || customer.id, customerName: 'Colton Huff', propertyAddress: '', jobType: 'service', status: 'scheduled', priority: 'normal',
          scheduledDate: nextBusinessDay(), scheduledTimeStart: '09:00', scheduledTimeEnd: '09:30',
          assignedTechs: [{ id: employee.id, name: 'Colton Huff', color: employee.tech_color || '#f97316' }], totalAmount: 0,
          notes: 'Messaging test only; no dispatch. Time zone: America/Chicago. No invoice or QuickBooks customer creation.', photos: [], checklistItems: {},
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        // This production release uses the legacy job store. Tenant ownership of
        // the trial is enforced by the sidecar and validated customer/employee joins.
        await tx`INSERT INTO hearth_jobs_store(id,job_number,scheduled_date,scheduled_time_start,status,payload,created_at,updated_at)
          VALUES(${jobId},${payload.jobNumber},${payload.scheduledDate},'09:00','scheduled',${tx.json(payload)},now(),now())`;
        await tx`INSERT INTO hearth_sms_trial(org_id,enabled,customer_id,job_id,employee_id,recipient,consent_note)
          VALUES(${actor.orgId},true,${customer.id},${jobId},${employee.id},${config.recipient},'Colton explicitly requested scheduling and On My Way test texts to his verified number.')`;
        await queue(tx, actor, jobId, 'scheduled');
        await log(tx, actor, 'create', { jobId, customerId: customer.id, testOnly: true });
        return jobId;
      });
    },
    async state(actor: CrmActor, jobId?: string) {
      assertSmsActor(actor, config, !jobId);
      const [trial] = await sql`SELECT * FROM hearth_sms_trial WHERE org_id=${actor.orgId}`;
      if (jobId) await scopedJob(sql, actor, jobId);
      const messages = trial ? await sql`SELECT id,event,template,status,provider_id,error_code,created_at,updated_at FROM hearth_sms_messages WHERE org_id=${actor.orgId} AND job_id=${trial.job_id} ORDER BY created_at` : [];
      return { enabled: config.enabled && Boolean(trial?.enabled), configured: true, trialOnly: true, recipient: config.recipient,
        jobId: trial?.job_id || null, departedAt: trial?.departed_at || null, messages, admin: ['admin','owner'].includes(actor.role) };
    },
    async toggle(actor: CrmActor, enabled: boolean) {
      assertSmsActor(actor, config, true);
      await sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.orgId}:sms-trial`},0))`;
        await tx`UPDATE hearth_sms_trial SET enabled=${enabled},updated_at=now() WHERE org_id=${actor.orgId}`;
        await log(tx, actor, 'update', { enabled });
      });
    },
    async claim(actor: CrmActor, jobId: string, event: SmsEvent) {
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.orgId}:sms-trial`},0))`;
        await scopedJob(tx, actor, jobId, true);
        if (event === 'scheduled') assertSmsActor(actor, config, true);
        const message = await queue(tx, actor, jobId, event);
        if (message.status !== 'queued' || message.attempted_at) return null;
        const [count] = await tx`SELECT count(*)::int AS count FROM hearth_sms_messages WHERE org_id=${actor.orgId}
          AND (attempted_at AT TIME ZONE 'America/Chicago')::date=(now() AT TIME ZONE 'America/Chicago')::date`;
        if (count.count >= 10) throw new SmsError('Daily test limit reached.', 429);
        await tx`UPDATE hearth_sms_messages SET status='sending',attempted_at=now(),updated_at=now() WHERE id=${message.id} AND org_id=${actor.orgId}`;
        if (event === 'on_my_way') await tx`UPDATE hearth_sms_trial SET departed_at=coalesce(departed_at,now()),updated_at=now() WHERE org_id=${actor.orgId}`;
        await log(tx, actor, 'send', { event, jobId, messageId: message.id });
        return message;
      });
    },
    async record(id: string, status: string, providerId: string | null, errorCode: string | null) {
      await sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const [message] = await tx`SELECT * FROM hearth_sms_messages WHERE org_id=${config.orgId} AND id=${id} FOR UPDATE`;
        if (!message || (message.provider_id && providerId && message.provider_id !== providerId)) throw new SmsError('Message not found.', 404);
        const next = advanceStatus(message.status,status);
        await tx`UPDATE hearth_sms_messages SET status=${next},provider_id=coalesce(provider_id,${providerId}),
          error_code=${['sent','delivered'].includes(next) ? null : errorCode || message.error_code},updated_at=now() WHERE id=${id} AND org_id=${config.orgId}`;
      });
    },
  };
}
