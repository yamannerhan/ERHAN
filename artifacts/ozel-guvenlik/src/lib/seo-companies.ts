export interface SeoCompany {
  slug: string;
  name: string;
  searchTerms: string[];
  description: string;
}

export const SEO_COMPANIES: SeoCompany[] = [
  {
    slug: "securitas",
    name: "Securitas",
    searchTerms: ["securitas", "sekuritas"],
    description: "Securitas Türkiye özel güvenlik iş ilanları. Uluslararası güvenlik firmasında silahlı, silahsız bay bayan personel alımları ve kariyer fırsatları.",
  },
  {
    slug: "tepe-savunma",
    name: "Tepe Savunma",
    searchTerms: ["tepe savunma", "tepe savunma ve güvenlik", "tepe güvenlik"],
    description: "Tepe Savunma özel güvenlik iş ilanları. AVM, site, fabrika ve kurumsal tesislerde güvenlik görevlisi alımları.",
  },
  {
    slug: "iss",
    name: "ISS",
    searchTerms: ["iss güvenlik", "iss"],
    description: "ISS özel güvenlik iş ilanları. Tesis yönetimi ve güvenlik hizmetlerinde bay bayan personel alımları.",
  },
  {
    slug: "g4s",
    name: "G4S",
    searchTerms: ["g4s", "g4s güvenlik"],
    description: "G4S özel güvenlik iş ilanları. Silahlı ve silahsız güvenlik görevlisi pozisyonlarına güncel başvuru.",
  },
  {
    slug: "desmer",
    name: "Desmer",
    searchTerms: ["desmer", "desmer güvenlik"],
    description: "Desmer özel güvenlik iş ilanları. Kurumsal güvenlik hizmetlerinde personel alımları ve kariyer olanakları.",
  },
  {
    slug: "pronet",
    name: "Pronet",
    searchTerms: ["pronet", "pronet güvenlik"],
    description: "Pronet özel güvenlik ve alarm sistemleri iş ilanları. Saha ve teknik güvenlik pozisyonları.",
  },
  {
    slug: "koruma-grubu",
    name: "Koruma Grubu",
    searchTerms: ["koruma grubu", "koruma güvenlik"],
    description: "Koruma Grubu özel güvenlik iş ilanları. Silahlı, silahsız güvenlik personeli alımları.",
  },
  {
    slug: "prosegur",
    name: "Prosegur",
    searchTerms: ["prosegur", "prosegur güvenlik"],
    description: "Prosegur özel güvenlik iş ilanları. Nakit taşıma ve tesis güvenliği personel alımları.",
  },
];

const bySlug = new Map(SEO_COMPANIES.map(c => [c.slug, c]));

export function getSeoCompany(slug: string): SeoCompany | null {
  return bySlug.get(slug) ?? null;
}
