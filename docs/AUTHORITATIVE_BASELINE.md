# AUTHORITATIVE_BASELINE.md

## Locked Authoritative Baseline

- Production URL: `https://hearth-hww8fnlza-chuff1021s-projects.vercel.app`
- Production Alias: `https://hearth-os.vercel.app`
- Deployment ID: `dpl_EfTsRiv5UqBYJ2ovZ8RFehmuPTsr`
- Original Deployment ID (redeploy source): `dpl_5yaXETRJxBuuj6YADQTQ9fagRKmq`
- Git branch: `main`
- Git commit hash: `e8b74b68d246db7efdb2ace9c09cfa1de4118f60`

## Required Rules (effective immediately)

1. **All future work must branch from this baseline** (`main@e8b74b68d246db7efdb2ace9c09cfa1de4118f60`) or a direct descendant.
2. **No production promote is allowed unless preview passes smoke checks**:
   - `GET /tech/manuals` returns 200
   - `GET /tech/gabe` returns 200
   - one manual-scoped `POST /api/gabe` returns:
     - `source_type = manual`
     - `selected_manual_title` present
     - `answered_from_selected_manual = true`
     - `cited_manual_title` matches selected manual
     - `cited_page_number` present

## Verification Snapshot (current)

- Checked production: `https://hearth-os.vercel.app`
- `GET /tech/manuals`: **200**
- `GET /tech/gabe`: **200**
- Manual-scoped `POST /api/gabe`: **FAILED**
  - `source_type: none`
  - `selected_manual_title: null`
  - `answered_from_selected_manual: null`
  - `cited_manual_title: null`
  - `cited_page_number: null`

Status: **Baseline deployment is locked, but recovered GABE/manual behavior is not currently verified as passing on production.**
