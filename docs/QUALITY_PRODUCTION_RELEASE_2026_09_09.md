# Aaron Quality Release: September 9, 2026

## Scope and Authorization

The owner explicitly requested production deployment of the reviewed updates after
the prerelease checkpoint. This is the bounded Aaron quality release from
`codex/product-quality`, not the dormant dealer-readiness/multi-tenant foundation.
The request supersedes waiting for a separate Clerk QA application before this
release. It does not establish successful real-provider or independent role
acceptance, nor does it certify the platform for additional dealers.

Reviewed application checkpoint: `2c2121ced666332d436ede07db35eb657cbc92be`.
Verified live and remote-main base: `19fb50f84ac1fafe2884c2a7764f6eb0f00d91ae`.
Rollback deployment: `dpl_CqYdjua9h4MDEv6uMqitgwfJjpf9` at
`https://hearth-hkw8n8nu0-chuff1021s-projects.vercel.app`.
Project: `prj_8V7U87V5ffehDKkeiYvl5XXMZqGl`; canonical site
`https://hearth-os.vercel.app/`.

No schema/migration, database identity, auth/security configuration, Meeks guard,
or cron configuration changes are included. Existing production environment
variables must remain on the production build. Never promote an unverified
preview-environment build to production. Never restore/reseed live data to make
counts match a snapshot.

## Release Checks

The prerelease report records 533 passing isolated automated tests, typecheck,
lint, build, six-viewport component QA and snapshot restoration. Release requires
a fresh encrypted recovery point and read-only baseline, protected-PR `verify`
success, Vercel production READY, and post-deployment access/data verification.
Do not bypass branch protection or automatically submit provider transactions.

Actual QuickBooks/Square/mail sandbox acceptance, separate technician/Meeks
sign-in acceptance and fee-income settlement accounting remain limitations.
Existing Clerk development authentication remains unchanged; moving it to a
production Clerk instance is a separate identity migration.

Status: release preparation in progress; deployment not yet performed.
