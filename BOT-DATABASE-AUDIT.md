# Bot ve Veritabanı Güvenilirlik Denetimi

Tarih: 15 Temmuz 2026  
Kapsam: PostgreSQL, Telegram, WhatsApp, Eleman.net ve scraper worker altyapısı.

## Mevcut mimari

- Express/Socket.IO, Telegram, WhatsApp Chromium, Eleman.net taraması ve tüm bakım timerları tek Node process içinde çalışıyor.
- `scripts/start.mjs` API'yi başlatırken eşzamanlı `drizzle-kit push --force` çalıştırıyor.
- Tek build entrypoint `src/index.ts`; ayrı worker artifact veya npm komutu yok.
- Queue/Redis/Bull bulunmuyor. Scheduling process-local interval/timeout ve `sources.is_scanning` alanına dayanıyor.
- Redis mevcut değil; zorla eklenmemeli.

## Bot başlangıçları

- `src/index.ts/bootstrapWorkers()` Telegram oturumunu açıyor, WhatsApp'ı başlatıyor ve scraper timerlarını kuruyor.
- Her web replica aynı botları ve timerları yeniden başlatır.
- Rolling deploy sırasında eski/yeni container çakışması Telegram session, WhatsApp LocalAuth ve source lock yarışları oluşturabilir.
- Worker başlangıcındaki `releaseStaleScanLocks(true)` canlı başka replica'nın kilidini kaldırabilir.

## Session kalıcılığı

### Telegram

- GramJS session string ve Bot API offset PostgreSQL `telegram_sessions` tablosunda saklanıyor.
- Dosya taşıma gerekmiyor.
- Tabloda singleton constraint yok; `.limit(1)` ile belirsiz satır seçiliyor.

### WhatsApp

- Yol: `WWEBJS_AUTH_PATH`, varsayılan `./.wwebjs_auth`.
- Gerçek session: `${WWEBJS_AUTH_PATH}/session-ozelguvenlik`.
- Docker Compose `wa_auth:/app/.wwebjs_auth` volume tanımlıyor.
- Railway volume kod içinde tanımlı değil; platformdan bot servisine persistent volume bağlanmalı.
- Aynı volume iki aktif Chromium process tarafından paylaşılmamalı.

### Eleman.net

- Playwright/Puppeteer kullanmıyor.
- Native `fetch()` ve HTML/JSON-LD parserı kullanıyor; browser/context/page sızıntısı yok.

## Kritik bulgular

1. `imported_posts` inserti ile `listings`/`pending_jobs` inserti transaction içinde değil. Crash sonrası pending import kalıp mesajı kalıcı duplicate gösterebilir.
2. `(source_id, external_id)` ve `(source_id, message_id)` schema-level unique değil.
3. Global `duplicate_hash` unique indexi runtime'da oluşturuluyor; önce duplicate satırlar otomatik siliniyor.
4. Her boot'ta `dedupeExistingListings()` otomatik veri siliyor; yeni “veri silme” sınırıyla uyumsuz.
5. Eleman.net timeout/HTTP hata/gerçek boş sayfa ayrımı yapmıyor. Kesinti başarılı boş tarama sayılıp cursor ilerleyebilir.
6. Eleman.net fetch timeout ve bounded retry yok; shared cycle sonsuza kadar takılabilir.
7. Telegram Bot API polling ana cycle ve ayrı interval tarafından eşzamanlı çağrılabilir.
8. Bot update işleme hatasında offset yine ilerliyor; transient DB hatası mesaj kaybettirebilir.
9. Source lock boolean sahiplik içermiyor. Başarısız lock acquisition sonrasında başka worker'ın lockı kaldırılabiliyor.
10. API processinde SIGTERM/SIGINT graceful shutdown yok; Chromium, Telegram ve DB pool kontrollü kapanmıyor.
11. Production bootstrap canlı API yanında `push-force` çalıştırıyor.

## Yüksek bulgular

1. WhatsApp init/auth/disconnect hata yollarında Chromium cleanup her zaman await edilmiyor.
2. WhatsApp lifecycle ve page-mutating işlemler için tek genel mutex yok.
3. Eleman, tamamlanmamış Telegram backfill yüzünden süresiz bekleyebilir.
4. Telegram timeout `Promise.race` timerını temizlemiyor ve alttaki GramJS isteğini iptal etmiyor.
5. `sources.lastCheckedAt` hem heartbeat hem attempt/success anlamında kullanılıyor; son başarı ayrı değil.
6. Source state'te attempt, consecutive failure, lastSuccess, lastListing ve nextRetry alanları yok.
7. Pending job approval read/insert/update adımlarında transaction/row claim yok.
8. `pending_jobs` count endpoint'i tüm satırları uygulamaya çekiyor.
9. `findDuplicateActiveListing()` her mesajda 1.200 tam metin çekip Node tarafında hash hesaplıyor.
10. Logger yalnız HTTP auth/cookie alanlarını redact ediyor; telefon/session/JID alanları korunmuyor.

