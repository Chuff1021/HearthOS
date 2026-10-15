import type { SmsConfig } from './domain';

export async function sendTrialSample(config: SmsConfig, message: { id: string; template: string }, fetcher: typeof fetch = fetch) {
  const auth = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
  const base = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
  try {
    const accountResponse = await fetcher(`${base}.json`, { headers: { Authorization: auth }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const account = await accountResponse.json();
    if (!accountResponse.ok || account.type !== 'Trial' || account.status !== 'active') {
      return { status: 'failed', providerId: null, errorCode: account.code ? String(account.code) : 'TRIAL_ACCOUNT_REQUIRED' };
    }
    const callback = `${config.callbackOrigin}/api/sms-trial/status?messageId=${message.id}`;
    const response = await fetcher(`${base}/Messages.json`, { method: 'POST', redirect: 'error', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: config.recipient, Body: message.template, StatusCallback: callback }), signal: AbortSignal.timeout(15_000) });
    const result = await response.json();
    if (!response.ok) return { status: response.status >= 500 ? 'unknown' : 'failed', providerId: null, errorCode: String(result.code || response.status) };
    if (!/^SM[a-f0-9]{32}$/i.test(result.sid || '') || result.account_sid !== config.accountSid || result.to !== config.recipient) {
      return { status: 'unknown', providerId: null, errorCode: 'UNEXPECTED_PROVIDER_RESPONSE' };
    }
    return { status: ['sent','delivered','failed','undelivered'].includes(result.status) ? result.status : 'accepted',
      providerId: result.sid as string, errorCode: result.error_code ? String(result.error_code) : null };
  } catch {
    // A timeout can follow a successful provider submission. No blind retries.
    return { status: 'unknown', providerId: null, errorCode: 'CHECK_PROVIDER_BEFORE_RETRY' };
  }
}
