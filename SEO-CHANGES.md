# SEO Değişiklikleri

Tarih: 15 Temmuz 2026

## Uygulanan değişiklikler

### Sitemap

- `/sitemap.xml` dinamik sitemap index oldu.
- Şu alt sitemapler eklendi:
  - `/sitemap-pages.xml`
  - `/sitemap-cities.xml`
  - `/sitemap-districts.xml`
  - `/sitemap-categories.xml`
  - `/sitemap-companies.xml`
  - `/sitemap-blog.xml`
  - `/sitemap-jobs-N.xml`
- Job sitemap başına limit 5.000 URL olarak uygulandı.
- İlan sitemap filtresine aktiflik, yayın görünürlüğü, expiry, demo ve merge kontrolleri eklendi.
- İlan `lastmod` değeri gerçek `updatedAt`/`publishedAt`, blog `lastmod` değeri gerçek `publishedAt` üzerinden üretiliyor.
- Gerçek tarih bulunmayan statik sayfalarda sahte/güncel zamanlı `lastmod` kaldırıldı.
- XML 1.0 kontrol karakteri temizliği ve entity escaping uygulandı.
- Admin, giriş, kullanıcı ve özel sayfalar pages sitemap'ten çıkarıldı.

### Robots, canonical ve yönlendirmeler

- robots.txt içindeki `Disallow: /ilanlar?` kaldırıldı.
- robots.txt yalnız ana sitemap indexini bildiriyor.
- Parametreli `/ilanlar?...` URL'leri `noindex, follow` ve `/ilanlar` canonical alıyor.
- Indexlenebilir sayfalarda yalnız `https://ozelguvenlik.online` self-canonical kullanılıyor.
- HTTP, www ve Türkçe/Punycode alan adları path/query korunarak ana HTTPS domaine 301 yönleniyor.
- Eski uzun şehir URL yönlendirmesinde query string korunuyor.

### Metadata ve H1

- Ana sayfa title:
  - `Özel Güvenlik İş İlanları | Özel Güvenlik Online`
- Ana sayfa description:
  - `Türkiye genelindeki güncel özel güvenlik iş ilanlarını inceleyin. Silahlı, silahsız, bay ve bayan güvenlik görevlisi ilanlarına ücretsiz ulaşın.`
- Ana sayfa tek H1:
  - `Türkiye Geneli Güncel Özel Güvenlik İş İlanları`
- Keywords meta üretimi kaldırıldı.
- Şehir, kategori, firma, blog ve ilan sayfalarının dinamik title/description/canonical yapısı korundu ve server/client uyumu geliştirildi.
- Server OG görseli mevcut `/og-brand.jpg` varlığına yönlendirildi.
- Sayfa bazlı OG ve Twitter title/description/image üretimi ortaklaştırıldı.

### JSON-LD

- Ana sayfada WebSite ve Organization korundu.
- Şehir, kategori, firma, blog ve ilan detaylarına server kaynaklı BreadcrumbList eklendi/korundu.
- JobPosting yalnız ilan detayında üretiliyor.
- JobPosting içinden şu varsayımsal değerler kaldırıldı:
  - Sahte maaş aralığı
  - Otomatik 30 günlük `validThrough`
  - Koşulsuz `FULL_TIME`
  - Koşulsuz `directApply`
  - “Belirtilmemiş” firma
  - “Türkiye” varsayılan konum
  - İşvereni site ana domainine bağlayan sahte `sameAs`
- `datePosted`, `validThrough`, `employmentType`, firma, konum ve maaş yalnız gerçek kayıttan üretiliyor.

### HTTP durumları

- Bilinmeyen frontend route'ları gerçek HTTP 404 döndürüyor.
- Geçersiz blog slug'ları 404 kabul ediliyor.
- Bulunmayan, pasif, süresi geçmiş veya indexlenebilir olmayan ilanlar HTML belgesinde 404 döndürüyor.
- 404 sayfaları `noindex, follow` alıyor ve canonical kaldırılıyor.
- Giriş, profil, admin, moderator ve diğer özel sayfalar server kaynağında `noindex, follow` alıyor.

