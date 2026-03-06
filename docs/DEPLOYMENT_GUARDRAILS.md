# DEPLOYMENT GUARDRAILS (LOCKED)

## Locked production baseline
- Approved deployment URL: https://hearth-mwbgyf1ds-chuff1021s-projects.vercel.app
- Deployment ID: dpl_FvHRQE4x6XkeU3ETC2s443hBNRiN
- Live alias must point to above unless explicitly changed.

## Hard rules
1. Never run ad-hoc `vercel --prod` from local branches.
2. Production changes only by promoting an approved deployment URL.
3. Auto Git deployments stay disabled (`createDeployments=disabled`).
4. If any post-promote check fails, immediately re-point alias to last known-good deployment.

## Approved production procedure
Use:

```bash
scripts/promote-approved-deployment.sh <approved-deployment-url>
```

Example:

```bash
scripts/promote-approved-deployment.sh https://hearth-mwbgyf1ds-chuff1021s-projects.vercel.app
```

## Required post-promote checks
- GET /tech/manuals == 200
- GET /tech/gabe == 200
- Manual-scoped POST /api/gabe includes:
  - source_type = manual
  - selected_manual_title present
  - answered_from_selected_manual = true
  - cited_manual_title matches selected_manual_title
  - cited_page_number present

## Release flow
- Build and QA on preview first.
- Promote exact approved preview deployment URL.
- Validate post-promote checks.
- Log deployment URL + ID + validation results.
