# Web Performans Denetimi

Tarih: 15 Temmuz 2026  
Kapsam: Ana sayfa, ilan listesi, ilan detayı, ortak layout, public API ve statik asset teslimi.

## Başlangıç ölçümleri

- Ana sayfa statik JS zinciri: **1.252.749 B raw / 394.974 B gzip**
- Ana sayfa CSS: **289.623 B raw / 46.646 B gzip**
- Bilinen JS + CSS: **431,3 KiB gzip**
- Üç haber PNG görseli: **5.813.861 B / 5,54 MiB**
- LCP adayı career hero: **69.184 B, 1024×341**
- İlk ana sayfa transfer tahmini: **yaklaşık 6,29 MiB**
- En büyük chunklar:
  - PDF: 590.062 B / 174.477 B gzip
  - Motion: 139.457 B / 46.059 B gzip
  - UI: 101.862 B / 34.540 B gzip
  - Chat bubble: 47.444 B
  - Socket client: 41.880 B

## Kritik bulgular

1. Üç haber görseli küçük kartlarda toplam 5,54 MiB PNG olarak eager yükleniyor.
2. PDF chunkı yalnız CV indirmede gerekli olmasına rağmen ana sayfanın statik JS zincirine giriyor.
3. İlan listesi mobil kartları ve masaüstü tabloyu aynı anda render ediyor.
4. Liste endpoint'i 500–800 tam ilan satırını `select *` ile çekip Node.js içinde sıralıyor.
5. Tam açıklama, requirements, raw text ve kullanılmayan kolonlar liste sorgusunda taşınıyor.
6. Ana sayfa ağır ilan sorgusunu 30 saniyede bir, görünürlük kontrolü olmadan yeniliyor.
7. Full modda kapalı sohbet bile ağır chat bundle'ını ve ikinci Socket.IO bağlantısını başlatıyor.
8. Hash'li Vite assetleri `no-store` ile sunuluyor; tarayıcı cache avantajı tamamen kaybediliyor.

## Orta bulgular

1. Arama input'u debounce edilmediği için her tuş API sorgusu açabiliyor.
2. Ana ve featured listeler ayrı çağrılıyor; featured çağrı da gereksiz `count(*)` çalıştırıyor.
3. Giriş yapan kullanıcıda tüm like/favorite ID'leri çekiliyor; yalnız sayfa ilanlarıyla sınırlı değil.
4. Şirket overlay sorguları `logo_data` dahil `select *` kullanıyor.
5. Ana sayfa cold start yaklaşık 8 HTTP çağrısı ve 2 socket bağlantısı açıyor.
6. Online/unread polling, socket eventleriyle mükerrer çalışıyor.
7. Public API yanıtlarında açık cache politikası yok.
8. HTTP compression middleware bulunmuyor.
9. Banner geç keşfediliyor; HTML preload yok, intrinsic width/height eksik.
10. Liste feed koşullarını destekleyen status/isActive/date indeksleri görünmüyor.
11. PostgreSQL pool sabit `max:10`; idle timeout ve bağlantı ömrü ayarı yok.

## Düşük bulgular

1. Banner ve presence timer cleanup'ları doğru.
2. Layout socket/listener cleanup'ı genel olarak doğru.
3. `useGpuSafeMode` her kullanımda ayrı media/resize listener ekliyor.
4. Inter fontu yükleniyor ancak uygulama CSS'inde açık kullanım bulunamadı.
5. Kullanılmayan bağımlılık adayları: `date-fns`, `react-icons`, `@tailwindcss/typography`; kaldırılmadan önce import graph doğrulanmalı.

## İlk render çağrı tahmini

### Ana sayfa, full misafir

- auth/me
- online count
- chat announcements
- announcements
- normal listings
- featured listings
- listing cities
- banners
- iki Socket.IO handshake

### İlan listesi

- normal listings
- featured listings
- listing cities
- ortak layout/auth çağrıları
- kullanıcı varsa favorites/unread

### İlan detayı

- listing detail
- ortak layout/auth/online çağrıları
- kullanıcı varsa like/favorite, unread ve şirket overlay sorguları

## DB ve API değerlendirmesi

- `recommended` sıralama için 500'e kadar, newest/oldest için 800'e kadar satır belleğe alınıyor.
- Her liste isteğinde count sorgusu var.
- Overlay iki sorguya kadar çıkıyor fakat N+1 yerine batch; yine de gereksiz kolon taşıyor.
- Hidden city terimleri request içinde ek sorgular oluşturabiliyor.
- Detail endpoint listing + like + favorite + author + company sorgu aşamalarına ayrılıyor.
- Mevcut indexler feed'in `status`, `is_active`, `merged_into_listing_id` ve tarih sıralamasını kapsamıyor.

## Uygulanacak düşük riskli değişiklikler

1. Haber görsellerine AVIF/WebP responsive türevleri, lazy/async ve dimensions.
2. Hero görseline preload, AVIF/WebP source, eager/high priority ve dimensions.
3. PDF manual chunk kuralını kaldırıp yalnız CV tıklamasında dinamik yükleme.
4. Ana sayfa polling'ini seyrekleştirip hidden sekmede durdurma.
5. İlan aramasına debounce.
6. Mobil kart veya masaüstü tablodan yalnız aktif olanı render etme.
7. Newest/oldest sorgularını DB `ORDER BY + LIMIT/OFFSET` ile sayfalama.
8. Liste description/requirements alanlarını güvenli özet uzunluğuyla sınırlama ve ağır kolonları projection dışı bırakma.
9. Featured çağrılarda count sorgusunu opsiyonel kapatma.
10. Like/favorite sorgularını dönen ilan ID'leriyle sınırlama.
11. Şirket overlay projection'ını gerekli kolonlarla sınırlama.
12. Hash'li assetlerde immutable cache, HTML'de no-store.
13. Gzip compression middleware.
14. Güvenli DB index migration dosyası.
15. Pool idle timeout ve bağlantı ömrü ayarları.

## Korunacaklar

- SEO title, canonical, robots, H1 ve JSON-LD.
- Route adresleri ve sayfa içerikleri.
- Tasarım ve CSS görünümü.
- Veritabanı kolonları ve mevcut veriler.
- Telegram, WhatsApp ve Eleman.net iş mantığı.
- Admin tasarımı.
- Production deployment.

