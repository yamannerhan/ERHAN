# Mobil ve Tablet Uyumluluk Denetimi

Tarih: 15 Temmuz 2026  
Kapsam: 320, 360, 375, 390, 412, 430, 768 ve 1024 px; iPhone Safari ve Android Chrome.

## Kritik

1. `index.html` içindeki `maximum-scale=1.0, user-scalable=no` pinch zoom'u tamamen kapatıyor.
2. iOS input zoom koruması yalnız 389 px altında çalışıyor. 390–1024 px cihazlarda 16 px altındaki login, kayıt, CV, chat ve admin inputları Safari zoom'u tetikleyebilir.
3. Admin üst barında 320–430 px aralığında menü, arama ve üç aksiyon aynı satıra zorlanıyor; arama alanı veya aksiyonlar viewport dışına taşabilir.
4. CV oluşturma formunda 11 px inputlar, 36–40 px kontroller ve iki sütunlu alanlar küçük ekranda erişilebilirlik ve zoom sorunu oluşturuyor.

## Orta

1. Global içeriklerde uzun URL/ilan/firma/konum metinleri için ortak `overflow-wrap` güvencesi eksik.
2. Modal, dropdown ve popover bileşenleri için ortak küçük viewport max-width/max-height sınırı yok.
3. Chat penceresi safe-area ve klavye yüksekliğini hesaplıyor; ancak chat inputu 12,5 px olduğu için iOS zoom riski taşıyor.
4. Chat header butonlarının görsel alanı 36 px; pseudo hit-area yaklaşık 44 px olsa da mobilde açık minimum ölçü tanımlı değil.
5. Chat sekmeleri 26 px yüksekliğinde; mobil dokunma hedefi küçük.
6. Mobil alt menü safe-area padding kullanıyor, fakat safe-area dahil toplam minimum yükseklik ve içerik alt boşluğu tek yerde garanti edilmiyor.
7. Login/kayıt kartı 320 px'te 24 px kart paddingi kullanıyor; kayıt ad/soyad iki sütunu gereksiz daralıyor.
8. CV stepper 320 px'te sınırda; kontrollü yatay kaydırma/flex küçülme güvencesi yok.
9. CV tam ekran önizleme üst barı çentik alanını doğrudan hesaba katmıyor ve aksiyonlar dar ekranda sıkışabilir.
10. Admin sidebar `100vh` ve sabit 260 px kullanıyor; iOS dinamik viewport ve 320 px dar cihaz için güvenli max-width yok.
11. Öne çıkan ilan şeridi mobilde üç kartı aynı sıraya zorlayarak kartları yaklaşık 90 px'e kadar daraltıyor.
12. Hızlı erişim dört, haberler üç sütunu 320 px'te koruduğu için metin ve dokunma alanları sıkışıyor.
13. İlan detay yan paneli 900 px'te erken açılarak 900–1023 px tablette ana içeriği gereksiz daraltıyor.
14. Chat açıkken kök `touch-action:none`, alt mesaj alanındaki `pan-y` davranışını engelleyebilir.
15. Chat FAB ile push izin bannerı aynı alt bölgede üst üste gelebilir.

## Düşük / mevcut doğru davranışlar

1. İlan listesi mobilde kart, 1024 px ve üstünde desktop tablo render ediyor; iki görünüm aynı anda render edilmiyor.
2. Desktop tablo 1024 px'te yatay scroll container ve 720 px minimum tablo ile korunuyor; zorla sıkıştırılmıyor.
3. İlan detayında `min-width:0`, `overflow-wrap:anywhere`, responsive tek/çift kolon ve image container sınırları mevcut.
4. Filtre çipleri kontrollü yatay kaydırma kullanıyor.
5. Banner 3:1 oranını, responsive image ve container sınırlarını koruyor.
6. Chat pencere genişliği `calc(100vw - ...)`, `100dvh`, safe-area ve `keyboardInset` ile sınırlandırılıyor.
7. Chat açıldığında `html/body` scroll kilidi ve kapanış cleanup'ı mevcut.
8. Chat FAB alt menünün üstünde `--chat-fab-bottom` ile konumlanıyor.
9. Alt menü 1024 px altında aktif, 1024 px ve üstünde desktop navigasyona geçiyor.

## Uygulanacak minimal düzeltmeler

- Zoom engelleyen viewport seçeneklerini kaldırmak.
- 1023 px ve altında form kontrollerini en az 16 px fontla güvencelemek.
- Küçük viewportlarda genel box sizing, image, wrapping ve modal sınırları eklemek.
- Login/kayıt kart paddingini ve kayıt isim gridini yalnız küçük ekranda uyarlamak.
- CV stepper/form/tam ekran barını küçük ekrana ve safe-area'ya uyarlamak.
- Admin topbar'a mobil satır kırma, sidebar'a `100dvh` ve güvenli max-width eklemek.
- Öne çıkan ilanları telefonda kaydırılabilir 1,2 kart, tablette 2 kart yapmak.
- Hızlı erişim/haber gridlerini dar telefonda iki kolona geçirmek.
- İlan detay iki kolon geçişini 1024 px'e taşımak.
- Chat mesaj kaydırmasını ve push/FAB katman ayrımını düzeltmek.
- Chat mobil buton/sekme hedeflerini büyütmek ve input zoom riskini kaldırmak.
- Alt menünün safe-area toplam yüksekliğini ve sayfa alt paddingini netleştirmek.

## Koruma sınırları

- 1024 px üstü masaüstü görünüm değiştirilmeyecek.
- Renk, kart görünümü ve mevcut görsel kimlik korunacak.
- SEO meta/schema, performans image/code-splitting, route/API/DB/bot kodları değiştirilmeyecek.

