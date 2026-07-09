export interface SeoKeywordPage {
  slug: string;
  title: string;
  h1: string;
  description: string;
  searchQuery: string;
}

export const SEO_KEYWORD_PAGES: SeoKeywordPage[] = [
  {
    slug: "silahli-guvenlik-is-ilanlari",
    title: "Silahlı Güvenlik İş İlanları | Güncel Personel Alımları",
    h1: "Silahlı Güvenlik İş İlanları",
    description: "Silahlı özel güvenlik iş ilanları ve güncel personel alımları. Kimlikli silahlı güvenlik görevlisi pozisyonlarına bay ve bayan adaylar için ücretsiz başvuru.",
    searchQuery: "silahlı",
  },
  {
    slug: "silahsiz-guvenlik-is-ilanlari",
    title: "Silahsız Güvenlik İş İlanları | Güncel Personel Alımları",
    h1: "Silahsız Güvenlik İş İlanları",
    description: "Silahsız özel güvenlik iş ilanları. AVM, site, fabrika ve plaza güvenliği silahsız görevlisi alımları. Güncel maaşlı ilanlar.",
    searchQuery: "silahsız",
  },
  {
    slug: "avm-guvenlik-is-ilanlari",
    title: "AVM Güvenlik İş İlanları | Özel Güvenlik Personeli",
    h1: "AVM Güvenlik İş İlanları",
    description: "AVM ve alışveriş merkezi güvenlik iş ilanları. Silahlı ve silahsız AVM güvenlik görevlisi bay bayan personel alımları.",
    searchQuery: "avm",
  },
  {
    slug: "fabrika-guvenlik-is-ilanlari",
    title: "Fabrika Güvenlik İş İlanları | OSB Personel Alımları",
    h1: "Fabrika Güvenlik İş İlanları",
    description: "Fabrika, OSB ve sanayi bölgesi güvenlik iş ilanları. Lojistik, üretim ve depo güvenliği personel alımları.",
    searchQuery: "fabrika",
  },
  {
    slug: "site-guvenlik-is-ilanlari",
    title: "Site Güvenlik İş İlanları | Konut ve Rezidans",
    h1: "Site Güvenlik İş İlanları",
    description: "Site, rezidans ve konut güvenliği iş ilanları. Silahlı ve silahsız site güvenlik görevlisi alımları.",
    searchQuery: "site",
  },
  {
    slug: "bay-guvenlik-is-ilanlari",
    title: "Bay Güvenlik İş İlanları | Erkek Personel Alımları",
    h1: "Bay Güvenlik İş İlanları",
    description: "Bay (erkek) özel güvenlik iş ilanları. Silahlı ve silahsız erkek güvenlik görevlisi pozisyonlarına güncel başvuru.",
    searchQuery: "bay",
  },
  {
    slug: "bayan-guvenlik-is-ilanlari",
    title: "Bayan Güvenlik İş İlanları | Kadın Personel Alımları",
    h1: "Bayan Güvenlik İş İlanları",
    description: "Bayan (kadın) özel güvenlik iş ilanları. Silahlı ve silahsız kadın güvenlik görevlisi alımları.",
    searchQuery: "bayan",
  },
];

const bySlug = new Map(SEO_KEYWORD_PAGES.map(k => [k.slug, k]));

export function getSeoKeywordPage(slug: string): SeoKeywordPage | null {
  return bySlug.get(slug) ?? null;
}
