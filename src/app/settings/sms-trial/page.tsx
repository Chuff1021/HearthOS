import Link from 'next/link';
import { requireCrmAdmin } from '@/lib/security/crm-access';
import { assertSmsActor, smsConfig } from '@/lib/sms-trial/domain';
import TrialMessaging from '@/components/sms-trial/TrialMessaging';

export default async function SmsTrialPage() {
  const actor = await requireCrmAdmin();
  const config = smsConfig();
  if (config) assertSmsActor(actor, config, true);
  return <main className="mx-auto max-w-3xl p-5 space-y-5" style={{ color: 'var(--color-text-primary)' }}>
    <Link href="/settings" className="text-sm text-orange-600">Back to settings</Link>
    <h1 className="text-2xl font-semibold">SMS trial</h1>
    <TrialMessaging />
  </main>;
}
