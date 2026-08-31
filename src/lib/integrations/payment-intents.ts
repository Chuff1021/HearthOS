import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('Payment intents require DATABASE_URL.');
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createPaymentIntent(input: {
  orgId: string;
  identityId?: string | null;
  invoiceId?: string | null;
  invoiceNumber: string;
  customerName?: string | null;
  buyerEmail?: string | null;
  amount: number;
  expiresInDays?: number;
}) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + Math.min(30, Math.max(1, input.expiresInDays || 14)) * 86_400_000);
  const sql = getSql();
  try {
    const [intent] = await sql`
      insert into payment_intents (
        org_id, token_hash, invoice_id, invoice_number, customer_name,
        buyer_email, amount, expires_at, created_by_identity_id
      ) values (
        ${input.orgId}, ${tokenHash(token)}, ${input.invoiceId || null}, ${input.invoiceNumber},
        ${input.customerName || null}, ${input.buyerEmail || null}, ${input.amount}, ${expiresAt}, ${input.identityId || null}
      )
      returning id, expires_at
    `;
    return { token, id: String(intent.id), expiresAt: new Date(intent.expires_at) };
  } finally {
    await sql.end();
  }
}

export async function getPaymentIntent(token: string) {
  if (!token || token.length < 32) return null;
  const sql = getSql();
  try {
    const [intent] = await sql`
      select * from payment_intents
      where token_hash = ${tokenHash(token)}
        and status = 'open'
        and expires_at > now()
      limit 1
    `;
    return intent || null;
  } finally {
    await sql.end();
  }
}

export async function completePaymentIntent(token: string, squarePaymentId: string) {
  const sql = getSql();
  try {
    await sql`
      update payment_intents
      set status = 'paid', paid_at = now(), square_payment_id = ${squarePaymentId}, updated_at = now()
      where token_hash = ${tokenHash(token)} and status = 'open'
    `;
  } finally {
    await sql.end();
  }
}
