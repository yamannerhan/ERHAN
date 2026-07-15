# SEO Final Kontrol

Tarih: 16 Temmuz 2026  
Kapsam: Yalnız sitemap, ilan indexlenebilirliği, şehir konum doğruluğu ve şehir SEO metni.

## Yapılan düzeltmeler

### Sitemap lastmod

- `/sitemap.xml` içindeki bütün alt sitemap kayıtlarına `lastmod` eklendi.
- Request anındaki `new Date()`/`Date.now()` XML değeri olarak kullanılmıyor.
- Sitemap index lastmod değerleri ilgili alt sitemap içindeki en yeni gerçek değerden hesaplanıyor:
  - Sayfalar: statik içerik güncellemesi veya en yeni aktif ilan güncellemesi.
  - Şehir/ilçe: statik şehir metni güncellemesi veya o konuma kesin eşleşen en yeni aktif ilan.
  - Kategori: kategori içeriği veya eşleşen en yeni aktif ilan.
  - Firma: firma içeriği veya eşleşen en yeni aktif ilan.
  - Blog: gerçek içerik/publishedAt tarihleri.
  - Job sitemap sayfası: o sayfadaki en yeni ilan `updatedAt/publishedAt` değeri.
- `sitemap-pages.xml`, `sitemap-cities.xml`, `sitemap-districts.xml`, `sitemap-categories.xml`, `sitemap-companies.xml` ve `sitemap-blog.xml` içindeki bütün URL kayıtları lastmod üretiyor.
- DB erişilemediğinde kullanılan statik sitemap index fallbacki de bütün kayıtlarda lastmod içeriyor.

### İlan sitemap uygunluğu

Ortak `indexableListingCondition` şu koşulları uygular:

- `status = active`
- `isActive = true`
- demo kaynak değil
- başka ilana birleştirilmemiş (`mergedIntoListingId IS NULL`)
- süresi dolmamış veya süresiz

İlan detay SEO route'u da aynı policy'yi kullandığından sitemap kaydı:

- HTTP 200 dönen,
- self-canonical olan,
- noindex olmayan

ilanlarla aynı kaynaktan üretilir.

Önceki 15 günlük yaş sınırı kaldırıldı. Eski ID veya eski yayın tarihi tek başına ilanı sitemap dışına çıkarmaz.

### Şehir konum doğruluğu

- Eşleşme yalnız yapılandırılmış `city` alanından yapılır; ilan başlığı/açıklamasında şehir adının geçmesi konum kanıtı değildir.
- Türkçe karakter, boşluk ve noktalama normalize edilir.
- Açık il adı, bilinen ilçe, semt/OSB terimleri ve bağlı il verisi kullanılır.
- `Türkiye`, `Türkiye Geneli`, `Tüm Türkiye`, `Genel` ve benzeri genel konumlar şehir sayfalarına girmez.
- Başka il ile başlayan konumlar hedef şehirden çıkarılır.
- İstanbul Anadolu/Avrupa Yakası eşleşmesi ilgili ilçe ve bölge listelerine göre yapılır.
- Client tarafındaki ikinci, substring tabanlı şehir filtresi kaldırıldı; pagination ve sonuç doğruluğunun tek kaynağı API filtresi oldu.

### Şehir SEO metni

- Title, canonical, Breadcrumb, CollectionPage, JobPosting, Organization, WebSite ve Open Graph yapıları korunmuştur.
- Şehir açıklamaları kısaltıldı ve doğal dile çevrildi.
- “Sektör her yıl büyüyor”, “yoğun talep vardır”, varsayılan maaş üstünlüğü ve doğrulanmamış vardiya/sektör iddiaları kaldırıldı.
- Tekrarlanan “şehir + özel güvenlik + bay/bayan + silahlı/silahsız” blokları kaldırıldı.
- Gerçek ilan bağlantıları, kayıtlı konum, son ilan güncellenme tarihi, ilçe/bölge bağlantıları ve başvuru yönlendirmesi korunmuştur.

## Otomatik kontroller

### Local

- API typecheck: geçti.
- Frontend typecheck: geçti.
- Full workspace build: geçti.
- Tüm API testleri: geçti.
- SEO testleri: 6/6 geçti.
- `git diff --check`: geçti.

SEO test kapsamı:

- İstanbul açık il eşleşmesi.
- Pendik → İstanbul ilçe eşleşmesi.
- Kocaeli/Gebze → İstanbul reddi.
- Türkiye/Türkiye Geneli → İstanbul reddi.
- İstanbul/Tuzla Kimya OSB → Kocaeli yanlış eşleşme reddi.
- Şehir lastmod değerinin en yeni gerçek eşleşen ilandan alınması.
- Eski ID/tarihin aktif ilanı tek başına dışlamaması.
- Sitemap index ve statik URL kayıtlarının tamamında lastmod.
- XML escaping ve dengeli URL elementleri.

### Canlı site ön-deployment kontrolü

`https://ozelguvenlik.online` üzerinde düzeltmeler deploy edilmeden önce ölçülen mevcut durum:

- `/robots.txt`: HTTP 200, sitemap bildirimi doğru.
- `/sitemap.xml`: HTTP 200, XML geçerli, 7 alt sitemap.
- Bütün alt sitemapler: HTTP 200 ve XML geçerli.
- `sitemap-jobs-1.xml`: 1.435 URL; URL kayıtlarının lastmod değerleri mevcut.
- Rastgele 20 ilan:
  - 20/20 sayfa HTTP 200.
  - 20/20 API kaydı aktif.
  - 20/20 self-canonical.
  - 20/20 noindex değil.
- İstanbul API örneği: 50 kayıt kontrol edildi, hatalı konum 0.

Canlı sitede henüz eski sürüm bulunduğu için şu beklenen eksikler görüldü:

- Sitemap index alt kayıtlarında lastmod eksik.
- Pages, cities, districts, categories, companies ve blog URL kayıtlarında lastmod eksik.

Bu eksikler çalışma alanındaki yeni kodda giderilmiştir; canlı doğrulamanın yeşile dönmesi için değişikliklerin deploy edilmesi gerekir.

## XML doğrulaması

- Canlı sitemap index ve bütün alt sitemapler Python `xml.etree.ElementTree` ile parse edildi.
- Tümü well-formed XML olarak doğrulandı.
- Yeni XML builder için özel karakter escaping ve element denge testleri geçti.

## Tekrar çalıştırma

Deploy sonrası:

```bash
artifacts/api-server/node_modules/.bin/tsx scripts/seo-final-check.ts
```

Başka ortam:

```bash
SEO_CHECK_BASE_URL=https://staging.example.com artifacts/api-server/node_modules/.bin/tsx scripts/seo-final-check.ts
```

Script robots, sitemap index, bütün alt sitemapler, rastgele 20 ilan, aktiflik/canonical/noindex, İstanbul konumu ve XML geçerliliğini birlikte denetler; eksik varsa non-zero exit code döndürür.

## Değiştirilmeyen alanlar

- Tasarım
- Route URL yapısı
- Botlar
- Veritabanı şeması
- Admin paneli
- Performance/mobile/production altyapısı

