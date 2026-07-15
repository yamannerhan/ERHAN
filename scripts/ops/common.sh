#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

log() { printf '[ops] %s\n' "$*"; }
fail() { printf '[ops] HATA: %s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 komutu bulunamadı"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$PROJECT_DIR/docker-compose.yml" "$@"
}

require_env() {
  [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE bulunamadı"
  chmod 600 "$ENV_FILE"
}

wait_for_health() {
  local url="${1:-https://ozelguvenlik.online/readyz}"
  local attempts="${2:-30}"
  for ((i=1; i<=attempts; i++)); do
    if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
      log "Healthcheck başarılı: $url"
      return 0
    fi
    sleep 4
  done
  return 1
}

timestamp() { date -u +'%Y%m%dT%H%M%SZ'; }
