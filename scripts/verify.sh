#!/usr/bin/env bash
set -euo pipefail

FRONTEND_URL="${1:-}"
BACKEND_URL="${2:-}"

if [[ -z "$FRONTEND_URL" || -z "$BACKEND_URL" ]]; then
  echo "Frontend and Backend URLs are required" >&2
  exit 1
fi

# Basic checks
FE_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL")
BE_HEALTH="${BACKEND_URL%/}/health"
BE_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" "$BE_HEALTH")

jq -n \
  --arg frontend "$FRONTEND_URL" \
  --arg backend "$BACKEND_URL" \
  --arg fe_code "$FE_CODE" \
  --arg be_code "$BE_CODE" \
  '{
    frontend: $frontend,
    backend: $backend,
    frontend_status: ($fe_code|tonumber),
    backend_health_endpoint: "'$BE_HEALTH'",
    backend_status: ($be_code|tonumber),
    ok: ((($fe_code|tonumber) >= 200 and ($fe_code|tonumber) < 400) and (($be_code|tonumber) >= 200 and ($be_code|tonumber) < 400))
  }'
