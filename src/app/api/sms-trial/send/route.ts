import { dispatchTrial, smsActor, smsResponse } from '@/lib/sms-trial/server';
import { SmsError } from '@/lib/sms-trial/domain';
import { authorizeCrmApi } from '@/lib/security/crm-access';
export const maxDuration = 60;

export async function POST(request: Request) {
  const accessDenied = await authorizeCrmApi("/api/sms-trial/send", "POST");
  if (accessDenied) return accessDenied;
  if (request.headers.get('origin') !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const { actor, store } = await smsActor();
    const body = await request.json();
    if (typeof body.jobId !== 'string' || !['scheduled','on_my_way'].includes(body.event)) throw new SmsError('Invalid test message.');
    await dispatchTrial(actor, body.jobId, body.event);
    return Response.json(await store.state(actor, body.jobId));
  } catch (error) { return smsResponse(error); }
}
