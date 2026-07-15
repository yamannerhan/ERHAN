# Web Performans Değişiklikleri

Tarih: 15 Temmuz 2026

## Uygulanan değişiklikler

### Görseller ve LCP

- Üç haber PNG'sinin 320/640 px AVIF ve WebP türevleri üretildi; orijinaller silinmedi.
- Haber kartlarına `picture`, `srcset`, `sizes`, `loading="lazy"`, `decoding="async"` ve intrinsic ölçüler eklendi.
- Career hero için 512/1024 px AVIF ve WebP türevleri üretildi; orijinal PNG korundu.
- Hero HTML'de preload ediliyor ve React tarafında `fetchPriority="high"`, eager loading ve 1024×341 intrinsic ölçü kullanıyor.

### JS ve ilk açılış

- PDF manual chunk kuralı kaldırıldı. `jspdf` ve `html2canvas` artık yalnız CV indirme aksiyonunda dinamik yükleniyor.
- Ağır sohbet paneli ve Socket.IO bağlantısı ilk açılıştan çıkarıldı.
- İlk ekranda yalnız aynı görünümlü küçük sohbet FAB'ı render ediliyor; kullanıcı açınca panel chunkı ve bağlantı başlıyor.
- Mobil kart listesi ile masaüstü tablo artık aynı anda iki DOM ağacı oluşturmuyor.

### Veri çekme ve sorgular

- İlan aramasına 350 ms debounce eklendi.
- Ana sayfa yenilemesi 30 saniyeden 120 saniyeye çıkarıldı ve hidden sekmede durduruldu.
- Featured çağrılarında kullanılmayan `count(*)` opsiyonel olarak kapatıldı.
- Newest/oldest liste sıralaması Node.js içinde 800 kayıt sıralamak yerine DB `ORDER BY + LIMIT/OFFSET` kullanıyor.
- Liste sorgusu raw text, verification snapshot ve konum detaylarını çekmiyor.
- Liste açıklaması 700, requirements 400 karakterlik özetle sınırlandı; detay endpoint'i değişmedi.
- Like/favorite sorguları kullanıcının tüm geçmişi yerine yalnız dönen sayfadaki ilan ID'leriyle sınırlandı.
- Şirket overlay sorgusu `logo_data` dahil `select *` yerine yalnız kullanılan beş alanı seçiyor.
- Misafir liste cevaplarına yalnız private browser cache politikası eklendi; kullanıcıya özel cevaplar `private, no-store`.

### Sunucu teslimi ve DB

- Gzip compression middleware eklendi.
- Hash'li Vite assetlerine bir yıllık immutable cache eklendi.
- HTML cevapları `private, no-store` olarak bırakıldı.
- Hash'siz public assetlere bir günlük cache uygulandı.
- PostgreSQL pool'a idle timeout, connection timeout, bağlantı ömrü ve `PG_POOL_MAX` ayarı eklendi.
- Feed, şehir, featured ve kullanıcı like/favorite sorguları için veri silmeyen concurrent index migrationı hazırlandı.

## Önce / sonra

| Ölçüm | Önce | Sonra | Fark |
|---|---:|---:|---:|
| 3 haber görseli | 5.813.861 B PNG | 33.408 B AVIF 640 | -%99,43 |
| Hero masaüstü | 69.184 B PNG | 26.263 B AVIF | -%62,04 |
| Hero mobil | 69.184 B PNG | 11.314 B AVIF | -%83,65 |
| PDF ilk yükleme maliyeti | 174.477 B gzip | 0 B | -%100 |
| Eager chat + socket | 26.890 B gzip | 0 B | -%100 |
| Homepage polling | 30 sn | 120 sn + visibility | -%75 istek |
| Newest/oldest DB satır üst sınırı | 800 | 20 (varsayılan sayfa) | -%97,5 |
| Liste description | sınırsız | en fazla 700 karakter | sınırlandı |
| Liste requirements | sınırsız | en fazla 400 karakter | sınırlandı |

