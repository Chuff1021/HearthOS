# HearthOS Next-Level Execution (Web App + Future iOS)

## Safety checkpoint (created)
- Baseline commit: `1433e01`
- Backup tag: `hearthos-pre-next-level-2026-03-03`
- Backup branch: `backup/hearthos-pre-next-level-2026-03-03`
- Active build branch: `feat/hearthos-next-level`

## Revert commands
```bash
cd /root/HearthOS
git checkout main
git reset --hard hearthos-pre-next-level-2026-03-03
# or work from backup branch
git checkout backup/hearthos-pre-next-level-2026-03-03
```

## Phase 1 (Now): Production web-app core
1. Replace mock/in-memory data with DB-backed services on all P0 pages:
   - dashboard, jobs, dispatch, schedule, customers, tech job flow
2. Enforce tenant/org scoping in queries and API routes.
3. Finish tech app workflow:
   - clock in/out
   - assigned jobs list
   - job checklist + notes/photos + completion state
4. Stabilize auth/session + role permissions (owner/dispatcher/tech/admin).

## Phase 2: QuickBooks end-to-end
1. Complete OAuth + token refresh hardening.
2. Sync loops:
   - customers
   - invoices/payments
   - inventory items
3. Conflict handling + sync logs + retry queue.
4. Add integration health page for operators.

## Phase 3: Premium UI/UX (Liquid Glass)
1. Add design tokens and theme layers (brand + tenant overrides).
2. Upgrade nav, cards, tables, forms, and dialogs to glass-morphism system.
3. Add motion system (subtle blur/parallax/microinteractions) + reduced-motion support.
4. Accessibility pass (WCAG 2.2 AA) + contrast and keyboard QA.

## Phase 4: Go-live readiness
1. Production DB migrations + backup/restore drills.
2. Error tracking, audit logs, uptime checks.
3. CI/CD with staging + production promotion checklist.
4. Pilot tenant rollout with one store, then expand.

## Future iPhone app path (Tech app)
- Build with Expo/React Native using the same API contracts.
- Keep web app as control plane; mobile app focused on field workflows:
  - clock in/out
  - assigned jobs
  - checklists/photos/signature
  - offline cache + sync
- Phase after web GA: mobile beta with 5-10 techs.
