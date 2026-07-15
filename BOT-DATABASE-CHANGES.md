# Bot ve Veritabanı Değişiklikleri

Tarih: 15 Temmuz 2026

## Uygulanan değişiklikler

### Process ve worker güvenilirliği

- `bot-worker.mjs` için ayrı build entrypoint eklendi.
- Worker PostgreSQL advisory lock ile platform başına singleton çalışıyor.
- Aynı Telegram/WhatsApp/Eleman worker ikinci kez açılırsa veri işlemeye başlamadan çıkıyor.
- Web processinde worker başlatma `RUN_BOT_WORKERS=0` ile kapatılabiliyor.
- Tek worker veya platform bazlı ayrı worker komutları eklendi.
- `BOT_PLATFORMS` ile yalnız seçili platformun schedulerı/bağlantısı başlıyor.
- Eleman taraması Telegram ilk taramasından ayrıldı; Telegram backfill Eleman'ı süresiz bekletmiyor.
- API ve bot worker için bounded SIGTERM/SIGINT shutdown eklendi.
- Scraper yeni iş almayı durduruyor, ana timerları temizliyor ve aktif cycle için en fazla 20 saniye bekliyor.
- Telegram logout yapmadan disconnect oluyor; session PostgreSQL'de korunuyor.
- WhatsApp Chromium `destroy()` yoluyla kapatılıyor.
- PostgreSQL pool kontrollü kapatılıyor.

### Transaction ve idempotency

- Telegram/WhatsApp import rezervasyonu ile listing veya pending-job yazımı tek transactiona alındı.
- Eleman import rezervasyonu, listing inserti ve import onayı tek transactiona alındı.
- İşlem hatasında pending import bırakıp mesajı kalıcı duplicate gösteren WhatsApp cleanup/delete yolu kaldırıldı; transaction rollback kullanılıyor.
- Pending ilan yayını conditional claim + listing insert + durum güncellemeleriyle tek transactiona alındı.
- Aynı pending ilanı eşzamanlı iki onay isteği yayınlayamıyor.
- Telegram Bot API polling için process içi mutex eklendi.
- Telegram update işleme veya offset persist hatasında offset ilerlemiyor; mesaj sonraki turda güvenli biçimde yeniden deneniyor.
- Offset DB'de yazılmadan process-memory offset güncellenmiyor.
- Başlangıç ve kuyruk kurtarmada tüm `isScanning` locklarını koşulsuz kaldırma kapatıldı; yalnız zaman aşımına uğramış locklar temizleniyor.

### Eleman.net

- Native HTTP fetch için varsayılan 20 saniye timeout eklendi.
- Bounded exponential backoff ve en fazla 3 deneme eklendi.
- 408/425/429/5xx ve transport hataları retry ediliyor.
- Başarısız HTTP cevabı artık “başarılı boş sayfa” sayılmıyor.
- Kaynak hatasında şehir cursorı ilerlemiyor ve hata source durumuna yazılıyor.
- Eleman.net Playwright kullanmadığı doğrulandı; kapatılacak browser/context/page yok.

### Veritabanı

Eklenen salt-okunur dosyalar:

- `lib/db/sql/bot-database-duplicate-report.sql`
- `lib/db/sql/bot-database-explain.sql`
- `artifacts/api-server/src/commands/botDatabaseAudit.ts`

Eklenen reversible migrationlar:

- `lib/db/sql/bot-database-indexes.up.sql`
- `lib/db/sql/bot-database-indexes.down.sql`

Önerilen migration indexleri:

- `imported_posts(source_id, external_id)` unique
- `imported_posts(duplicate_hash)` unique
- `listings(source_id, message_id)` partial unique
- `pending_jobs(imported_post_id)` partial unique
- `sources(platform, url)` unique
- `imported_posts(status, created_at DESC)`
- `pending_jobs(status, created_at DESC)`
- `listings(source_id, status)`
- `sources(platform, active, last_checked_at)`

Migrationlar uygulanmadı. Önce duplicate raporu çalışmalı; duplicate varsa hiçbir kayıt otomatik silinmeden manuel karar verilmelidir.

### Production başlangıcı ve log güvenliği

- Normal boot sırasında eşzamanlı `drizzle-kit push --force` kaldırıldı.
- Schema push yalnız açık `RUN_SCHEMA_PUSH=1` ile çalışır; önerilen kullanım ayrı deploy/migration adımıdır.
- Logger telefon, API hash, session string, token ve özel mesaj metni alanlarını redact ediyor.
- Pool ayırma talimatı eklendi: web için örnek `PG_POOL_MAX=10`, singleton worker için `PG_POOL_MAX=4`.

## Worker başlangıç komutları

Önce:

```text
pnpm --filter @workspace/api-server build
```

Birleşik singleton worker:

```text
pnpm --filter @workspace/api-server start:worker
```

Ayrı workerlar:

```text
pnpm --filter @workspace/api-server start:worker:telegram
pnpm --filter @workspace/api-server start:worker:whatsapp
pnpm --filter @workspace/api-server start:worker:eleman
```

Web service:

```text
RUN_BOT_WORKERS=0
pnpm --filter @workspace/api-server start:web
```

Windows/Railway ortam değişkeni komut öncesi shell sözdizimiyle değil servis environment ayarından verilmelidir.

## Session klasörü taşıma

