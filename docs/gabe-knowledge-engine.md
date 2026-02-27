# GABE Knowledge Engine

Production RAG service for GABE (manual-first, allowlisted web fallback).

## Services
- `services/gabe-knowledge-engine` (Fastify)
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

## Environment Variables
See `services/gabe-knowledge-engine/.env.example`.

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

## Query (used by Next API route)
`POST /query` with JSON:
```
{ "question": "..." }
```

## Response
Returns JSON with strict schema (manual/web/none).

## Logging + Monitoring
- Structured logs via Fastify + pino
- Health check: `GET /health`
