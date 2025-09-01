#!/usr/bin/env bash
set -euo pipefail

LOGO_URL="${1:-}"
FOLDER="${2:-logos}"

if [[ -z "$LOGO_URL" ]]; then
  echo "Logo URL is required" >&2
  exit 1
fi

CLOUD="${CLOUDINARY_CLOUD_NAME}"
KEY="${CLOUDINARY_API_KEY}"
SECRET="${CLOUDINARY_API_SECRET}"
PRESET="${CLOUDINARY_UPLOAD_PRESET:-}"

API_BASE="https://api.cloudinary.com/v1_1/${CLOUD}/image/upload"

tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT

# Download the logo to a temp file (some providers block remote fetch)
curl -fsSL "$LOGO_URL" -o "$tmpfile"

if [[ -n "${PRESET}" ]]; then
  # Unsigned upload using upload_preset
  curl -fsS -X POST "$API_BASE" \
    -F "file=@${tmpfile}" \
    -F "upload_preset=${PRESET}" \
    -F "folder=${FOLDER}" \
    -o /dev/stdout
else
  # Signed upload
  TS=$(date +%s)
  # Build signature payload (alphabetical order of params)
  # example params: folder, timestamp
  SIG_RAW="folder=${FOLDER}&timestamp=${TS}${SECRET}"
  SIG=$(printf "%s" "$SIG_RAW" | openssl sha1 -binary | xxd -p)

  curl -fsS -X POST "$API_BASE" \
    -F "file=@${tmpfile}" \
    -F "api_key=${KEY}" \
    -F "timestamp=${TS}" \
    -F "folder=${FOLDER}" \
    -F "signature=${SIG}" \
    -o /dev/stdout
fi
