# HearthOS Infrastructure Inventory

Last verified: August 31, 2026

## Production Safety

- Production application: `https://hearth-os.vercel.app`
- Vercel project: `hearth-os` (`prj_8V7U87V5ffehDKkeiYvl5XXMZqGl`)
- Production remains on its existing deployment. The multi-tenant foundation has not been promoted.
- Production `DATABASE_URL` is scoped only to Vercel Production.
- `MULTITENANT_FILES_ENABLED` is not enabled in Production.
- `MULTITENANT_STORAGE_ENABLED` is not enabled in Production.

## Neon

- Neon project: `HearthOS` (`spring-art-83772084`)
- Production branch: `production` (`br-cold-resonance-ai4mmdx2`)
- Production branch is protected.
- Point-in-time restore history: 7 days (`604800` seconds).
- Staging branch: `hearthos-staging` (`br-restless-river-aia0em58`)
- Staging compute: 0.25-1 CU, five-minute scale-to-zero timeout.
- Preview and Development `DATABASE_URL` values point only to the staging branch.

## Recovery Artifacts

- Encrypted backup: `/Users/fireplace/HearthOS-secure-backups/hearthos-production-2026-08-31T18-23-40-205Z.dump.enc`
- Backup SHA-256: `862ce36857a26f868f204fb68bb1f9f75ea87281b93969fb971330108f4a5c5a`
- Pre-change baseline: `/Users/fireplace/HearthOS-secure-backups/production-baseline-2026-08-31T18-23-54-207Z.json`
- Baseline digest: `3f8849fdf0d2654e31c98382b6d568c7939be8bf545c6f6c07a1d5cd5af74208`
- Post-infrastructure baseline: `/Users/fireplace/HearthOS-secure-backups/post-infrastructure/production-baseline-2026-08-31T19-05-21-023Z.json`
- Critical business tables were unchanged between the two baselines. The live QuickBooks token refresh and technician-location heartbeat changed as expected.

## Private Object Storage

- Cloudflare account: `b38d64e255bf514245e6e3a802acb681`
- S3 endpoint: `https://b38d64e255bf514245e6e3a802acb681.r2.cloudflarestorage.com`
- Staging bucket: `hearthos-job-media-staging`
- Production bucket: `hearthos-job-media-production`
- Both buckets are private and use Standard storage.
- Account token `HearthOS Staging Job Media` has Object Read & Write access only to the staging bucket.
- Account token `HearthOS Production Job Media` has Object Read & Write access only to the production bucket.
- Token values exist only in encrypted Vercel environment variables and must never be committed.
- Preview and Development use the staging bucket and credential.
- Production has its production bucket credential configured but dormant until the file-storage rollout is approved.

## Verified Tests

- Production backup decrypt and PostgreSQL archive verification passed.
- Tenant migrations `0013` through `0029` passed twice for idempotency.
- Customer, invoice, payment, inventory, vendor, estimate, purchase-order, bill, job, Meeks, and project reconciliation passed.
- Direct cross-tenant lookup and RLS isolation probes passed.
- Both R2 credentials passed authenticated upload and download checks.
- Direct unauthenticated R2 object requests were denied.
- Staging R2 plus Neon metadata integration passed with matching SHA-256 content and no file bytes embedded in Postgres.
- Preview deployment is Ready and requires authentication.

## Current Preview

- URL: `https://hearth-m0ccoyzwo-chuff1021s-projects.vercel.app`
- Git branch: `codex/multitenant-foundation`
- `MULTITENANT_FILES_ENABLED=true` applies only to Preview and Development.