## Mevcut olumlu yapılar

- Telegram reconnect process içi mutex kullanıyor.
- WhatsApp reconnect bounded attempt ve watchdog kullanıyor.
- Source cursor/progress verileri PostgreSQL'de kalıcı.
- WhatsApp external message ID, Telegram message ID ve Eleman ilan ID üretiyor.
- `cycleRunning/cycleQueued` aynı process içindeki cycle overlapini önlüyor.
- Source lock acquisition conditional `UPDATE ... WHERE is_scanning=false RETURNING` kullanıyor.
- Önceki feed migrationı active/date/city/featured ve reaction sorguları için hazırlanmış durumda.

## PostgreSQL ve sorgular

- Ortak pool varsayılan `PG_POOL_MAX=10`; HTTP, bot, timer ve migration aynı poolu paylaşıyor.
- Ayrı worker servislerinde pool toplamı `web replica × web max + worker replica × worker max` olarak hesaplanmalı.
- Öneri: web için 10, singleton bot worker için 4; gerçek DB connection limitiyle doğrulanmalı.
- Canlı `EXPLAIN ANALYZE` denendi ancak kullanılabilir bağlantı sonucu alınamadı. Production sorgu planı doğrulanmadan geniş trigram index eklenmemeli.

Kritik plan adayları:

- Active listing feed count/data.
- `(source_id, external_id)` imported lookup.
- `(source_id, message_id)` listing lookup.
- `pending_jobs(status, created_at)`.
- Source platform/active/scan state.
- 1.200 satırlık uygulama tarafı duplicate hash taraması.

## Duplicate raporu — migration öncesi zorunlu

- `imported_posts GROUP BY duplicate_hash`
- `imported_posts GROUP BY source_id, external_id`
- `listings GROUP BY source_id, message_id`
- `pending_jobs GROUP BY imported_post_id`
- `sources GROUP BY platform, url`

Hiçbir duplicate otomatik silinmemeli. Unique migration duplicate varsa güvenli şekilde fail etmeli ve ID raporu manuel incelenmelidir.

## Önerilen indexler

- Unique `imported_posts(source_id, external_id)`.
- Unique partial `listings(source_id, message_id)`.
- Unique partial `pending_jobs(imported_post_id)`.
- `pending_jobs(status, created_at DESC)`.
- `listings(source_id, status)`.
- `sources(platform, active, last_checked_at)`.
- Unique `sources(platform, url)`.
- Existing global exact `imported_posts(duplicate_hash)` yalnız duplicate raporu temiz çıktıktan sonra yönetilen migrationa taşınmalı.

Her index ayrı `CREATE INDEX CONCURRENTLY`; rollback `DROP INDEX CONCURRENTLY`.

## Ayrı process kararı

En düşük riskli hedef:

1. Web service: HTTP/Socket.IO; `RUN_BOT_WORKERS=0`.
2. Singleton bot service: mevcut Telegram/WhatsApp/Eleman erişim fonksiyonlarını değiştirmeden çalıştırır.
3. Bot process lifetime PostgreSQL advisory lock alır; ikinci replica lock alamazsa çalışmaz.
4. WhatsApp volume yalnız bot servisine bağlanır.
5. Admin pairing/auth/scan komutları process-local olduğu için tam ayrım öncesinde private control RPC gerekir.

Bu nedenle production varsayılanı bu aşamada otomatik değiştirilmemeli. Ayrı worker komutları hazırlanabilir; deployment geçişi control RPC ve volume doğrulamasından sonra manuel yapılmalıdır.

## Uygulanacak güvenli kapsam

- Read-only duplicate/EXPLAIN SQL dosyaları.
- Reversible concurrent index migrationları.
- Otomatik destructive boot dedupe'un kaldırılması.
- Transaction-safe imported/listing/pending write.
- Pending approval transaction claim.
- Eleman timeout, retry ve gerçek hata ayrımı.
- Telegram polling mutex ve güvenli offset ilerletme.
- Lock çalma yollarının kaldırılması.
- Bounded graceful shutdown.
- Opt-in singleton worker entrypoint ve npm başlangıç komutları.
- Logger secret/telefon redaction.
- Production `push-force` işleminin opt-in hale getirilmesi.

## Kapsam dışı / sonraki manuel aşama

- Private web→worker control RPC.
- Socket.IO event bridge/outbox.
- Tokenized source lease kolonlarına canlı migration ve tam rollout.
- Railway'de ikinci service/volume oluşturma.
- Duplicate kayıtları manuel inceleyip unique migrationı çalıştırma.
- Canlı `EXPLAIN (ANALYZE, BUFFERS)` doğrulaması.

