# Güvenlik ve Production Hazırlık Denetimi

Tarih: 16 Temmuz 2026  
Kapsam: Environment, secret yönetimi, authentication/authorization, realtime, upload, XSS/SSRF/SQL, Docker, Compose, Railway ve operasyonel kurtarma.

## Sonuç

Uygulama tek Railway servisi olarak çalışabilir; ancak mevcut hali gözetimsiz production kurulumu için güvenli değildir. En kritik riskler kaynak koda gömülü varsayılan admin/JWT bilgileri, doğrulanmayan Socket.IO kimliği, özel realtime verilerin global yayını ve part-time fotoğraf endpointindeki path traversal açığıdır.

## Kritik bulgular

### 1. Varsayılan admin hesabıyla uzaktan yetki alma

- `artifacts/api-server/src/routes/auth.ts` environment eksikse kaynak koddaki e-posta, kullanıcı adı ve parolayı kabul ediyor.
- Başarılı giriş mevcut hesabı admin yapabiliyor, parolasını değiştiriyor ve banı kaldırıyor.
- Aynı fallback `scripts/seed-admin.ts` içinde de bulunuyor.
- Bu değerler Git geçmişinde mevcut; kaldırmak tek başına rotasyon yerine geçmez.

Karar:

- Bütün fallbackler kaldırılmalı.
- Production başlangıcı güçlü secret/admin environment doğrulaması başarısızsa durmalı.
- Normal login hiçbir hesabı oluşturmamalı, promote etmemeli veya parola hashini değiştirmemeli.
- Mevcut admin parolası production tarafında manuel döndürülmeli.

### 2. Tahmin edilebilir JWT anahtarı

- `artifacts/api-server/src/middlewares/auth.ts`, `SESSION_SECRET` yoksa bilinen sabit anahtar kullanıyor.
- API package start, Procfile ve bazı doğrudan girişler env normalize adımını atlıyor.
- `JWT_SECRET` belgeleniyor ama JWT doğrulaması başka değişken kullanıyor.

Karar:

- Tek canonical `JWT_SECRET` kullanılmalı.
- Production'da en az 32 byte kalıcı secret yoksa process başlamamalı.
- JWT algorithm, issuer ve audience doğrulanmalı.
- Runtime'da rastgele secret üretimi production için kaldırılmalı; restart tokenları geçersiz kılmamalı.

### 3. Socket.IO kullanıcı taklidi ve özel oda erişimi

- Client tarafından gönderilen `userId` doğrulanmadan `user:<id>` odasına katılım sağlıyor.
- Presence için client-supplied ID kabul ediliyor.
- Her socket herhangi bir `support:ticket:<id>` odasına katılabiliyor.
- Socket CORS `*`.

Karar:

- Handshake JWT doğrulanmalı ve kimlik yalnız tokendan türetilmeli.
- Anonim socket yalnız public event alabilmeli; özel oda işlemleri reddedilmeli.
- Support odası için ticket ownership veya staff rolü DB'den kontrol edilmeli.
- HTTP ile aynı origin allowlist kullanılmalı.

### 4. Özel realtime verilerin global yayınlanması

- `emitRealtimeToUser` ve `emitRealtimeToRoom`, özel odaya ek olarak global emit yapıyor.
- Support mesajları ve internal note işareti global gönderilebiliyor.

Karar:

- Private helperlardan global emit kaldırılmalı.
- Support mesajı sadece ticket odasına; staff güncellemesi yalnız staff odasına gönderilmeli.
- Internal note kullanıcı/global kanala gönderilmemeli.

### 5. Public dosya path traversal

- `GET /api/parttime-photos/:filename` ismi doğrudan `path.join` ile birleştiriyor.
- Windows backslash ve encode edilmiş traversal girdileriyle upload root dışındaki dosyalara ulaşma riski var.

Karar:

- Exact generated JPG filename regexi.
- `sendFile(filename, {root, dotfiles:"deny"})`.
- Path containment ve `nosniff`.

## Yüksek bulgular

### Authentication ve yetki