İlk ana sayfa statik JS zincirinden PDF'nin çıkarılması yaklaşık **174 KB gzip** kazandırdı. Chat/socket ile birlikte ilk açılıştan yaklaşık **201 KB gzip** çıkarıldı.

## Lighthouse

Yerel production Vite preview ile:

- Mobil Performance: **74**
- Masaüstü Performance: **98**
- Mobil LCP: **4,97 sn**
- Toplam ağ payloadı: mobil **758 KiB**, masaüstü **776 KiB**
- SEO: **92**

Bu preview API/SSR sunucusunu kullanmadığı için SEO skoru robots/server injection testinin yerine geçmez. Production deployment yapılmadı.

## Sorgu sayısı kontrolü

- İlan listesi misafir: settings + count + listings + koşula bağlı author/company batch sorguları. Featured çağrıda count kaldırıldı.
- İlan listesi giriş yapmış kullanıcı: yukarıdakilere iki paralel, sayfa ID'leriyle sınırlı like/favorite sorgusu ekleniyor.
- İlan detayı misafir: listing + koşula bağlı author/company batch sorguları.
- İlan detayı giriş yapmış kullanıcı: yukarıdakilere iki paralel like/favorite sorgusu ekleniyor.
- N+1 bulunmadı; author ve company verileri batch getiriliyor.

Yerel PostgreSQL bulunmadığı için runtime query logger ölçümü alınamadı. Bu sayılar route akışı üzerinden statik olarak doğrulandı.

## SEO regresyon kontrolü

- Build HTML title: `Özel Güvenlik İş İlanları | Özel Güvenlik Online`
- Canonical: `https://ozelguvenlik.online/`
- `seo-render.ts` içinde WebSite, Organization, JobPosting ve BreadcrumbList üretimi korunuyor.
- Route veya SEO URL yapısı değiştirilmedi.

## Test sonuçları

- `pnpm build`: başarılı.
- API TypeScript: başarılı.
- Frontend TypeScript: başarılı.
- WhatsApp mevcut testleri: **7/7 başarılı**.
- Lighthouse mobil/masaüstü: tamamlandı.
- Root `lint` scripti projede tanımlı değil; bu nedenle lint çalıştırılamadı.
- Build sırasında mevcut üç UI sourcemap uyarısı devam ediyor; build'i engellemiyor.

## Değiştirilen dosyalar

- `PERFORMANCE-AUDIT.md`
- `PERFORMANCE-CHANGES.md`
- `artifacts/api-server/package.json`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/routes/listings.ts`
- `artifacts/ozel-guvenlik/src/components/chat-bubble.tsx`
- `artifacts/ozel-guvenlik/src/components/chat-fab-icon.tsx`
- `artifacts/ozel-guvenlik/src/components/home-news-cards.css`
- `artifacts/ozel-guvenlik/src/components/home-news-cards.tsx`
- `artifacts/ozel-guvenlik/src/components/layout.tsx`
- `artifacts/ozel-guvenlik/src/pages/home.tsx`
- `artifacts/ozel-guvenlik/src/pages/listings.tsx`
- `artifacts/ozel-guvenlik/vite.config.ts`
- `lib/db/src/index.ts`
- `lib/db/sql/listing-feed-performance-indexes.sql`
- `pnpm-lock.yaml`
- Responsive AVIF/WebP haber ve banner dosyaları.

## Bilinen riskler ve yapılmayanlar

- Index SQL dosyası hazırlandı fakat production DB'ye uygulanmadı.
- Yerel PostgreSQL olmadığı için gerçek DB query count ve gerçek API response byte ölçümü yapılamadı; sorgu üst sınırları kod üzerinden doğrulandı.
- Recommended sıralama iş mantığını korumak için hâlâ en fazla 500 kayıt üzerinde uygulama tarafında ranking yapıyor.
- Chat açılmadan canlı sohbet unread socketi çalışmaz; bu ilk yükü azaltma tercihinin beklenen sonucudur.
- Inter fontu ve kullanılmayan bağımlılık adayları yalnız raporlandı, kaldırılmadı.
- CSS coverage'a dayanmadan toplu CSS silinmedi.
- Production deploy veya Railway tetikleme yapılmadı.

