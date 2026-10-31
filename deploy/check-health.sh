#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
docker compose exec -T backend python -c 'import urllib.request; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/api/health/", headers={"X-Forwarded-Proto":"https"}), timeout=8)'
df -h .
docker compose ps
