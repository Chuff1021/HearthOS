#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$ROOT/services/gabe-knowledge-engine"

cd "$ROOT"
docker compose -f docker-compose.gabe.yml up -d --build

curl -fsS http://127.0.0.1:4100/health >/dev/null
curl -fsS http://127.0.0.1:4100/metrics >/dev/null
curl -fsS http://127.0.0.1:6333/healthz >/dev/null

cd "$ENGINE"
npm install >/dev/null
GABE_ENGINE_URL=http://127.0.0.1:4100 npm run -s test:regression

echo "GABE release gate passed"
