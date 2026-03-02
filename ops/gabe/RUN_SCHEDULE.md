# GABE Run Schedule

## Daily
1. Ingestion Swarm: import new manuals + replay DLQ
2. Regression Swarm: run `npm run test:regression`
3. Metrics Snapshot: wrong-manual / missing-citation / no-answer reasons

## On Every Retrieval Change
1. Build + unit checks
2. Regression suite (must pass)
3. Manual QA sample (5-10 critical technician prompts)

## Weekly
1. Expand benchmark suite using real tech questions
2. Review false-none and false-positive clusters
3. Tune retrieval scoring + metadata normalization
