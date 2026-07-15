#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/scripts/ops/common.sh"
require_command docker
require_command curl
require_env

cd "$PROJECT_DIR"
FAILURES=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then log "OK: $label"; else log "HATA: $label"; FAILURES=$((FAILURES + 1)); fi
}

check "Docker daemon" docker info
check "Docker Compose" docker compose version
check "Compose yapılandırması" compose config --quiet
check "PostgreSQL health" compose exec -T postgres pg_isready -U "${POSTGRES_USER:-ozelguvenlik}" -d "${POSTGRES_DB:-ozelguvenlik}"
check "Web readiness" compose exec -T web node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
check "Ana domain DNS" getent ahosts ozelguvenlik.online
check "HTTPS" curl --fail --silent --show-error --max-time 15 https://ozelguvenlik.online/readyz

MODE="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo unknown)"
if [[ "$MODE" != "600" ]]; then
  log "HATA: .env izinleri 600 değil ($MODE)"
  FAILURES=$((FAILURES + 1))
else
  log "OK: .env izinleri"
fi

for key in POSTGRES_PASSWORD JWT_SECRET CRON_SECRET ACME_EMAIL; do
  if grep -Eq "^${key}=.{12,}$" "$ENV_FILE"; then
    log "OK: $key ayarlı"
  else
    log "HATA: $key eksik/zayıf"
    FAILURES=$((FAILURES + 1))
  fi
done

compose ps
if (( FAILURES > 0 )); then
  log "$FAILURES kontrol başarısız. DNS yönlenmediyse yalnız DNS/HTTPS hatası beklenebilir; servisler otomatik silinmez."
  exit 1
fi
log "Tüm doctor kontrolleri başarılı"
