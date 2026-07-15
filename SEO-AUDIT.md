# SEO Denetimi

Tarih: 15 Temmuz 2026  
Ana domain: `https://ozelguvenlik.online`

## Kapsam

Route yapısı, HTTP durumları, sitemap/robots, title, description, canonical, Open Graph, Twitter Card, H1 ve JSON-LD incelendi. Tasarım, CSS, veritabanı şeması, admin ve bot kodları kapsam dışı bırakıldı.

## Yönetici özeti

Uygulama React SPA'dır; Express derlenmiş HTML'e metadata ve JSON-LD enjekte eder. Mevcut yapı temel SEO etiketleri üretse de sitemap mimarisi, soft-404, filtre URL politikası ve JobPosting veri doğruluğu kritik eksikler içerir.

## Kritik bulgular

1. **Soft-404:** Bilinmeyen frontend yolları, bulunmayan/pasif ilanlar ve geçersiz blog URL'leri HTTP 200 HTML dönebiliyor. 404 bileşeni de istemcide `index, follow` üretiyor.
2. **Sitemap mimarisi:** `/sitemap.xml` tek `<urlset>`; sitemap index, alt sitemapler ve 5.000 ilanlık job bölümlendirmesi yok.
3. **İlan indexlenebilirlik filtresi:** Sitemap yalnız `status=active` ve `isActive=true` kontrol ediyor; expiry, demo ve merge durumu eksik.
4. **Yanlış lastmod:** Statik URL'lerde tarih yoksa her istekte `new Date()` kullanılıyor. İçerik değişmese de lastmod değişiyor.
5. **Gerçek dışı JobPosting:** Bilinmeyen maaşa 25.000–55.000 TL, bilinmeyen bitiş tarihine 30 gün, server tarafında sabit `FULL_TIME`, varsayılan firma/konum ve koşulsuz `directApply` eklenebiliyor.
6. **H1:** Ana sayfa H1'i banner başlığına bağlı; varsayılan banner başlığı boş olduğunda H1 yok.
7. **HTML gövde enjeksiyonu:** Enjeksiyon regex'i gerçek `index.html` yapısıyla eşleşmiyor; kaynak HTML'deki SEO H1/içerik eklenmeyebilir.

## Orta bulgular

1. `/ilanlar?...` robots.txt ile engellenirken istemci `index, follow` üretir. Canonical/noindex politikası çelişkilidir.
2. Server ve istemci title, description, OG image ve schema çıktıları farklılaşabiliyor.
3. `keywords` meta etiketi index.html, ana sayfa ve şehir sayfalarında kullanılıyor.
4. HTTP ana domain için HTTPS yönlendirmesi `X-Forwarded-Proto` üzerinden garanti değil.
5. `/ilan-ekle`, `/cv-olustur`, `/part-time`, `/destek` gibi özel/self-canonical olmayan sayfalar sitemap'e ekleniyor.
6. Server `/og-image.jpg` kullanıyor; mevcut public dosya `/og-brand.jpg`.
7. Blog, kategori ve firma Breadcrumb JSON-LD server kaynağında eksik.

## Düşük bulgular

1. Ana sayfa canonical slash biçimi server ve istemcide farklı.
2. Şehir, kategori, firma ve blog URL listeleri server/frontend tarafında tekrarlanıyor.
3. XML escaping temel karakterlerde doğru; XML 1.0 kontrol karakterleri temizlenmiyor.

## Route envanteri

### Indexlenebilir

- `/`
- `/ilanlar`
- `/ilan/:id`
- `/blog` ve tanımlı `/blog/:postSlug`
- 81 kısa il URL'si
- 9 ilçe/bölge URL'si
- 7 kategori URL'si
- 8 firma URL'si

### Sitemap dışında/noindex

- `/giris`, `/kayit`, `/profil/:username`
- `/ilan-ekle`, `/firma-basvurusu`
- `/bildirimler`, `/favoriler`, `/cv-olustur`
- `/admin`, `/moderator` ve alt yolları
- `/sohbet`, `/destek`, `/yakindaki-ilanlar`
- Parametreli arama/filtre URL'leri

## Sayfa bazlı durum

- **Ana sayfa:** WebSite ve Organization var; istenen kesin title/description/H1 yok.
- **İlan listesi:** Canonical var; query noindex politikası yok.
- **İlan detayı:** JobPosting ve Breadcrumb var; varsayımsal alanlar ve soft-404 riski mevcut.
- **Şehir/ilçe:** Dinamik metadata var; keywords üretiliyor, server/client çıktısı farklı.
- **Kategori/firma:** Dinamik metadata var; server Breadcrumb eksik.
- **Blog:** Tanımlı yazılar mevcut; geçersiz slug server tarafında generic 200 alabiliyor.
- **404:** Üretim build'inde gerçek HTTP 404 garanti değil.

