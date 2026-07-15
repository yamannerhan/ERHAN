#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/scripts/ops/common.sh"
require_command docker
require_command sha256sum
require_env

cd "$PROJECT_DIR"
DEST="$BACKUP_DIR/$(timestamp)"
mkdir -p "$DEST"
chmod 700 "$DEST"

log "PostgreSQL yedeği alınıyor"
compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-ozelguvenlik}" \
  -d "${POSTGRES_DB:-ozelguvenlik}" \
  --format=custom --no-owner --no-privileges \
  > "$DEST/postgres.dump"

log "Media ve session yedekleri alınıyor"
compose exec -T web tar -C /app -czf - uploads > "$DEST/uploads.tar.gz"
compose exec -T web tar -C /app -czf - data > "$DEST/app-data.tar.gz"
compose exec -T web tar -C /app -czf - .wwebjs_auth > "$DEST/whatsapp-session.tar.gz"

cat > "$DEST/manifest.txt" <<EOF
created_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
git_commit=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)
database=postgres.dump
telegram_session=in_postgres_dump
bot_state=in_postgres_dump
uploads=uploads.tar.gz
whatsapp_session=whatsapp-session.tar.gz
EOF

(cd "$DEST" && sha256sum postgres.dump uploads.tar.gz app-data.tar.gz whatsapp-session.tar.gz manifest.txt > SHA256SUMS)
chmod -R go-rwx "$DEST"
log "Yedek tamamlandı: $DEST"
