# GABE Swarm Loop

## Mission
Continuously improve HearthOS GABE so techs get accurate, manual-cited answers for install/service questions.

## Swarm Roles
1. **Ingestion Swarm**
   - Ingest manuals at scale (dedupe, retry, checkpoint, DLQ replay)
   - Normalize metadata (brand, model, manual type)
2. **Retrieval Swarm**
   - Tune deterministic retrieval and model/manual matching
   - Reduce wrong-manual and off-topic chunk selection
3. **Citation Swarm**
   - Enforce citation schema: `manual_title`, `page_number`, `source_url`, `quote`
   - Block invalid/unsupported answers
4. **Regression Swarm**
   - Run canonical query suite + edge-case suites each change
   - Emit pass/fail and regression deltas
5. **Release Swarm**
   - Gate deployment, run smoke tests, verify metrics/alerts

## Run Cadence
- Daily: ingestion + regression + metric review
- Per-change: retrieval/citation/regression gates
- Weekly: failure clustering + tuning sprint

## Golden Rule
If evidence is weak or ambiguous, return `source_type=none`.