## Domain kontrolü

Canonical, sitemap ve schema kaynaklarında localhost, Railway public domaini veya eski production domaini bulunmadı. Punycode karşılığı `xn--zelgvenlik-dcb0f.online` doğrudur.

## Uygulama sırası

1. HTTP 404/noindex ve domain yönlendirmeleri.
2. Kesin ana sayfa metadata/H1 ve keywords kaldırma.
3. Gerçek veriye dayalı JobPosting.
4. Sitemap index, alt sitemapler ve 5.000'lik job bölme.
5. Robots ve query canonical/noindex politikası.
6. Build, typecheck, test, HTML/XML/HTTP kaynak kontrolleri.

# SEO Denetimi

Tarih: 15 Temmuz 2026  
Ana alan adı: `https://ozelguvenlik.online`  
Kapsam: Route yapısı, HTTP durumları, sitemap, robots, metadata, canonical, sosyal meta ve yapılandırılmış veri.

## Yönetici özeti

Uygulama Vite/React SPA'dır. Express, derlenmiş HTML üzerinde title/meta/JSON-LD değiştirerek sınırlı bir ön-render katmanı sağlar; gerçek React SSR yoktur. Mevcut SEO altyapısı temel canonical ve metadata üretse de sitemap mimarisi, 404 durumları, filtre URL politikası ve `JobPosting` veri doğruluğu istenen seviyede değildir.

En yüksek öncelikli sorunlar:

1. Bilinmeyen sayfalar, bulunmayan ilanlar ve geçersiz blog URL'leri HTTP 200 dönebildiği için soft-404 oluşuyor.
2. `/sitemap.xml` sitemap index değil; alt sitemapler ve 5.000 ilanlık bölümlendirme yok.
3. Sitemap'teki ilan filtresi, yayındaki/indexlenebilir ilan tanımıyla aynı değil.
4. Statik sitemap URL'lerinin `lastmod` değeri içerik değişmese bile her istekte yenileniyor.
5. `JobPosting` içinde bilinmeyen maaş, bitiş tarihi, çalışma tipi, firma ve konum için varsayımsal değerler üretilebiliyor.
6. Filtre URL'leri robots.txt ile engellenirken sayfa tarafı `index, follow` üretiyor; canonical/noindex politikası çelişkili.
7. Ana sayfada istenen sabit H1 garanti değil; mevcut H1 banner başlığına bağlı.

SEO metadata, canonical, sitemap ve schema kaynaklarında `localhost`, Railway public domaini veya eski production domaini bulunmadı.

## Route envanteri

### Indexlenebilir sayfa aileleri

- `/`
- `/ilanlar`
- `/ilan/:id`
- `/blog`
- `/blog/:postSlug`
- 81 kısa il URL'si: `/ankara`, `/istanbul` vb.
- 9 konum/ilçe/bölge URL'si: `/gebze`, `/darica`, `/cayirova`, `/dilovasi`, `/izmit`, `/gosb`, `/tosb`, `/istanbul-anadolu-yakasi`, `/istanbul-avrupa-yakasi`
- 7 kategori URL'si
- 8 firma URL'si

Eski `/{konum}-ozel-guvenlik-is-ilanlari` yolları geçerli konumlarda kısa URL'ye 301 yönleniyor.

### Sitemap dışında ve noindex olması gereken sayfalar

- `/giris`, `/kayit`
- `/profil/:username`
- `/ilan-ekle`, `/firma-basvurusu`
- `/bildirimler`, `/favoriler`, `/cv-olustur`
- `/admin`
- `/moderator` ve alt yolları
- `/sohbet`, `/destek`, `/yakindaki-ilanlar`
- Arama, filtre ve sıralama parametreli `/ilanlar?...` URL'leri

## Kritik bulgular

### K1 — Frontend soft-404 yanıtları

Express catch-all, frontend build mevcutken tanınmayan tüm API dışı yolları HTTP 200 HTML olarak döndürüyor. Bulunmayan ilan, geçersiz blog yazısı ve rastgele URL'ler gerçek 404 almıyor.

İlgili dosyalar:

- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/seo-render.ts`
- `artifacts/ozel-guvenlik/src/pages/not-found.tsx`

Gerekli düzeltme: Bilinen public route'ları ayırmak; bilinmeyen route ve bulunmayan/pasif/süresi geçmiş ilanlarda HTTP 404 + `noindex, follow` döndürmek.

### K2 — Sitemap index ve alt sitemapler yok

`/sitemap.xml`, tek bir `<urlset>` üretir. İstenen `<sitemapindex>` ve aşağıdaki endpoint'ler mevcut değildir:

- `/sitemap-pages.xml`
- `/sitemap-cities.xml`
- `/sitemap-districts.xml`
- `/sitemap-categories.xml`
- `/sitemap-companies.xml`
- `/sitemap-blog.xml`
- `/sitemap-jobs-N.xml`

İlgili dosyalar:

- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/seo-sitemap.ts`

