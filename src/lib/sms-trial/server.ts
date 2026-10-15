import 'server-only';
import postgres from 'postgres';
import { CrmAccessError, requireCrmActor } from '@/lib/security/crm-access';
import { assertSmsActor, smsConfig, SmsError, type SmsEvent } from './domain';
import { smsTrialStore } from './store';
import { sendTrialSample } from './provider';

let client: ReturnType<typeof postgres> | undefined;
export function smsRuntime() {
  const config = smsConfig();
  if (!config || !process.env.DATABASE_URL) throw new SmsError('SMS trial is not configured.', 503);
  client ??= postgres(process.env.DATABASE_URL, { max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false });
  return { config, store: smsTrialStore(client, config) };
}
export async function smsActor(admin = false) {
  const actor = await requireCrmActor();
  const runtime = smsRuntime();
  assertSmsActor(actor, runtime.config, admin);
  return { actor, ...runtime };
}
export function smsResponse(error: unknown) {
  return Response.json({ error: error instanceof SmsError || error instanceof CrmAccessError ? error.message : 'SMS trial unavailable. No automatic retry was made.' },
    { status: error instanceof SmsError || error instanceof CrmAccessError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function dispatchTrial(actor: Awaited<ReturnType<typeof requireCrmActor>>, jobId: string, event: SmsEvent) {
  const { config, store } = smsRuntime();
  const message = await store.claim(actor, jobId, event);
  if (!message) return;
  const result = await sendTrialSample(config, { id: message.id, template: message.template });
  await store.record(message.id, result.status, result.providerId, result.errorCode);
}