### WhatsApp

1. Mevcut `${WWEBJS_AUTH_PATH}/session-ozelguvenlik` klasörünü worker persistent volume içine kopyalayın.
2. Worker servisinde `WWEBJS_AUTH_PATH` volume mount kökünü göstermeli.
3. Volume yalnız WhatsApp sahibi tek worker'a bağlanmalı.
4. Eski ve yeni worker aynı session klasörüyle eşzamanlı başlatılmamalı.
5. Worker `ready` olduktan sonra eski process kapatılmalı; rolling overlap yapılmamalı.

Docker Compose mevcut `wa_auth:/app/.wwebjs_auth` volumeunu koruyor. Railway'de persistent volume manuel olarak worker servisine bağlanmalıdır.

### Telegram

Telegram session PostgreSQL `telegram_sessions.session_string` alanında; klasör taşıması yoktur. Aynı session ile iki Telegram worker eşzamanlı çalıştırılmamalıdır.

## Test sonuçları

- API TypeScript: başarılı.
- API build: başarılı; `dist/index.mjs` ve `dist/bot-worker.mjs` üretildi.
- WhatsApp core: 7/7 başarılı.
- Eleman transport: 2/2 başarılı.
  - HTTP 503 boş sonuç sayılmıyor.
  - Gerçek HTTP 200 boş sayfa boş liste kabul ediliyor.
- Production bootstrap syntax: başarılı.
- `git diff --check`: başarılı; yalnız Windows LF/CRLF uyarıları var.
- Workspace build: sonuç ayrıca doğrulandı.

Canlı DB testi:

- `audit:bot-db` çalıştırıldı fakat mevcut `DATABASE_URL` `127.0.0.1:1` adresine yöneldiği için `ECONNREFUSED` verdi.
- Bu nedenle duplicate sayıları, canlı index durumu, connection kullanım grafiği ve `EXPLAIN (ANALYZE, BUFFERS)` sonucu alınamadı.
- Güvenlik gereği unique migration otomatik çalıştırılmadı.

## Manuel doğrulama matrisi

- Web açıkken Telegram/WhatsApp/Eleman worker restart: ayrı servis kurulumu sonrası staging'de uygulanmalı.
- Aynı platform workerı iki kez: advisory lock ikinci workerı engeller.
- Aynı external/message ID: transaction + unique migration ile korunur; migration öncesi uygulama exact hash koruması devam eder.
- PostgreSQL geçici kesintisi: cursor/offset başarısız yazımda ilerlemez; canlı staging fault testi yapılmalı.
- Kaynak site timeout: Eleman bounded timeout/retry ile hata kaydeder ve cursor ilerletmez.
- Graceful shutdown: kod/build doğrulandı; gerçek Telegram/WhatsApp sessionıyla staging SIGTERM testi yapılmalı.
- Session kalıcılığı: volume ve PostgreSQL bağımlı; Railway volume bağlandıktan sonra restart testi yapılmalı.
- Browser sızıntısı: Eleman browser kullanmıyor; WhatsApp shutdown Chromium'u destroy ediyor.
- Bot hatasında web devamlılığı: ayrı servis geçişinden sonra sağlanır.

## Bilinen riskler / yapılmayanlar

- Production deploy yapılmadı.
- Index migrationları uygulanmadı ve veri silinmedi.
- Web admin Telegram/WhatsApp kontrol route'ları process-local client kullanıyor. Tam ayrı servis geçişinden önce private authenticated control RPC/proxy gerekir.
- Worker realtime eventlerini web Socket.IO processine taşımak için outbox/NOTIFY veya broker gerekir.
- Bu iki köprü tamamlanmadan `RUN_BOT_WORKERS=0` production web servisinde açılmamalı; aksi halde admin pairing/QR ve anlık bot eventleri eksik kalır.
- Boolean `sources.is_scanning` lockında owner token/lease kolonu yok. Advisory singleton overlapı engeller; ileri aşamada tokenized lease migrationı önerilir.
- Source tablolarında ayrı `attempt`, `last_success_at`, `last_listing_at`, `next_retry_at` kolonları yok. Şema genişletilmedi.
- Telegram timeout alttaki GramJS isteğini fiziksel olarak iptal edemeyebilir.
- WhatsApp tüm lifecycle/page işlemlerini kapsayan tek mutex refactoru bu aşamada yapılmadı.

## Değiştirilen dosyalar

- `.env.example`
- `BOT-DATABASE-AUDIT.md`
- `BOT-DATABASE-CHANGES.md`
- `scripts/start.mjs`
- `artifacts/api-server/build.mjs`
- `artifacts/api-server/package.json`
- `artifacts/api-server/src/bot-worker.ts`
- `artifacts/api-server/src/commands/botDatabaseAudit.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/lib/logger.ts`
- `artifacts/api-server/src/routes/pending-jobs.ts`
- `artifacts/api-server/src/services/eleman-client.ts`
- `artifacts/api-server/src/services/eleman-client.test.ts`
- `artifacts/api-server/src/services/telegram-client.ts`
- `artifacts/api-server/src/workers/scraper.ts`
- `lib/db/sql/bot-database-duplicate-report.sql`
- `lib/db/sql/bot-database-explain.sql`
- `lib/db/sql/bot-database-indexes.up.sql`
- `lib/db/sql/bot-database-indexes.down.sql`

