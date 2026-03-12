# Baseline Protection Package

## Known-good baseline artifacts
- `ops/MANUAL_SCOPED_QA_REPORT.json`
- `ops/PRODUCTION_KNOWN_GOOD_BASELINE.json`

## Nightly QA command (must remain green)
```bash
cd /root/.openclaw/workspace/HearthOS
node ops/run_manual_scoped_qa.mjs --baseUrl=https://hearth-os.vercel.app
```

## Rollback rule
If nightly QA fails or trust fields regress:
1. Freeze new promotions.
2. Promote previous known-good deployment.
3. Verify with:
   - `GET /tech/manuals = 200`
   - `GET /tech/gabe = 200`
   - strict manual-scoped QA suite (10/10)
4. Update incident note with root cause and fix plan.

## Future release checklist (short)
1. Preview QA passes (manual-scoped strict checks).
2. Promote approved preview only.
3. Run production smoke checks.
4. Run strict manual-scoped QA.
5. Archive updated baseline artifacts.
6. Announce release + monitor first usage window.
