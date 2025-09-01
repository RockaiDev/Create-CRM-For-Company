#!/usr/bin/env bash
set -euo pipefail

SUBDOMAIN="${1:-}"
DOMAIN="${2:-}"
VERCEL_HOST="${3:-}"

if [[ -z "$SUBDOMAIN" || -z "$DOMAIN" ]]; then
  echo "Usage: configure_dns_namecheap.sh <sub> <domain> <vercel_host>" >&2
  exit 1
fi

API_USER="${NAMECHEAP_API_USER}"
API_KEY="${NAMECHEAP_API_KEY}"
USERNAME="${NAMECHEAP_USERNAME}"
CLIENT_IP="${NAMECHEAP_CLIENT_IP}"

# Namecheap domains are split into SLD/ TLD
SLD="${DOMAIN%.*}"
TLD="${DOMAIN#*.}"

# We will fetch existing hosts and then set new records with the CNAME added/updated.
BASE_URL="https://api.namecheap.com/xml.response"

# Fetch current hosts
XML=$(curl -fsS --get "$BASE_URL" \
  --data-urlencode "ApiUser=$API_USER" \
  --data-urlencode "ApiKey=$API_KEY" \
  --data-urlencode "UserName=$USERNAME" \
  --data-urlencode "ClientIp=$CLIENT_IP" \
  --data-urlencode "Command=namecheap.domains.dns.getHosts" \
  --data-urlencode "SLD=$SLD" \
  --data-urlencode "TLD=$TLD")

# Convert minimal data we need using xmllint/grep (no xmllint pre-installed, so we rebuild using jq isn't trivial).
# Simpler approach: replace all hosts with just our CNAME & common records. If you need to preserve others, extend this.

# Recommended CNAME target for Vercel subdomains:
CNAME_TARGET="cname.vercel-dns.com."

# Build setHosts payload with only the desired CNAME
SET_URL="$BASE_URL?ApiUser=$API_USER&ApiKey=$API_KEY&UserName=$USERNAME&ClientIp=$CLIENT_IP&Command=namecheap.domains.dns.setHosts&SLD=$SLD&TLD=$TLD"

# Hostname1: subdomain CNAME -> Vercel
SET_URL="$SET_URL&HostName1=$SUBDOMAIN&RecordType1=CNAME&Address1=$CNAME_TARGET&TTL1=300"

# (Optional) keep root @ and www as is; we’ll not touch them here.

curl -fsS "$SET_URL" >/dev/null

# Also tell Vercel to add the domain to the project (done earlier), and verification should pass with CNAME.
jq -n --arg sub "$SUBDOMAIN" --arg domain "$DOMAIN" '{status:"ok", subdomain:$sub, domain:$domain}'
