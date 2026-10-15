import { smsRuntime, smsResponse } from '@/lib/sms-trial/server';
import { verifyTwilioSignature } from '@/lib/sms-trial/domain';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { config, store } = smsRuntime();
    const url = new URL(request.url);
    const messageId = url.searchParams.get('messageId');
    if (!messageId || !/^[0-9a-f-]{36}$/i.test(messageId)) return new Response('Invalid message', { status: 400 });
    const text = await request.text();
    if (text.length > 16_384) return new Response('Too large', { status: 413 });
    const params = new URLSearchParams(text);
    const callback = `${config.callbackOrigin}/api/sms-trial/status?messageId=${messageId}`;
    if (!verifyTwilioSignature(config.authToken, callback, params, request.headers.get('x-twilio-signature') || '')
      || params.get('AccountSid') !== config.accountSid || params.get('To') !== config.recipient) return new Response('Invalid signature', { status: 403 });
    const sid = params.get('MessageSid');
    const status = params.get('MessageStatus');
    if (!/^SM[a-f0-9]{32}$/i.test(sid || '') || !['queued','sending','sent','delivered','failed','undelivered'].includes(status || '')) return new Response('Invalid status', { status: 400 });
    await store.record(messageId, status!, sid, params.get('ErrorCode'));
    return new Response(null, { status: 204 });
  } catch (error) { return smsResponse(error); }
}
