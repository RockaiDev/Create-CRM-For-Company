#!/usr/bin/env bash
set -euo pipefail

FRONT_DIR="${1:-}"
if [[ -z "$FRONT_DIR" || ! -d "$FRONT_DIR" ]]; then
  echo "Frontend directory missing" >&2
  exit 1
fi

# Required runtime envs for the app (adjust keys to your FE .env usage)
ENV_FLAGS=(
  --env "NEXT_PUBLIC_COMPANY_NAME=${COMPANY_NAME}"
  --env "NEXT_PUBLIC_COMPANY_EMAIL=${COMPANY_EMAIL}"
  --env "NEXT_PUBLIC_COMPANY_PHONE=${COMPANY_PHONE}"
  --env "NEXT_PUBLIC_COMPANY_LOCATION=${COMPANY_LOCATION}"
  --env "NEXT_PUBLIC_COMPANY_LOGO=${COMPANY_LOGO_URL}"
  --env "NEXT_PUBLIC_BACKEND_URL=" # will be filled on client from runtime or updated later if FE needs it
)

# Build envs (if your FE needs them at build time, duplicate here)
BUILD_ENV_FLAGS=(
  --build-env "NEXT_PUBLIC_COMPANY_NAME=${COMPANY_NAME}"
  --build-env "NEXT_PUBLIC_COMPANY_EMAIL=${COMPANY_EMAIL}"
  --build-env "NEXT_PUBLIC_COMPANY_PHONE=${COMPANY_PHONE}"
  --build-env "NEXT_PUBLIC_COMPANY_LOCATION=${COMPANY_LOCATION}"
  --build-env "NEXT_PUBLIC_COMPANY_LOGO=${COMPANY_LOGO_URL}"
)

cd "$FRONT_DIR"

# Install deps (if needed)
if [[ -f package.json ]]; then
  npm ci || npm i
fi

# Produce a production deployment
# --yes to avoid prompts, --prod for production, --scope for team/org
DEPLOY_JSON=$(vercel deploy --yes --prod \
  --token "$VERCEL_TOKEN" \
  --scope "$VERCEL_SCOPE" \
  "${ENV_FLAGS[@]}" \
  "${BUILD_ENV_FLAGS[@]}")

# Parse the URL (usually like https://<hash>-<project>.vercel.app)
URL=$(printf "%s" "$DEPLOY_JSON" | tail -n1 | sed -n 's#^https\?://#https://#p')
# If CLI output is not JSON, we still can capture the last URL line.
if [[ -z "$URL" ]]; then
  # Fallback: find first http(s) URL in output
  URL=$(printf "%s" "$DEPLOY_JSON" | grep -Eo 'https?://[^ ]+' | tail -n1)
fi

HOST=$(printf "%s" "$URL" | sed 's#https\?://##')

# Add custom subdomain to this project: acme.propaicrm.com
CUSTOM_DOMAIN="${DOMAIN_PREFIX}.${ROOT_DOMAIN}"
# Best practice: add the domain to the deployment/project
# If verification needed, we'll handle via DNS step next.
vercel domains add "$CUSTOM_DOMAIN" \
  --token "$VERCEL_TOKEN" \
  --scope "$VERCEL_SCOPE" \
  >/dev/null || true

jq -n --arg url "$URL" --arg host "$HOST" --arg custom "$CUSTOM_DOMAIN" \
  '{url:$url, host:$host, custom:$custom}'
