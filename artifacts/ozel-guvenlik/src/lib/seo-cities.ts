export const SEO_PROVINCES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın",
  "Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum",
  "Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun",
  "Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri",
  "Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin",
  "Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas",
  "Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray",
  "Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova",
  "Karabük","Kilis","Osmaniye","Düzce"
];

export const SEO_DISTRICTS = [
  "Gebze","Darıca","Çayırova","Dilovası","İzmit","GOSB","TOSB",
  "İstanbul Anadolu Yakası","İstanbul Avrupa Yakası"
];

export const ALL_SEO_LOCATIONS = [...SEO_PROVINCES, ...SEO_DISTRICTS];

export function toSlug(txt: string): string {
  return txt
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const slugToCityMap = new Map<string, string>();
for (const city of ALL_SEO_LOCATIONS) {
  slugToCityMap.set(toSlug(city), city);
}

export function slugToCity(slug: string): string | null {
  return slugToCityMap.get(slug) ?? null;
}

/** Kısa SEO yolu: /ankara, /istanbul */
export function cityPagePath(cityOrSlug: string): string {
  const asCity = slugToCityMap.has(toSlug(cityOrSlug))
    ? toSlug(cityOrSlug)
    : toSlug(cityOrSlug);
  return `/${asCity}`;
}

export function isCitySlug(slug: string): boolean {
  return slugToCityMap.has(slug);
}

export function getAllCitySlugs(): string[] {
  return ALL_SEO_LOCATIONS.map((name) => toSlug(name));
}

export function getProvinceSlugs(): string[] {
  return SEO_PROVINCES.map((name) => toSlug(name));
}

/* ── Özel SEO metinleri ───────────────────────────────────────────────── */

export interface SeoCityContent {
  title: string;
  description: string;
  keywords: string;
}

function makeCitySeo(name: string): SeoCityContent {
  const slug = toSlug(name);
  const loc = name.includes("Yakası") ? name : name;
  return {
    title: `${name} Özel Güvenlik İş İlanları | Güncel Güvenlik Personeli Alımları`,
    description: `${loc} olarak doğrulanmış güncel özel güvenlik ilanlarını, çalışma koşullarını ve başvuru bilgilerini inceleyin.`,
    keywords: `${slug} ozel guvenlik is ilanlari, ${slug} guvenlik gorevlisi`,
  };
}

const OVERRIDES: Record<string, SeoCityContent> = {
  "İstanbul": {
    title: "İstanbul Özel Güvenlik İş İlanları | Güncel Güvenlik Personeli Alımları",
    description: "İstanbul olarak doğrulanmış güncel özel güvenlik ilanlarını, çalışma koşullarını ve doğrudan başvuru bilgilerini inceleyin.",
    keywords: "istanbul ozel guvenlik is ilanlari, istanbul guvenlik gorevlisi"
  },
  "Ankara": {
    title: "Ankara Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
    description: "Ankara olarak doğrulanmış güncel güvenlik görevlisi ilanlarını ve başvuru koşullarını inceleyin.",
    keywords: "ankara ozel guvenlik is ilanlari, ankara guvenlik gorevlisi"
  },
  "İzmir": {
    title: "İzmir Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
    description: "İzmir olarak doğrulanmış güncel güvenlik görevlisi ilanlarını ve başvuru koşullarını inceleyin.",
    keywords: "izmir ozel guvenlik is ilanlari, izmir guvenlik gorevlisi"
  },
  "Kocaeli": {
    title: "Kocaeli Özel Güvenlik İş İlanları | Gebze, İzmit, GOSB, TOSB",
    description: "Kocaeli, Gebze, İzmit ve çevresinde konumu doğrulanmış güncel güvenlik ilanlarını inceleyin.",
    keywords: "kocaeli ozel guvenlik is ilanlari, kocaeli guvenlik gorevlisi"
  },
  "Gebze": {
    title: "Gebze Özel Güvenlik İş İlanları | GOSB, TOSB, Fabrika Güvenliği",
    description: "Gebze, GOSB ve TOSB konumlu güncel güvenlik görevlisi ilanlarını ve başvuru bilgilerini inceleyin.",
    keywords: "gebze ozel guvenlik is ilanlari, gebze guvenlik gorevlisi"
  },
  "İstanbul Anadolu Yakası": {
    title: "İstanbul Anadolu Yakası Özel Güvenlik İş İlanları",
    description: "İstanbul Anadolu Yakası olarak doğrulanmış güncel güvenlik ilanlarını ve başvuru bilgilerini inceleyin.",
    keywords: "istanbul anadolu yakasi ozel guvenlik is ilanlari"
  },
  "İstanbul Avrupa Yakası": {
    title: "İstanbul Avrupa Yakası Özel Güvenlik İş İlanları",
    description: "İstanbul Avrupa Yakası olarak doğrulanmış güncel güvenlik ilanlarını ve başvuru bilgilerini inceleyin.",
    keywords: "istanbul avrupa yakasi ozel guvenlik is ilanlari"
  },
};

export const SEO_CITY_CONTENTS: Record<string, SeoCityContent> = {};
for (const city of ALL_SEO_LOCATIONS) {
  SEO_CITY_CONTENTS[city] = OVERRIDES[city] ?? makeCitySeo(city);
}
