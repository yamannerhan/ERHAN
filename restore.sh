#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/scripts/ops/common.sh"
require_command docker
require_command sha256sum
require_env

SOURCE="${1:-}"
CONFIRM="${2:-}"
[[ -d "$SOURCE" && -f "$SOURCE/SHA256SUMS" ]] \
  || fail "Kullanım: sudo bash restore.sh /tam/yedek/yolu --confirm-restore"
[[ "$CONFIRM" == "--confirm-restore" ]] || fail "Restore veri değiştirir; --confirm-restore onayı gerekli"

(cd "$SOURCE" && sha256sum -c SHA256SUMS)
log "Restore öncesi güvenlik yedeği alınıyor"
bash "$PROJECT_DIR/backup.sh"

cd "$PROJECT_DIR"
compose stop web caddy worker || true
compose up -d postgres
compose exec -T postgres pg_isready -U "${POSTGRES_USER:-ozelguvenlik}" -d "${POSTGRES_DB:-ozelguvenlik}"

log "PostgreSQL restore başlıyor"
compose exec -T postgres pg_restore \
  -U "${POSTGRES_USER:-ozelguvenlik}" \
  -d "${POSTGRES_DB:-ozelguvenlik}" \
  --clean --if-exists --no-owner --no-privileges \
  < "$SOURCE/postgres.dump"

log "Media ve WhatsApp session geri yükleniyor"
cat "$SOURCE/uploads.tar.gz" | compose run --rm --no-deps -T web tar -C /app -xzf -
cat "$SOURCE/app-data.tar.gz" | compose run --rm --no-deps -T web tar -C /app -xzf -
cat "$SOURCE/whatsapp-session.tar.gz" | compose run --rm --no-deps -T web tar -C /app -xzf -

compose up -d
compose exec -T web node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
  || fail "Restore sonrası healthcheck başarısız"
log "Restore tamamlandı"
