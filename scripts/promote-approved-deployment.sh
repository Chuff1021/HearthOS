#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/promote-approved-deployment.sh <approved-deployment-url>
# Example:
#   scripts/promote-approved-deployment.sh https://hearth-mwbgyf1ds-chuff1021s-projects.vercel.app

APPROVED_URL="${1:-}"
if [[ -z "$APPROVED_URL" ]]; then
  echo "Usage: $0 <approved-deployment-url>"
  exit 1
fi

echo "Promoting approved deployment: $APPROVED_URL"
vercel promote "$APPROVED_URL" --yes
vercel alias set "${APPROVED_URL#https://}" hearth-os.vercel.app

echo "Running post-promote checks..."
code1=$(curl -s -o /dev/null -w "%{http_code}" https://hearth-os.vercel.app/tech/manuals)
code2=$(curl -s -o /dev/null -w "%{http_code}" https://hearth-os.vercel.app/tech/gabe)

if [[ "$code1" != "200" || "$code2" != "200" ]]; then
  echo "FAIL: route checks failed (/tech/manuals=$code1 /tech/gabe=$code2)"
  exit 2
fi

echo "PASS: /tech/manuals and /tech/gabe are 200"
echo "Now run manual-scoped /api/gabe verification before declaring release complete."