### K3 — Sitemap ilan filtresi eksik

Mevcut sorgu yalnızca `status = active` ve `isActive = true` koşullarını uygular. Süresi geçmiş, birleştirilmiş veya gerçekte yayın görünürlüğü olmayan kayıtlar sitemap'e girebilir. Job sitemap başına 5.000 URL sınırı ve deterministik sayfalama yoktur.

Gerekli düzeltme: Sitemap ve ilan detay SEO renderer'ında ortak indexlenebilir ilan koşulları kullanmak; en az `status`, `isActive`, `expiresAt`, merge ve demo durumlarını kontrol etmek.

### K4 — Yanlış `lastmod`

Statik kayıtlarda tarih bulunmadığında `new Date()` kullanıldığı için her sitemap isteği tüm statik sayfaları güncellenmiş gösterir. Blogların gerçek `publishedAt`, ilanların gerçek `updatedAt`/`publishedAt` değerleri varken bunlar tüm sayfa ailelerinde doğru kullanılmıyor.

Gerekli düzeltme: Gerçek tarih yoksa `<lastmod>` üretmemek. Bloglarda `publishedAt`, ilanlarda `updatedAt` veya `publishedAt` kullanmak.

### K5 — Gerçek dışı `JobPosting` değerleri

Mevcut server ve client schema üretimi:

- Bilinmeyen maaşa 25.000–55.000 TL ekleyebilir.
- Bitiş tarihi yoksa her istekte 30 gün sonrasını yazabilir.
- Server tarafında çalışma tipini daima `FULL_TIME` yazabilir.
- Bilinmeyen şirketi “Belirtilmemiş”, konumu “Türkiye” yapabilir.
- Her işverenin `sameAs` alanını platform ana domainine bağlayabilir.
- `directApply: true` değerini gerçek başvuru akışından bağımsız ekleyebilir.

Bu değerler görünür içerikle uyuşmayabilir ve Google iş ilanı politikası riski oluşturur.

Gerekli düzeltme: Yalnız gerçek veriyi kullanmak; bilinmeyen opsiyonel alanları tamamen çıkarmak.

### K6 — Ana sayfa H1 gereksinimi garanti değil

Ana sayfadaki görünür H1 yalnız banner `title` alanı doluysa oluşur. Varsayılan banner başlığı boş olduğu için H1 hiç oluşmayabilir. İstenen H1 metni de mevcut server metniyle aynı değildir.

Gerekli değer:

`Türkiye Geneli Güncel Özel Güvenlik İş İlanları`

Tasarımı değiştirmeden tek bir semantik H1 garanti edilmelidir.

### K7 — HTML gövde enjeksiyonu kırılgan

SEO gövde enjeksiyonu, `#root` kapanışından hemen sonra module script gelmesini bekler. Gerçek `index.html` içinde arada inline script bulunduğu için regex eşleşmez. Head metadata çalışsa bile kaynak HTML'deki SEO ana içerik eklenmeyebilir.

Ek olarak içerik `left:-99999px` ve `1x1` alan içinde saklanacak şekilde tasarlanmıştır; bu, ana içerik için kullanılmamalıdır.

## Orta bulgular

### O1 — Robots ve filtre URL politikası çelişkili

Hem dinamik hem statik robots.txt içinde `Disallow: /ilanlar?` vardır. Buna karşılık istemci metadata hook'u koşulsuz `index, follow` yazar ve WebSite SearchAction parametreli ilan URL'si üretir.

Gerekli politika:

- Robots üzerinden filtre URL'lerini körlemesine engelleme.
- Parametreli arama/filtre sayfalarında `noindex, follow`.
- Canonical'ı `https://ozelguvenlik.online/ilanlar` olarak tut.
- Parametreli URL'leri sitemap'e ekleme.

### O2 — SSR ve istemci metadata çıktıları farklı

Ana sayfa, şehir, blog, kategori, firma ve ilan detayında server ile client farklı title, description, OG image veya JSON-LD üretebilir. Sosyal botlar JavaScript çalıştırmadığı için server çıktısı esas alınır.

Özellikle server `/og-image.jpg` kullanırken public dosya `og-brand.jpg` adındadır.

### O3 — Keywords meta kullanımı sürüyor

`index.html`, ana sayfa ve şehir sayfaları keywords meta üretmektedir. Kullanıcı gereksinimine göre bu alan kaldırılmalıdır.

### O4 — HTTP→HTTPS yönlendirmesi eksik