## Değiştirilen/oluşturulan dosyalar

- `SEO-AUDIT.md`
- `SEO-CHANGES.md`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/seo-render.ts`
- `artifacts/api-server/src/lib/seo-sitemap.ts`
- `artifacts/api-server/src/lib/seo-listing-policy.ts`
- `artifacts/ozel-guvenlik/index.html`
- `artifacts/ozel-guvenlik/public/robots.txt`
- `artifacts/ozel-guvenlik/src/hooks/use-document-meta.tsx`
- `artifacts/ozel-guvenlik/src/lib/seo-config.ts`
- `artifacts/ozel-guvenlik/src/pages/home.tsx`
- `artifacts/ozel-guvenlik/src/pages/listing-detail.tsx`
- `artifacts/ozel-guvenlik/src/pages/not-found.tsx`
- `artifacts/ozel-guvenlik/src/pages/seo-pages.tsx`

## Test sonuçları

- `npm run build`: Başarılı.
  - API ve frontend production build tamamlandı.
  - Vite UI sourcemap uyarıları devam ediyor; build'i durdurmadı ve SEO değişikliği kaynaklı değil.
- API typecheck: Başarılı.
- Frontend typecheck: Başarılı.
- Mevcut testler: 7/7 başarılı.
- Ana sayfa HTML kaynak kontrolü: Başarılı; kesin title/description ve tek H1 doğrulandı.
- Şehir HTML kaynak kontrolü: Başarılı; Ankara metadata ve BreadcrumbList doğrulandı.
- robots.txt kontrolü: Başarılı.
- Sitemap index/alt sitemap yapısı: Başarılı.
- Sitemap URL adetleri: 81 il, 9 ilçe/bölge, 7 kategori, 8 firma ve 6 blog URL'si doğrulandı.
- XML escaping: Başarılı.
- Filtre noindex/canonical ve 404 metadata politikası: Başarılı.
- JobPosting yapısal veri kontrolü: Başarılı; bilinmeyen maaş, expiry ve directApply üretilmedi.
- Yerel HTTP kontrolleri: Ana sayfa 200, şehir 200, alt sitemapler 200, robots 200 ve bilinmeyen URL 404 doğrulandı.
- 301 kontrolleri: HTTP, www ve Punycode yönlendirmelerinde path/query korundu.
- `npm run lint`: Çalıştırılamadı; projede `lint` script'i tanımlı değil.

## Henüz yapılamayanlar

- Gerçek production veritabanı bağlantısı olmadığı için gerçek bir ilan ID'sinin server HTML kaynağı ve gerçek job sitemap satırları lokal ortamda DB verisiyle doğrulanamadı.
- Google Rich Results web aracına production URL gönderilmedi; production deploy kullanıcı talebi gereği yapılmadı. JobPosting yapısı lokal olarak doğrulandı.
- `/sitemap_index.xml` eklenmedi; istenen ana index adresi `/sitemap.xml` olarak uygulandı.

## Riskler

- Gerçek veride zorunlu JobPosting alanlarından biri boşsa alan uydurulmaz; Google Rich Results eksik alan uyarısı verebilir.
- Job sitemap sorgusunda DB geçici olarak erişilemezse endpoint geçerli fakat boş XML ile 200 döner ve `X-Sitemap-Degraded: 1` başlığı eklenir.
- SEO URL tanımları server ve frontend tarafında ayrı sabit listelerde tutulmaya devam ediyor; ileride birlikte güncellenmelidir.
- İlan indexlenebilirlik filtresi mevcut 15 günlük görünürlük kuralını izler; ürün görünürlük süresi değişirse SEO filtresi de güncellenmelidir.

## Kapsam koruması

- CSS, görsel tasarım ve sayfa düzeni değiştirilmedi.
- Route adresleri kaldırılmadı veya değiştirilmedi.
- Veritabanı tablosu/şeması değiştirilmedi.
- Telegram, WhatsApp ve Eleman.net kodlarına dokunulmadı.
- Admin paneli değiştirilmedi.
- Production deploy yapılmadı.