- Login/register/change-password rate limit yok.
- JWT 30 gün geçerli ve logout yalnız başarılı cevap dönüyor; token revoke edilmiyor.
- Parola minimumu 6 karakter.
- Senior moderator target hiyerarşisi eksikliği nedeniyle admin/peer üzerinde ban/mute işlemi yapabilir.
- Bazı `/admin` route'ları ortak guard yerine inline veya publish grant kontrolü kullanıyor; merkezi policy testi yok.

### Proxy, CORS ve browser güvenliği

- `X-Forwarded-For` ve `X-Forwarded-Proto` doğrudan güveniliyor; `trust proxy` yok.
- HTTP CORS her origin'i credentials ile yansıtıyor.
- Helmet/CSP/HSTS/frame/referrer/permissions policy yok.
- Bearer token localStorage'da; klasik cookie-CSRF düşük, fakat XSS etkisi yüksek.

### Upload kaynak tüketimi

- Upload limitleri 2–25 MB.
- Çoğu görsel Sharp ile re-encode edildiğinden script persistence görülmedi.
- Pixel/frame/decode limitleri ve upload-specific throttle eksik.
- Staff GIF ham olarak saklanıyor; magic byte/frame doğrulaması yetersiz.

### Container ve kalıcılık

- Docker tek aşamalı ve root çalışıyor.
- Chromium `--no-sandbox` ile root altında.
- `.dockerignore` yok; `COPY . .` local `.env`, session, backup ve `.git` içeriğini image contextine alabilir.
- Compose PostgreSQL'i `5432:5432` ile internete açabilecek şekilde yayınlıyor ve zayıf sabit development parolası kullanıyor.
- Upload/media dizinlerinin çoğu volume değil.
- Railway healthcheck kapalı, mevcut health yalnız `{status:"ok"}`.

## Orta bulgular

- Route-level bazı 500 cevapları `String(error)`/`error.message` döndürüyor.
- İlk request logger query stringi tam yazıyor.
- Chat banner/management URL alanlarında unsafe scheme allowlist yok.
- User `avatarUrl` alanı arbitrary URL/data değeri kabul ediyor.
- `GET /admin/scrape/run` state değiştiriyor; secret korumalı olsa da POST-only olmalı.
- Cron secret normal string equality kullanıyor.
- Telegram session, phone-code hash ve VAPID private key PostgreSQL'de plaintext saklanıyor.
- PostgreSQL TLS `rejectUnauthorized:false`.
- `.gitignore` `.env.production`, dump, key, session ve backup arşivlerini kapsamıyor.
- `.env` üretimi README'de var fakat runtime açıkça `.env` yüklemiyor.
- `railway.json` ve `railway.toml` iki farklı source-of-truth oluşturuyor.
- Hardcoded fallbacklerin geçmişte bulunduğu doğrulandı; gerçek secret imzası taşıyan tracked `.env`, key, dump veya session dosyası bulunmadı.

## Düşük / defense-in-depth

- Predictable timestamp tabanlı public image adları.
- Request iki kez loglanıyor.
- `uncaughtException` sonrası process yaşamaya devam edebiliyor.
- Sağlık endpointi DB/storage/shutdown durumunu göstermiyor.
- Health ve CSP rapor endpointleri için abuse limiti yok.

## Risk bulunmayan veya sınırlı alanlar

- SQL request girdileri Drizzle parameterization kullanıyor; doğrudan SQL injection bulunmadı.
- Server-side fetch hedefleri OpenAI, Telegram, Eleman.net ve Geofabrik gibi sabit hostlara gidiyor; doğrudan kullanıcı kontrollü SSRF bulunmadı.
- Request girdisinin shell komutuna aktarıldığı command injection bulunmadı.
- Normal React kullanıcı metinlerini escape ediyor; ilan HTML render ihtiyacı bulunmadı.
- Uploadların çoğu memory-backed ve Sharp ile JPEG/WebP'ye dönüştürülüyor; doğrudan script çalıştırma bulunmadı.
- Cron endpointi secret yoksa fail-closed.

