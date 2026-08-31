import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('Estimate acceptance links require DATABASE_URL.');
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createEstimateAcceptanceIntent(input: {
  orgId: string;
  estimateReference: string;
  identityId?: string | null;
  expiresInDays?: number;
}) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + Math.min(60, Math.max(1, input.expiresInDays || 30)) * 86_400_000);
  const sql = getSql();
  try {
    await sql`
      insert into estimate_acceptance_intents (
        org_id, token_hash, estimate_reference, expires_at, created_by_identity_id
      ) values (
        ${input.orgId}, ${tokenHash(token)}, ${input.estimateReference}, ${expiresAt}, ${input.identityId || null}
      )
    `;
    return { token, expiresAt };
  } finally {
    await sql.end();
  }
}

export async function getEstimateAcceptanceIntent(token: string) {
  if (!token || token.length < 32) return null;
  const sql = getSql();
  try {
    const [intent] = await sql`
      select * from estimate_acceptance_intents
      where token_hash = ${tokenHash(token)}
        and status in ('open', 'accepted')
        and expires_at > now()
      limit 1
    `;
    return intent || null;
  } finally {
    await sql.end();
  }
}

export async function acceptEstimateAcceptanceIntent(token: string) {
  const sql = getSql();
  try {
    const [intent] = await sql`
      update estimate_acceptance_intents
      set status = 'accepted', accepted_at = now(), updated_at = now()
      where token_hash = ${tokenHash(token)} and status = 'open' and expires_at > now()
      returning id
    `;
    return Boolean(intent);
  } finally {
    await sql.end();
  }
}
