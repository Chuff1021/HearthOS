# HearthOS Multi-Tenant Migration Safety

## Production source of truth

Aaron's Fireplace Co. remains the first HearthOS organization and the production source of truth. The multi-tenant migration must backfill and reconcile the current records. It must never seed, replace, or reconstruct Aaron's production data from demo data.

## Required preflight

Before every production database migration:

1. Run `npm run safety:backup` from a machine with production `DATABASE_URL` access.
2. Run `npm run safety:baseline` and retain the generated digest with the deployment record.
3. Verify the encrypted archive with `pg_restore --list`; the backup script performs this automatically.
4. Create or refresh the isolated staging database from the production recovery point.
5. Run the migration and reconciliation suite against staging.
6. Promote only additive, backward-compatible migrations.

Backups are written outside the repository to `~/HearthOS-secure-backups` by default. Archives are encrypted, checksummed, permissioned to the current user, and use a passphrase stored in macOS Keychain.

## Migration rules

- Add tables and columns before changing application reads.
- Do not drop, truncate, rename, or repurpose a production column during the tenant migration.
- Backfill `org_id` in bounded batches and record migration progress.
- Keep legacy reads available behind a feature flag until reconciliation passes.
- Dual-write during storage transitions where the legacy path remains active.
- Derive tenant identity from authenticated server context, never from an untrusted body or query parameter.
- Stop promotion on any unexplained count, checksum, schedule, invoice balance, or payment-total difference.

## Rollback order

1. Disable the new tenant-aware read feature flag.
2. Roll back the Vercel deployment to the prior compatible application version.
3. Reconcile writes made during the observation window.
4. Restore the database only when data correction cannot be performed safely; use the encrypted archive or Neon point-in-time recovery.
5. Record the incident, affected deployment, reconciliation result, and final recovery action.

## Release gate

No external dealer may be activated until automated tests demonstrate that a member of one organization cannot read, search, mutate, export, or reference another organization's customers, jobs, schedules, invoices, payments, files, integrations, or AI context.

Do not create a Vercel preview while `DATABASE_URL` is shared across Production, Preview, and Development. Preview must first receive a distinct Neon branch URL restored from the verified archive. As recorded on August 31, 2026, the linked Vercel project has a shared `DATABASE_URL` and no managed database integration resource, so preview deployment remains blocked.

## Feature flags

All flags default to off. Enable them in order and never skip a stage:

1. `MULTITENANT_FOUNDATION_ENABLED=true` enables Clerk identity, organizations, memberships, onboarding, invitations, and support sessions.
2. `MULTITENANT_STORAGE_ENABLED=true` switches legacy stores to organization-owned database records and disables shared JSON fallbacks.
3. `MULTITENANT_INTEGRATIONS_ENABLED=true` reads encrypted QuickBooks and Square connections per organization. Keep `INTEGRATION_DUAL_WRITE_LEGACY=true` during Aaron's compatibility observation window.
4. `MULTITENANT_ENFORCEMENT_ENABLED=true` removes hardcoded default-organization resolution from application data paths.
5. `MULTITENANT_ROUTE_PROTECTION_ENABLED=true` requires Clerk authentication at the routing layer for private application and API routes.
6. `NEXT_PUBLIC_MULTITENANT_UI_ENABLED=true` exposes organization switching in the authenticated header.

When tenant storage is enabled, new technician photos and Meeks PO attachments are written to `tenant_private_files` with organization-prefixed object keys. Downloads are served only through organization-authorized routes. Existing embedded attachments remain unchanged during the compatibility window and can be migrated only after checksum and rollback review.

Public invoice payments and estimate acceptance use opaque, expiring, server-hashed intents in tenant mode. Organization IDs, invoice amounts, and estimate references are resolved from the intent record and are never accepted from public request parameters.

Required secrets and public integration settings:

- `INTEGRATION_ENCRYPTION_KEY`: 32 random bytes encoded as base64, stored only in Vercel encrypted environment variables and the approved recovery vault.
- `CHATWOOT_WEBHOOK_SECRET`: shared secret required by the GABE Chatwoot webhook; the route fails closed when absent.
- `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL`: required for Square HMAC verification; the route fails closed when absent.
- Clerk, QuickBooks, and Square application credentials remain platform secrets. Dealer access and refresh tokens are encrypted in `integration_connections`.

Generate the integration key without printing it into shell history, then add it independently to Preview and Production through Vercel's encrypted environment-variable controls. Never commit the value.

## Rehearsal command

Run `npm run safety:rehearse-tenancy` before every tenant release. The command:

- decrypts the verified recovery archive into a disposable local PostgreSQL cluster;
- applies migrations `0013` and later twice to prove idempotency;
- compares Aaron's table counts and financial totals before and after;
- verifies organization-aware external IDs and legacy store keys;
- enables prepared RLS on the clone under a restricted role and attempts a direct cross-tenant lookup;
- destroys the rehearsal cluster when complete.

After the command passes, start HearthOS against the migrated clone and run the route QA suite. It must verify private-file upload/download behavior, reject direct UUID access to another organization's records and files, and exercise onboarding plus read-only support access before a preview is eligible for promotion.

RLS policies are prepared by migration `0024` but are not enabled on production tables. Production RLS activation requires a separate approved deployment after all application queries run with a server-derived tenant database context and the restricted role has passed the complete route suite.

## Support access

Platform support is read-only by default. Every request states a reason and expiration, requires approval from a different owner/admin in the target company, and records request, approval, activation, and termination in `audit_logs`. Read/write support must be explicitly requested. The support cookie is HttpOnly, actor-bound, and time-limited.
