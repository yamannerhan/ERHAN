# Güvenlik ve Production Değişiklikleri

Tarih: 16 Temmuz 2026

## Authentication ve authorization

- Kaynak koda gömülü admin e-posta/kullanıcı/parola fallbackleri kaldırıldı.
- Login artık hesap oluşturmaz, admin promote etmez, ban kaldırmaz veya parola hashini değiştirmez.
- Admin seed yalnız `ADMIN_EMAIL`, `ADMIN_USERNAME` ve en az 12 karakter `ADMIN_PASSWORD` ile çalışır.
- Sabit JWT fallback kaldırıldı.
- Production en az 32 karakter kalıcı `JWT_SECRET` olmadan başlamaz.
- JWT `HS256`, issuer ve audience doğrular; süre 30 günden 7 güne indirildi.
- Login/register/change-password rate limitleri eklendi.
- Yeni kullanıcı ve parola değişiminde 10–128 karakter politikası eklendi.
- Moderator hiyerarşisi actor/target rank kontrolüyle korundu; self moderation engellendi.

## Realtime ve support gizliliği

- Socket.IO origin allowlist ve `allowRequest` kontrolü eklendi.
- Socket handshake JWT doğrulaması eklendi.
- `userId` artık client payloadından değil doğrulanmış tokendan türetiliyor.
- Presence client-supplied identity kullanmıyor.
- Support ticket odasına katılım DB ownership/staff role kontrolünden geçiyor.
- Internal notlar yalnız `support:staff` odasına gidiyor.
- Private user/room helperlarındaki global fallback emit kaldırıldı.
- Listing report support eventleri global yerine ticket/staff odalarına yönlendirildi.
- Bütün frontend Socket.IO bağlantıları auth token gönderiyor.

## HTTP/browser güvenliği

- Strict production CORS allowlist.
- Unsafe mutationlar için Origin/Sec-Fetch-Site guard.
- Trusted proxy hop yapılandırması; doğrudan X-Forwarded-* güveni kaldırıldı.
- Helmet eklendi.
- CSP önce `Report-Only` olarak eklendi.
- Referrer Policy, Permissions Policy, frame/object/base URI korumaları eklendi.
- HSTS yalnız `ENABLE_HSTS=1` ile explicit açılır.
- `X-Powered-By` kaldırıldı.
- Production 500 cevapları internal hata ayrıntısını sızdırmaz.
- Query string request logundan çıkarıldı; error URL/token redaction genişletildi.
- `/livez` ve DB-backed `/readyz` eklendi.
- Fatal process hatalarında graceful shutdown başlatılıyor.

## Upload ve input güvenliği

- Part-time fotoğraf path traversal exact generated filename allowlist ve rooted `sendFile` ile kapatıldı.
- Rastgele image adları eklendi.
- Upload limitleri daraltıldı.
- Sharp `limitInputPixels` eklendi.
- GIF signature ve frame count doğrulaması eklendi.
- Upload-specific rate limit eklendi.
- Banner/profile URL alanları yalnız site içi path veya HTTPS kabul ediyor.
- Management image data yalnız tanımlı image MIME/base64 formatında ve boyut sınırında kabul ediliyor.
- Scraper tetikleme endpointi POST-only yapıldı.
- Cron secret karşılaştırması timing-safe yapıldı.

## Secret ve environment

- `.env` local başlangıçta açıkça yükleniyor.
- Production JWT/origin validation eklendi.
- `.env.example` production değişkenleriyle tamamlandı.
- `.gitignore` key, dump, backup, session ve environment kalıplarıyla genişletildi.
- Restrictive `.dockerignore` eklendi.
- Eski admin/JWT fallback değerleri güncel tracked kaynaklardan çıkarıldı.
- PostgreSQL TLS certificate verification varsayılanı açıldı; CA dosyası desteği eklendi.

## Docker, Compose, Railway ve TLS

- Frozen-lockfile kullanan multi-stage Dockerfile.
- Runtime non-root `node` user ve `dumb-init`.
- Container healthcheck ve writable media/session dizinleri.
- PostgreSQL hosta publish edilmiyor; private Compose network kullanıyor.
- Random environment password zorunlu.
- Restart policy, healthchecks, stop grace, log rotation, persistent volumes ve `no-new-privileges`.
- Default web servisi mevcut embedded worker davranışını koruyor.
- Standalone combined worker `split-workers` profile altında opt-in; worker health endpointi eklendi.
- Caddy automatic TLS, reverse proxy, health probe, log ve eski domain canonical redirect.
- Railway healthcheck `/readyz`; çift config kaldırıldı.

## Operasyon

- `install.sh`: Ubuntu 22.04/24.04, Docker kurulumu, secret üretimi, migration, admin seed, health.
- `update.sh`: backup, ff-only pull, build, migration, health ve code rollback.
- `backup.sh`: PostgreSQL, Telegram/bot DB state, uploads, app data, WhatsApp session, checksum.
- `restore.sh`: checksum, safety backup, DB/media/session restore, readiness.
- `doctor.sh`: Docker, Compose, DB, web, DNS, HTTPS, env permission ve secret varlık kontrolleri.
- `INSTALL.md`, `UPDATE.md`, `BACKUP-RESTORE.md` oluşturuldu.

## Test sonuçları

- API typecheck: geçti.
- Frontend typecheck: geçti.
- Full workspace production build: geçti.
- WhatsApp core: 7/7 geçti.
- Eleman transport: 2/2 geçti.
- Security unit: 7/7 geçti.
- Runtime smoke:
  - `/livez`: 200
  - Yetkisiz admin: 401
  - Cross-site mutation: 403
  - CSP Report-Only: mevcut
  - X-Powered-By: yok
  - Eksik JWT secret: production startup reddedildi
- ShellCheck: geçti.
- Compose YAML lint: geçti.
- `git diff --check`: geçti.
- Tracked secret/session filename kontrolü: yalnız `.env.example`.

## Ortam nedeniyle çalıştırılamayanlar

- Docker image build/runtime ve `docker compose config`: local Docker daemon yok.
- Canlı PostgreSQL migration/restore/backup drill: erişilebilir test DB yok.
- Let's Encrypt issuance: production DNS/TLS değişikliği yapılmadı.
- Dependency audit: pnpm 9 audit endpointi HTTP 410 döndürüyor; bu temiz sonuç değildir.

## Bilinçli olarak ertelenenler

- Telegram session/VAPID private key için KMS-backed column encryption migrationı.
- Object storage migrationı.
- Web→worker private control RPC ve worker→web realtime bridge.
- Worker ayrımını production varsayılanı yapma.
- WhatsApp Chromium sandbox flag değişikliği: bu görevden önceki aktif `whatsapp-client.ts` çalışması korunmuştur. Container non-root yapılarak etki azaltılmıştır; sandbox staging doğrulamasından sonra ayrıca ele alınmalıdır.
- HSTS enforcement: gerçek HTTPS doğrulandıktan sonra `ENABLE_HSTS=1`.

