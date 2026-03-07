# CLERK_REMOVAL_PHASE1.md

## Scope
Phase 1 removes Clerk from the **runtime-critical path** only, focused on stability for:
- `/tech`
- `/tech/manuals`
- `/tech/gabe`
- `/api/gabe`

No replatform to Auth.js is included in this phase.

## Changes Applied

1. `src/proxy.ts`
   - Replaced `clerkMiddleware()` with a no-op pass-through middleware (`NextResponse.next()`).
   - Result: requests no longer require Clerk runtime/env in middleware.

2. `src/app/layout.tsx`
   - Removed `ClerkProvider`, `SignedIn`, `SignedOut`, `UserButton`, and auth header controls.
   - Result: app shell no longer crashes on missing Clerk publishable key.

3. `src/app/tech/page.tsx`
   - Removed `useUser` import/usage from Clerk.
   - Uses neutral fallback display name (`"Tech"`).
   - Result: `/tech` no longer depends on Clerk client auth hooks.

## Explicit Non-Goals
- No schema/data changes
- No Qdrant/Neon/Docker/ingestion changes
- No Auth.js implementation yet
- No deployment protection reconfiguration in app code

## Rollback
If needed, rollback by reverting these files:
- `src/proxy.ts`
- `src/app/layout.tsx`
- `src/app/tech/page.tsx`

## Perimeter Protection
Phase 1 assumes route protection is handled externally (Vercel deployment protection, access policy, or network perimeter controls), not via app-level Clerk middleware.
