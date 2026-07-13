import { ALL_SEO_LOCATIONS, toSlug } from "./seo-cities";

/** Şehir sayfaları için benzersiz, uzun SEO metni (crawler içeriği). */
export function buildCityLongContent(city: string): string {
  const slug = toSlug(city);
  const hash = slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const sectors = [
    "AVM ve alışveriş merkezi güvenliği",
    "fabrika ve OSB güvenliği",
    "site ve rezidans güvenliği",
    "plaza ve iş merkezi güvenliği",
    "hastane ve sağlık tesisi güvenliği",
    "otel ve turizm tesisi güvenliği",
    "lojistik depo ve antrepo güvenliği",
    "eğitim kampüsü ve okul güvenliği",
  ];
  const sectorA = sectors[hash % sectors.length]!;
  const sectorB = sectors[(hash + 3) % sectors.length]!;
  const vardiyalar = ["2/2 vardiya", "4/2 vardiya", "12/36 vardiya", "gündüz vardiyası", "gece vardiyası"];
  const vardiya = vardiyalar[hash % vardiyalar.length]!;

  return `
<p><strong>${city}</strong> özel güvenlik iş ilanları platformumuzda her gün güncellenmektedir. ${city} bölgesinde silahlı ve silahsız özel güvenlik görevlisi, güvenlik amiri ve güvenlik şefi pozisyonlarında bay ve bayan personel alımları yayınlanmaktadır. Özel Güvenlik Kimlik Kartı sahibi adaylar ${city} genelinde ${sectorA} ve ${sectorB} alanlarında iş fırsatlarına erişebilir.</p>

<h2>${city} Özel Güvenlik Sektörü</h2>
<p>${city} bölgesinde özel güvenlik sektörü 5188 sayılı Özel Güvenlik Hizmetlerine Dair Kanun kapsamında düzenlenmektedir. Güvenlik şirketleri ve işverenler, tesis güvenliği için sertifikalı personel aramaktadır. ${city} özel güvenlik iş ilanları arasında ${vardiya} düzeninde çalışan pozisyonlar öne çıkmaktadır. Adayların geçerli kimlik kartı, temiz sabıka kaydı ve sağlık raporu ile başvuru yapması beklenir.</p>

<h2>${city} Silahlı Güvenlik İş İlanları</h2>
<p>${city} silahlı özel güvenlik iş ilanları, kimlikli silahlı güvenlik görevlisi arayan firmalar tarafından yayınlanır. Banka, kuyumcu, değerli eşya taşıma, üst düzey kurumsal tesis ve bazı OSB girişlerinde silahlı güvenlik zorunludur. ${city} bölgesinde silahlı güvenlik maaşları tesis risk seviyesine göre belirlenir. Silahlı pozisyonlara başvurmadan önce silahlı özel güvenlik kimlik kartınızın geçerli olduğundan emin olun.</p>

<h2>${city} Silahsız Güvenlik İş İlanları</h2>
<p>${city} silahsız özel güvenlik iş ilanları AVM, site, fabrika, hastane ve plaza güvenliğinde en yaygın pozisyon tipidir. Silahsız güvenlik görevlileri giriş-çıkış kontrolü, devriye, kamera izleme ve ziyaretçi karşılama gibi görevleri üstlenir. ${city} bölgesinde silahsız pozisyonlarda genellikle yemek, servis ve SGK imkânları sunulur. Bay ve bayan adaylar eşit şekilde değerlendirilir.</p>

<h2>${city} Bay Bayan Personel Alımları</h2>
<p>${city} özel güvenlik iş ilanlarında bay ve bayan güvenlik görevlisi alımları ayrı ayrı veya karma pozisyonlar halinde yayınlanır. Kadın güvenlik personeline AVM, hastane ve site güvenliğinde yoğun talep vardır. Erkek adaylar için askerlik durumu ve silahlı kimlik şartları önemlidir. ${city} bölgesindeki ilanları filtreleyerek size uygun pozisyonu seçebilirsiniz.</p>

<h2>${city} Özel Güvenlik Maaşları ve Yan Haklar</h2>
<p>${city} özel güvenlik maaşları pozisyon tipine, deneyime ve vardiya düzenine göre değişir. Silahsız pozisyonlarda asgari ücret üzeri paketler; silahlı pozisyonlarda daha yüksek ücretler görülür. Yemek kartı, servis, yol, prim ve fazla mesai ücretleri toplam paketi etkiler. ${city} özel güvenlik iş ilanlarında maaş bilgisi belirtilmiş ilanları karşılaştırarak başvuru yapın.</p>

<h2>${city} Bölgesinde İş Arama İpuçları</h2>
<p>${city} bölgesinde özel güvenlik işi ararken ilanları günlük kontrol edin; yeni ilanlar hızla dolmaktadır. Telefon numarası ve iletişim bilgilerini doğrulayın. Birden fazla ilana başvurarak süreci hızlandırın. Ücretsiz CV oluşturma aracı ile başvurularınızı profesyonelleştirin. ${city} özel güvenlik iş ilanları sayfamızdan tüm aktif ilanlara tek tıkla ulaşabilirsiniz.</p>

<h2>${city} İçin Sık Sorulan Sorular</h2>
<p><strong>${city} özel güvenlik iş ilanlarına kimler başvurabilir?</strong> 18 yaşını doldurmuş, en az ilkokul mezunu, geçerli özel güvenlik kimlik kartına sahip ve sabıka kaydı temiz adaylar başvurabilir.</p>
<p><strong>${city} bölgesinde hangi sektörlerde güvenlik personeli aranıyor?</strong> ${sectorA}, ${sectorB} ve kurumsal tesis güvenliği en yoğun alanlardır.</p>
<p><strong>${city} özel güvenlik ilanları ücretsiz mi?</strong> Evet, platformumuzda ilan görüntüleme ve başvuru tamamen ücretsizdir.</p>
`;
}

export function buildCityFaqSchema(city: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `${city} özel güvenlik iş ilanlarına nasıl başvurulur?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${city} bölgesindeki ilanları filtreleyerek telefon veya iletişim bilgisi üzerinden doğrudan firmaya başvurabilirsiniz.`,
        },
      },
      {
        "@type": "Question",
        name: `${city} silahlı güvenlik maaşları ne kadar?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${city} bölgesinde silahlı güvenlik maaşları tesis tipine göre değişmekle birlikte genellikle silahsız pozisyonlardan yüksektir.`,
        },
      },
      {
        "@type": "Question",
        name: `${city} özel güvenlik iş ilanları güncel mi?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Evet, ${city} özel güvenlik iş ilanları Telegram grupları ve kaynaklardan düzenli taranarak güncellenir.`,
        },
      },
    ],
  };
}

export function buildCityInternalLinks(city: string, limit = 20): string {
  const others = ALL_SEO_LOCATIONS.filter(c => c !== city).slice(0, limit);
  return others
    .map(c => `<a href="https://ozelguvenlik.online/${toSlug(c)}">${c} Özel Güvenlik İş İlanları</a>`)
    .join(" · ");
}
