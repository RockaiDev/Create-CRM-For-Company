#!/usr/bin/env bash
set -euo pipefail

BACK_DIR="${1:-}"
if [[ -z "$BACK_DIR" || ! -d "$BACK_DIR" ]]; then
  echo "Backend directory missing" >&2
  exit 1
fi

export RAILWAY_TOKEN

PROJECT_NAME="propai-crm-${COMPANY_NAME// /-}-backend"

# Create project if not exists
PROJECT_ID=$(railway project list --json | jq -r --arg name "$PROJECT_NAME" '.projects[] | select(.name==$name) | .id' || true)
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "null" ]]; then
  PROJECT_ID=$(railway project create --name "$PROJECT_NAME" --json | jq -r '.id')
fi

# Create service (will reuse if exists)
SERVICE_NAME="api"
SERVICE_ID=$(railway service list --project "$PROJECT_ID" --json | jq -r --arg name "$SERVICE_NAME" '.services[] | select(.name==$name) | .id' || true)
if [[ -z "$SERVICE_ID" || "$SERVICE_ID" == "null" ]]; then
  SERVICE_ID=$(railway service create --project "$PROJECT_ID" --name "$SERVICE_NAME" --json | jq -r '.id')
fi

# Set env variables (adjust keys to your backend .env usage)
railway variables set \
  COMPANY_NAME="$COMPANY_NAME" \
  FRONTEND_URL="$FRONTEND_URL" \
  CORS_ORIGIN="$CORS_ORIGIN" \
  DATABASE_URL="$DB_URL" \
  CLOUDINARY_CLOUD_NAME="$CLOUDINARY_CLOUD_NAME" \
  CLOUDINARY_API_KEY="$CLOUDINARY_API_KEY" \
  CLOUDINARY_API_SECRET="$CLOUDINARY_API_SECRET" \
  SMTP_HOST="${SMTP_HOST:-}" \
  SMTP_USER="${SMTP_USER:-}" \
  SMTP_PASS="${SMTP_PASS:-}" \
  SMTP_FROM="${SMTP_FROM:-}" \
  --project "$PROJECT_ID" --service "$SERVICE_ID" >/dev/null

# Deploy code
pushd "$BACK_DIR" >/dev/null
if [[ -f package.json ]]; then
  npm ci || npm i
fi
railway up --project "$PROJECT_ID" --service "$SERVICE_ID" --detach
popd >/dev/null

# Get public URL (wait until available)
for i in {1..30}; do
  URL=$(railway service domains --project "$PROJECT_ID" --service "$SERVICE_ID" --json | jq -r '.[0].domains[0].host // empty')
  if [[ -n "$URL" ]]; then
    break
  fi
  sleep 5
done

if [[ -z "$URL" ]]; then
  echo "Failed to fetch Railway public URL" >&2
  exit 1
fi

# Ensure scheme
if [[ "$URL" != http* ]]; then
  URL="https://${URL}"
fi

jq -n --arg url "$URL" '{url:$url}'
