#!/usr/bin/env bash
set -euo pipefail

ROOT="/root/.openclaw/workspace/HearthOS/services/gabe-knowledge-engine"
LOG_DIR="/root/.openclaw/workspace/HearthOS/ops/logs"
SCORECARD="/root/.openclaw/workspace/HearthOS/ops/gabe-quality-scorecard.md"
mkdir -p "$LOG_DIR"

while true; do
  TS_UTC="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  OUT_JSON="$LOG_DIR/gabe-regression-$(date -u +"%Y%m%d-%H%M%S").json"

  echo "[$TS_UTC] running regression suite" | tee -a "$LOG_DIR/gabe-watch.log"
  if (cd "$ROOT" && GABE_ENGINE_URL="http://127.0.0.1:4100" npx tsx scripts/regression_suite.ts > "$OUT_JSON" 2>>"$LOG_DIR/gabe-watch.log"); then
    STATUS="PASS"
  else
    STATUS="FAIL"
  fi

  PASSED=$(python3 - <<'PY' "$OUT_JSON"
import json,sys
try:
  d=json.load(open(sys.argv[1]))
  print(f"{d.get('passed',0)}/{d.get('total',0)}")
except Exception:
  print("0/0")
PY
)

  {
    echo "- [$TS_UTC] $STATUS regression: $PASSED ([log]($(basename "$OUT_JSON")))"
  } >> "$SCORECARD"

  sleep 1800
done
