# GABE Knowledge Engine

Production retrieval backend for GABE during the orchestrator migration (manual-first, allowlisted web fallback).

## Services
- `services/gabe-knowledge-engine` (Fastify)
- `services/gabe-orchestrator` (LangGraph-oriented workflow shell)
- `services/gabe-validator` (internal validator dependency used by orchestrator)
- Qdrant vector DB

## Folder Structure
- `services/gabe-knowledge-engine/src`
  - `config.ts` env validation
  - `embeddings/` providers (transformers/openai/jina)
  - `ingest/` PDF extraction + chunking
  - `retrieval/` Qdrant search
  - `web/` Brave search + HTML extraction
  - `llm/` Groq client
  - `validation/` response validator
  - `index.ts` HTTP service
- `services/gabe-knowledge-engine/scripts`
  - `ingest_manual.ts` CLI ingestion
- `services/gabe-orchestrator/src`
  - `engines/` internal venting, wiring, parts, compliance, and general retrieval modules
  - `config.ts` runtime diagnostics/env parsing
  - `index.ts` orchestrator entrypoint
- `services/gabe-validator/src`
  - `index.ts` answer-path validator and outcome classifier

## Environment Variables
See `services/gabe-knowledge-engine/.env.example`.
See `services/gabe-orchestrator/.env.example`.

## Docker
```
docker compose -f docker-compose.gabe.yml up -d --build
```

## Ingestion (PDFs stored locally)
```
cd services/gabe-knowledge-engine
npm install
npm run ingest:manual -- "/path/to/manual.pdf" "Manual Title" "Manufacturer" "Model" "https://source-url.pdf"
```

## Query (retrieval backend)
`POST /query` with JSON:
```
{ "question": "..." }
```

## Current runtime path
- Next API route -> `gabe-orchestrator` when `GABE_ORCHESTRATOR_URL` is configured
- `gabe-orchestrator` -> `gabe-knowledge-engine` during strangler migration
- Every orchestrator answer passes through `gabe-validator` before returning

## Initial Qdrant collections
- `fireplace_manual_chunks`
- `fireplace_qa_memory`
- `fireplace_vent_rules`
- `fireplace_wiring_graphs`

## Response
- Retrieval backend returns strict schema (`manual` / `web` / `none`)
- Orchestrator augments responses with:
  - selected engine
  - certainty
  - run outcome
  - validator version
  - internal debug diagnostics when enabled

## Logging + Monitoring
- Structured logs via Fastify + pino
- Health check: `GET /health`
- Runtime diagnostics in orchestrator responses:
  - `engine_build_id`
  - `engine_commit_sha`
  - `selected_engine`
  - `certainty`
  - `run_outcome`
  - `validator_version`
