import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CrmActor } from '@/lib/security/access-policy';

export const trialTemplates = { scheduled: 'sms_appointment_reminders', on_my_way: 'sms_delivery_updates' } as const;
export type SmsEvent = keyof typeof trialTemplates;
export type SmsConfig = { orgId: string; employeeId: string; recipient: string; accountSid: string; authToken: string; callbackOrigin: string; enabled: boolean };
export class SmsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function smsConfig(env: NodeJS.ProcessEnv = process.env): SmsConfig | null {
  const { HEARTHOS_SMS_ORG_ID: orgId, HEARTHOS_SMS_EMPLOYEE_ID: employeeId, HEARTHOS_SMS_TEST_RECIPIENT: recipient,
    TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, HEARTHOS_SMS_CALLBACK_ORIGIN: callbackOrigin } = env;
  if (!orgId || !employeeId || !/^\+1\d{10}$/.test(recipient || '') || !/^AC[a-f0-9]{32}$/i.test(accountSid || '') || !authToken || !callbackOrigin) return null;
  const origin = new URL(callbackOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== callbackOrigin) return null;
  return { orgId, employeeId, recipient: recipient!, accountSid: accountSid!, authToken, callbackOrigin, enabled: env.HEARTHOS_SMS_TRIAL_ENABLED === 'true' };
}
export function assertSmsActor(actor: CrmActor, config: SmsConfig, adminOnly = false) {
  if (actor.orgId !== config.orgId) throw new SmsError('SMS trial not available.', 404);
  const admin = actor.role === 'owner' || actor.role === 'admin';
  if (!admin && (adminOnly || actor.role !== 'technician' || actor.employeeId !== config.employeeId)) throw new SmsError('SMS trial access denied.', 403);
}
export function nextBusinessDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  const day = new Date(`${value('year')}-${value('month')}-${value('day')}T12:00:00Z`);
  do { day.setUTCDate(day.getUTCDate() + 1); } while ([0, 6].includes(day.getUTCDay()));
  return day.toISOString().slice(0, 10);
}
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === '1' ? `+${digits}` : '';
}
export function verifyTwilioSignature(token: string, url: string, params: URLSearchParams, signature: string) {
  // Twilio signs the exact external URL followed by sorted form keys and values.
  const fields = [...new Set(params.keys())].sort().map(key => [...new Set(params.getAll(key))].sort().map(value => key + value).join('')).join('');
  const expected = createHmac('sha1', token).update(url + fields).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
const ranks: Record<string, number> = { queued: 0, sending: 1, unknown: 1, accepted: 2, sent: 3, failed: 4, undelivered: 4, delivered: 5 };
export function advanceStatus(current: string, next: string) {
  return next in ranks && ranks[next] >= (ranks[current] ?? 0) ? next : current;
}
