#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/scripts/ops/common.sh"

[[ "${EUID}" -eq 0 ]] || fail "install.sh sudo ile çalıştırılmalıdır"
[[ -r /etc/os-release ]] || fail "Ubuntu sürümü tespit edilemedi"
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" =~ ^(22\.04|24\.04)$ ]] \
  || fail "Yalnız Ubuntu 22.04/24.04 destekleniyor (bulunan: ${PRETTY_NAME:-bilinmiyor})"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg openssl

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  # shellcheck disable=SC1091
  . /etc/os-release
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

require_command docker
docker compose version >/dev/null
cd "$PROJECT_DIR"
[[ -f package.json && -f docker-compose.yml ]] || fail "Proje kökünde çalıştırılmadı"

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.example "$ENV_FILE"
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  CRON_SECRET="$(openssl rand -hex 32)"
  ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n=/+')"
  read -r -p "Let's Encrypt e-posta: " ACME_EMAIL
  read -r -p "Admin e-posta: " ADMIN_EMAIL
  read -r -p "Admin kullanıcı adı [admin]: " ADMIN_USERNAME
  ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
  [[ "$ACME_EMAIL" == *@* && "$ADMIN_EMAIL" == *@* ]] || fail "Geçerli e-posta gerekli"

  set_env() {
    local key="$1" value="$2"
    sed -i "s|^${key}=.*$|${key}=${value}|" "$ENV_FILE"
  }
  set_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  set_env JWT_SECRET "$JWT_SECRET"
  set_env CRON_SECRET "$CRON_SECRET"
  set_env ACME_EMAIL "$ACME_EMAIL"
  set_env ADMIN_EMAIL "$ADMIN_EMAIL"
  set_env ADMIN_USERNAME "$ADMIN_USERNAME"
  set_env ADMIN_PASSWORD "$ADMIN_PASSWORD"
  chmod 600 "$ENV_FILE"
  printf '\nAdmin ilk parolası (şimdi güvenli yere kaydedin): %s\n\n' "$ADMIN_PASSWORD"
else
  log "Mevcut .env korunuyor"
fi

require_env
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log "Image build başlıyor"
compose build --pull
compose up -d postgres
for _ in {1..30}; do
  compose exec -T postgres pg_isready -U "${POSTGRES_USER:-ozelguvenlik}" -d "${POSTGRES_DB:-ozelguvenlik}" >/dev/null 2>&1 && break
  sleep 2
done
compose exec -T postgres pg_isready -U "${POSTGRES_USER:-ozelguvenlik}" -d "${POSTGRES_DB:-ozelguvenlik}" \
  || fail "PostgreSQL hazır olmadı"

log "Şema kontrollü uygulanıyor"
compose run --rm web pnpm --filter @workspace/db run push
log "Admin hesabı oluşturuluyor/güncelleniyor"
compose run --rm web pnpm exec tsx scripts/seed-admin.ts

compose up -d
compose exec -T web node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
  || fail "Web healthcheck başarısız"

if ! wait_for_health "https://ozelguvenlik.online/readyz" 5; then
  log "UYARI: HTTPS henüz hazır değil. DNS yönlenmemiş olabilir; servisler silinmedi."
  log "Kontrol: docker compose logs caddy"
fi

log "Kurulum tamamlandı"
compose ps
