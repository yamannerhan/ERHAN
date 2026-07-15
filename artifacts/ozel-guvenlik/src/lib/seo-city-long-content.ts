import { ALL_SEO_LOCATIONS, toSlug } from "./seo-cities";

/** Şehir sayfaları için kısa ve kullanıcı odaklı yardımcı metin. */
export function buildCityLongContent(city: string): string {
  return `
<h2>${city} ilanlarına başvurmadan önce</h2>
<p>İlanın konumunu, vardiyasını, kimlik kartı şartını, ücret ve yan haklarını detay sayfasından kontrol edin. Başvuru telefonu veya bağlantısı varsa doğrudan ilgili ilanda gösterilir.</p>
<p>Yayın tarihi eski olan bir ilan hâlâ aktif olabilir; geçerlilik için ilanın güncellenme ve son başvuru bilgilerine bakın.</p>
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
        name: `${city} ilanlarında çalışma koşulları nerede görülür?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: "Vardiya, ücret, yol, yemek ve kimlik kartı koşulları varsa ilgili ilan detayında gösterilir.",
        },
      },
      {
        "@type": "Question",
        name: `${city} sayfasında hangi ilanlar gösterilir?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yalnız konum bilgisi ${city} veya bu konuma bağlı doğrulanabilir bir ilçe olan aktif ilanlar gösterilir.`,
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
