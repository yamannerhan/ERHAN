# Mobil ve Tablet Uyumluluk Değişiklikleri

Tarih: 15 Temmuz 2026

## Düzeltilenler

- Pinch zoom'u kapatan viewport seçenekleri kaldırıldı.
- iPhone/iPad Safari form zoom'unu önlemek için 1024 px ve altında input, select ve textarea fontları 16 px güvenliğine alındı.
- Mobil modal, dropdown, menu ve select yüzeyleri viewport/safe-area sınırlarına alındı.
- Uzun ilan başlığı, firma, maaş ve detay metinlerine güvenli wrapping eklendi.
- Header alanlarına `min-width: 0` ve yaklaşık 44 px dokunma hedefi güvencesi eklendi.
- Login/kayıt kart paddingi küçük ekranda azaltıldı; 320 px kayıt ad/soyad alanları tek kolona geçiyor.
- CV stepper kontrollü yatay kaydırmaya alındı.
- CV input ve aksiyonları mobilde yaklaşık 44 px dokunma yüksekliğine çıkarıldı.
- CV tam ekran önizleme barı çentik, safe-area ve satır kırma ile uyumlu hale getirildi.
- Chat input iOS zoom riski kaldırıldı; header butonları 44 px, sekmeler 40 px mobil hedefe çıkarıldı.
- Chat açıkken kök seviyedeki `touch-action:none` kaldırıldı; mesaj listesinde dikey dokunmatik kaydırma açıkça korundu.
- Mobil öne çıkan ilan şeridi üç okunamaz kart yerine telefonda kaydırılabilir yaklaşık 1,2 kart, tablette 2 kart gösteriyor.
- Hızlı erişim ve haber kartları dar telefonda iki sütuna geçiyor.
- İlan detayındaki yan panel 900 px yerine 1024 px'te açılıyor; tablet tek kolon kalıyor.
- Acil rozeti dar kartlarda başlığın üstünü kapatmayacak konuma taşındı.
- Alt menü içeriğine sağ/sol safe-area inset eklendi; mevcut alt safe-area ve chat FAB mesafesi korundu.
- Chat FAB sağ safe-area ile hizalandı; push izin bannerı FAB'ın üstüne taşındı.
- Admin sidebar `100dvh`, safe-area ve dar viewport max-width ile güvenli hale getirildi.
- Admin üst barı 320–767 px'te iki satıra geçiyor; arama alanı ikinci satırda tam genişlik kullanıyor.
- Admin üst bar ve sidebar dokunma hedefleri büyütüldü.
- 400 px altında admin form gridleri tek kolona geçiyor.
- Login/kayıt alanlarına mobil klavye ve autocomplete semantikleri eklendi.

## Test edilen genişlikler

- 320 px
- 360 px
- 375 px
- 390 px
- 412 px
- 430 px
- 768 px
- 1024 px

Kontrol edilen alanlar: ana sayfa, ilan listesi, ilan detay shell'i, giriş, kayıt, CV oluşturma, chat açık/kapalı, alt menü, header ve admin temel görünümü.

## Korunanlar

- 1025 px ve üstü masaüstü layoutu.
- Renkler, kart tasarımları ve görsel kimlik.
- Banner oranı ve responsive performans görselleri.
- SEO title, canonical ve schema üretimi.
- Route, API, veritabanı ve bot kodları.
- Mobildeki mevcut özellikler.

## Değiştirilen dosyalar

- `MOBILE-AUDIT.md`
- `MOBILE-CHANGES.md`
- `artifacts/ozel-guvenlik/index.html`
- `artifacts/ozel-guvenlik/src/index.css`
- `artifacts/ozel-guvenlik/src/components/mobile-bottom-nav.css`
- `artifacts/ozel-guvenlik/src/components/featured-job-card.css`
- `artifacts/ozel-guvenlik/src/components/home-ref-ui.css`
- `artifacts/ozel-guvenlik/src/components/home-news-cards.css`
- `artifacts/ozel-guvenlik/src/components/listing-detail-page.css`
- `artifacts/ozel-guvenlik/src/components/listings-page.css`
- `artifacts/ozel-guvenlik/src/components/lite-chat-fab.css`
- `artifacts/ozel-guvenlik/src/components/display-mode-toggle.css`
- `artifacts/ozel-guvenlik/src/components/push-permission-banner.tsx`
- `artifacts/ozel-guvenlik/src/components/cv-builder-page.css`
- `artifacts/ozel-guvenlik/src/pages/login.tsx`
- `artifacts/ozel-guvenlik/src/pages/register.tsx`
- `artifacts/ozel-guvenlik/src/pages/admin.tsx`

## Doğrulama

- Frontend TypeScript kontrolü: başarılı.
- Production build: başarılı.
- Mevcut testler: 7/7 başarılı.
- Zoom engelleyen `user-scalable=no` ve `maximum-scale=1` kalmadı.
- Build'deki mevcut üç UI sourcemap uyarısı devam ediyor; build'i engellemiyor.

## Bilinen sınırlar

- API verisi olmayan yerel preview'da ilan detay içeriği ve giriş gerektiren admin verileri yalnız shell/responsive görünüm seviyesinde doğrulanabilir.
- Gerçek iOS Safari ve Android Chrome donanımı yerine aynı viewport genişliklerinde Chromium emülasyonu ve CSS safe-area kaynak kontrolü kullanılır.
- Production deploy yapılmadı.