www ve Türkçe/Punycode alan adları path/query korunarak yönlenir. Ancak ana host HTTP ile geldiğinde `X-Forwarded-Proto` kontrol edilmediği için HTTPS 301 kod düzeyinde garanti değildir.

Eski uzun şehir URL yönlendirmesi query string'i korumaz.

### O5 — Özel sayfalar sitemap'te

`/ilan-ekle`, `/cv-olustur`, `/part-time` ve `/destek` mevcut birleşik sitemap'e eklenmektedir. Bazıları kimlik doğrulama gerektirir; bazıları kendine ait server canonical üretmez.

### O6 — Blog ve SEO landing içeriklerinin görünürlüğü zayıf

Blog ana içerikleri `sr-only` içinde tutulup görünür alanda ilan listesi gösterilir. Şehir, kategori ve firma sayfalarında metadata mevcut olsa da ayrı görünür H1 garanti değildir. Bu denetimin tasarım değiştirmeme sınırı nedeniyle düzeltmeler yalnız semantik ve metadata düzeyinde yapılmalıdır.

### O7 — İlan detay istemci sosyal meta alanları eksik

İlan detay bileşeni OG alanlarının bir kısmını manuel günceller; Twitter alanları ve robots davranışı ortak hook ile tutarlı değildir. Aynı ID düzenlendiğinde effect bağımlılıkları metadata'yı her zaman yenilemeyebilir.

## Düşük bulgular

### D1 — Ana sayfa slash tutarsızlığı

Server canonical `https://ozelguvenlik.online/`, client canonical `https://ozelguvenlik.online` üretebilir. Tek biçime getirilmeli.

### D2 — SEO URL listeleri birden fazla yerde tekrar ediyor

Şehir, kategori, firma ve blog listeleri server ve frontend tarafında ayrı hardcoded kaynaklarda tutuluyor. Şu an eşleşseler de ileride sitemap-route ayrışması riski vardır.

### D3 — XML escaping temel olarak doğru

Mevcut `<loc>` escaping `& < > " '` karakterlerini işler. XML 1.0 kontrol karakterleri ayrıca temizlenmelidir. Sitemap index `<loc>` ve tüm alt sitemap değerlerinde aynı güvenli üretici kullanılmalıdır.

## Sayfa bazlı durum

### Ana sayfa

- Canonical, OG, Twitter, WebSite ve Organization mevcut.
- Title, description ve H1 istenen kesin metinlerle eşleşmiyor.
- H1 banner verisine bağlı.
- Keywords meta mevcut.

### İlan listesi

- Temel metadata ve CollectionPage mevcut.
- Query URL'lerde noindex politikası yok.
- Parametreler robots ile engelleniyor.

### İlan detayı

- Dinamik metadata, Breadcrumb ve JobPosting mevcut.
- Gerçek dışı schema varsayımları var.
- Pasif/süresi geçmiş/bulunmayan ilan belgesi 404 garantisine sahip değil.

### Şehir ve ilçe

- Dinamik metadata ve Breadcrumb mevcut.
- Keywords meta üretiliyor.
- Server/client metadata farklılaşabiliyor.

### Kategori

- Dinamik title/description/canonical mevcut.
- Breadcrumb yalnız client render'da garanti.

### Firma

- Dinamik title/description/canonical mevcut.
- Breadcrumb yalnız client render'da garanti.

### Blog

- Dinamik metadata tanımlı.
- Server bilinmeyen blog slug'ını geçerli generic blog gibi kabul edebilir.
- Blog `publishedAt` sitemap lastmod olarak kullanılmıyor.

## Uygulama planı

1. SEO metadata modeline robots ve HTTP durum politikasını ekle.
2. Ana sayfa title, description ve tek H1 değerini kesinleştir; keywords üretimini kaldır.
3. Canonical, OG, Twitter ve Breadcrumb çıktısını server/client arasında hizala.
4. `JobPosting` üretimini gerçek veriye göre koşullu hale getir.
5. Bilinmeyen route, blog ve ilanları gerçek HTTP 404 + noindex yap.
6. HTTP/www/Türkçe/Punycode 301 yönlendirmelerini path/query koruyarak tamamla.
7. `/sitemap.xml` index ve tüm alt sitemap endpoint'lerini oluştur.
8. Job sitemaplerini en fazla 5.000 aktif/indexlenebilir ilanla böl.
9. robots.txt içeriğini yalnız ana sitemap bildirimiyle sadeleştir.
10. Build, lint, test ve yerel HTTP kaynak kontrollerini çalıştır.

## Kapsam dışı bırakılanlar

- Tasarım ve CSS değişiklikleri
- Route adresi değişiklikleri
- Veritabanı şema değişiklikleri
- Admin paneli
- Telegram, WhatsApp ve Eleman.net kodları
- Performans refactoru
- Production deploy

