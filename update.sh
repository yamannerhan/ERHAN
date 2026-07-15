#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/scripts/ops/common.sh"
require_command git
require_command docker
require_env

cd "$PROJECT_DIR"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "Tracked çalışma alanı temiz değil; update durduruldu"
OLD_COMMIT="$(git rev-parse HEAD)"

log "Güncelleme öncesi yedek alınıyor"
bash "$PROJECT_DIR/backup.sh"
SAFETY_BACKUP="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"

rollback() {
  local code=$?
  trap - ERR
  log "Güncelleme başarısız; uygulama kodu $OLD_COMMIT sürümüne döndürülüyor"
  git reset --hard "$OLD_COMMIT"
  compose build
  compose up -d
  log "Kod rollback tamamlandı. DB geri dönüşü gerekirse: sudo bash restore.sh '$SAFETY_BACKUP' --confirm-restore"
  exit "$code"
}
trap rollback ERR

git fetch --prune origin main
git switch main
git merge --ff-only origin/main
NEW_COMMIT="$(git rev-parse HEAD)"
if [[ "$NEW_COMMIT" == "$OLD_COMMIT" ]]; then
  log "Zaten güncel"
  trap - ERR
  exit 0
fi

compose build
compose up -d postgres
compose run --rm web pnpm --filter @workspace/db run push
compose up -d --remove-orphans
compose exec -T web node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

trap - ERR
log "Güncelleme tamamlandı: $OLD_COMMIT -> $NEW_COMMIT"