## Cookie ve CSRF değerlendirmesi

- Kurulu paketlere rağmen aktif Express session/auth cookie kullanılmıyor.
- Authentication `Authorization: Bearer` header ile yapıldığı için klasik ambient-cookie CSRF doğrudan uygulanabilir değil.
- State-changing browser isteklerinde origin doğrulaması defense-in-depth olarak eklenmeli.
- Cookie auth ileride eklenirse `Secure`, `HttpOnly`, uygun `SameSite`, CSRF token ve dar CORS birlikte zorunlu olmalı.

## Dependency değerlendirmesi

- `pnpm audit --prod --json` çalıştırıldı; pnpm 9 audit endpointi HTTP 410 döndürdü. Bu temiz audit sonucu değildir.
- Lockfile'da deprecated `@esbuild-kit` zinciri üzerinden `esbuild@0.18.20` bulunuyor; bilinen moderate development-server advisory riski var.
- Major paketler körlemesine yükseltilmemeli.
- Güncel CI üzerinde bulk audit ve `osv-scanner`/`gitleaks --redact` çalıştırılmalı.

## Production mimari kararı

İlk güvenli rollout:

1. Tek web replica ve mevcut embedded worker modeli korunur.
2. Strong persistent secrets, güvenlik middlewareleri, healthcheck, Docker hardening, private DB network ve backup/restore uygulanır.
3. Uploadlar tek persistent media volume ile korunur; sonraki aşamada object storage değerlendirilir.
4. Caddy VPS kurulumunda TLS sonlandırır; Railway kendi TLS'ini kullanır.

Ayrı worker executable'ları mevcut olsa da production varsayılanı yapılmayacak:

- Web→worker admin control RPC yok.
- Worker→web realtime bridge yok.
- Web processinde kalan timerlar singleton değil.

Bu köprüler olmadan `RUN_BOT_WORKERS=0` pairing/status/realtime davranışını bozar. Compose içinde split-worker servisleri opt-in profile olarak tanımlanabilir; standart kurulum çalışan birleşik modu kullanmalıdır.

## Kontrollü uygulama kapsamı

- Hardcoded secret/admin fallbacklerini kaldırma ve centralized env validation.
- Socket JWT/origin/room authorization ve private realtime düzeltmesi.
- Strict production CORS, trusted proxy, origin guard ve route-specific rate limit.
- Helmet + CSP Report-Only; HSTS yalnız explicit HTTPS onayıyla.
- Production 500 cevap redaction.
- Path traversal ve upload pixel/signature/rate hardening.
- Admin hierarchy guard.
- `.gitignore`, `.dockerignore`, multi-stage/non-root Docker.
- Sağlıklı PostgreSQL/uygulama Compose; Caddy; restart/log rotation/volumes.
- `install.sh`, `update.sh`, `backup.sh`, `restore.sh`, `doctor.sh`.
- `/livez`, DB-backed `/readyz`, worker health.
- Güvenlik testleri ve dokümantasyon.

## Uygulama dışı / manuel

- Exposed production admin ve JWT secret rotasyonu.
- DNS A/AAAA kayıtları.
- Caddy'nin gerçek Let's Encrypt issuance testi.
- Railway volume bağlama.
- Telegram/VAPID alanlarını KMS ile şifreleyen DB migrationı.
- Worker control RPC/realtime bridge.
- Object storage migrationı.
- Canlı DB backup/restore drill ve dependency scanner CI.

## Test kısıtları

- Yerel ortamda Docker kurulu değil; Compose/build/runtime testleri statik doğrulama ile sınırlı kalacak.
- Mevcut `DATABASE_URL` erişilemez dummy adrese yöneliyor; DB-backed güvenlik testleri çalışmayabilir.
- Production DNS/TLS bu ortamdan değiştirilmeyecek.
- Önceden var olan `artifacts/api-server/src/services/whatsapp-client.ts` çalışma alanı değişikliği korunacak ve bu görev kapsamında değiştirilmemelidir.

