#!/bin/sh
# Self-signed certificate for trying the production stack on this machine (not for staging).
# Usage: sh infra/nginx/dev-cert.sh [hostname]   → infra/nginx/certs/{fullchain,privkey}.pem
# (MSYS_NO_PATHCONV keeps Git Bash on Windows from rewriting the container paths.)
set -eu
HOST="${1:-localhost}"
DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
MSYS_NO_PATHCONV=1 docker run --rm -v "$DIR:/certs" alpine/openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -subj "/CN=$HOST" -addext "subjectAltName=DNS:$HOST" \
  -keyout /certs/privkey.pem -out /certs/fullchain.pem
echo "Certificate for $HOST written to $DIR"
