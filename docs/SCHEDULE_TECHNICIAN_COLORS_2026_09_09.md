# Schedule Technician Colors

## Scope

Presentation-only follow-up from production/main `344f302`. Read-only inspection
confirmed all seven staff records use the default `#2563EB`. The technician
filters also used the same orange selected state.

The schedule now derives distinct display colors from the full technician
directory, preserving unique configured colors and resolving duplicates with a
deterministic palette. Historical job snapshots cannot override directory colors.
Filters, week/month appointments, mobile agenda, time-off dots, and job dialogs
share that mapping. Appointment fills are softly tinted; urgent appointments
retain an amber outline and gain a warning icon. Unassigned jobs remain neutral.
Colors are stable across views and input ordering for the same directory; changing
the directory can change fallback allocations. No color is written to records.

No changes to API calls, handlers, scheduling geometry, data payloads, persistence,
auth, providers, database schema, or other pages. No live mutation testing.

## Verification

- TypeScript and targeted ESLint pass.
- Isolated production build passes, with seven existing tracing warnings.
- All 204 quality tests pass, including five new color tests.
- Exact-handler, fetch, hook, protected-source, and route preservation guard passes.
- Dedicated color browser suite: 16 screenshots, desktop/mobile, light/dark;
  seven identical input colors become distinct, stale snapshots are ignored,
  filters stay stable, dialogs fit, and no mutation/external/error occurs.
- Existing schedule presentation regression passes at 320, 390, 1024, and 1440px,
  including overlap geometry, urgency, month/week, and unsaved form validation.
- Evidence: `/tmp/hearthos-schedule-colors-final/report.json` and
  `/tmp/hearthos-schedule-color-regression` (synthetic data only).

## Release Safety

Pre-release read-only baseline in the secure backup directory:
`production-baseline-2026-09-09T21-40-38-853Z.json`, digest
`2a4a041abcbe53961802eb77b84704e7b56d07171c9c3e81a3269dc8039db058`.
Relative to the prior release's 21:31 snapshot, a customer was added and the
inventory checksum changed before this release; financial totals, jobs, Meeks,
and projects remain identical. Preserve that newer live state, never restore the
older snapshot merely to force equality.

Rollout pending protected PR checks and a production-environment main build.
Rollback target: `dpl_D3ZJ2G2Lo4iGR94UNkfkE5foJG5K`.
