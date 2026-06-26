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

/* ── Özel SEO metinleri ───────────────────────────────────────────────── */

export interface SeoCityContent {
  title: string;
  description: string;
  keywords: string;
}

function makeCitySeo(name: string): SeoCityContent {
  const slug = toSlug(name);
  const loc = name.includes("Yakası") ? name : `${name} bölgesinde`;
  const isDistrict = SEO_DISTRICTS.includes(name);
  const prefix = isDistrict ? `${name} Özel Güvenlik` : `${name} Özel Güvenlik`;
  return {
    title: `${prefix} İş İlanları | Bay Bayan Güvenlik Personeli Alımı`,
    description: `${loc} silahlı, silahsız, AVM, fabrika, site, hastane ve plaza güvenliği bay bayan özel güvenlik görevlisi iş ilanları. Güncel maaşlı personel alımları ve ücretsiz başvuru.`,
    keywords: `${slug} ozel guvenlik is ilanlari, ${slug} guvenlik gorevlisi alimi, ${slug} bay bayan guvenlik, ${slug} silahli guvenlik, ${slug} silahsiz guvenlik`,
  };
}

const OVERRIDES: Record<string, SeoCityContent> = {
  "İstanbul": {
    title: "İstanbul Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı 2025",
    description: "İstanbul Anadolu ve Avrupa Yakası'nda silahlı, silahsız, AVM, fabrika, site, plaza, hastane ve otel güvenliği bay bayan özel güvenlik görevlisi iş ilanları. Güncel maaşlar ve anında başvuru.",
    keywords: "istanbul ozel guvenlik is ilanlari, istanbul anadolu yakasi guvenlik, istanbul avrupa yakasi guvenlik, istanbul silahli guvenlik, istanbul silahsiz guvenlik, istanbul avm guvenlik, istanbul fabrika guvenlik, istanbul site guvenlik, istanbul hastane guvenlik, istanbul ozel guvenlik maaslari"
  },
  "Ankara": {
    title: "Ankara Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
    description: "Ankara'da kamu kurumları, AVM, fabrika, site ve plaza güvenliği için bay bayan silahlı & silahsız özel güvenlik görevlisi alımları. Güncel ücretler ve tüm pozisyonlar.",
    keywords: "ankara ozel guvenlik is ilanlari, ankara guvenlik gorevlisi alimi, ankara silahli guvenlik, ankara silahsiz guvenlik, ankara avm guvenlik, ankara fabrika guvenlik"
  },
  "İzmir": {
    title: "İzmir Özel Güvenlik İş İlanları | Bay Bayan Personel Alımı",
    description: "İzmir'de AVM, fabrika, liman, site ve turizm tesisleri için bay bayan silahlı & silahsız özel güvenlik görevlisi iş ilanları. Yüksek maaşlı pozisyonlar.",
    keywords: "izmir ozel guvenlik is ilanlari, izmir guvenlik gorevlisi, izmir silahli guvenlik, izmir silahsiz guvenlik, izmir avm guvenlik, izmir fabrika guvenlik, izmir turizm guvenlik"
  },
  "Kocaeli": {
    title: "Kocaeli Özel Güvenlik İş İlanları | Gebze, İzmit, GOSB, TOSB",
    description: "Kocaeli Gebze, İzmit, Darıca, Çayırova, Dilovası, GOSB ve TOSB'de fabrika, OSB ve lojistik güvenliği için bay bayan özel güvenlik görevlisi alımları.",
    keywords: "kocaeli ozel guvenlik is ilanlari, gebze guvenlik is ilanlari, izmit guvenlik is ilanlari, gosb guvenlik ilanlari, tosb guvenlik ilanlari, kocaeli silahli guvenlik, kocaeli silahsiz guvenlik"
  },
  "Gebze": {
    title: "Gebze Özel Güvenlik İş İlanları | GOSB, TOSB, Fabrika Güvenliği",
    description: "Gebze GOSB, TOSB, Gebkim, İMES ve fabrika bölgelerinde bay bayan silahlı & silahsız özel güvenlik görevlisi alımları. Güncel maaşlı ilanlar.",
    keywords: "gebze ozel guvenlik is ilanlari, gosb guvenlik ilanlari, tosb guvenlik ilanlari, gebze fabrika guvenlik, gebze silahli guvenlik, gebze silahsiz guvenlik"
  },
  "İstanbul Anadolu Yakası": {
    title: "İstanbul Anadolu Yakası Özel Güvenlik İş İlanları",
    description: "Kadıköy, Ataşehir, Ümraniye, Üsküdar, Maltepe, Kartal, Pendik ve Tuzla'da bay bayan özel güvenlik görevlisi alımları. AVM, fabrika ve site güvenliği.",
    keywords: "istanbul anadolu yakasi ozel guvenlik, kadikoy guvenlik is ilanlari, atasehir guvenlik, umraniye guvenlik, uskudar guvenlik, maltepe guvenlik, kartal guvenlik"
  },
  "İstanbul Avrupa Yakası": {
    title: "İstanbul Avrupa Yakası Özel Güvenlik İş İlanları",
    description: "Şişli, Beşiktaş, Mecidiyeköy, Bakırköy, Beylikdüzü, Esenyurt ve Başakşehir'de bay bayan özel güvenlik görevlisi alımları. AVM, hastane ve plaza güvenliği.",
    keywords: "istanbul avrupa yakasi ozel guvenlik, sisli guvenlik is ilanlari, besiktas guvenlik, mecidiyekoy guvenlik, bakirkoy guvenlik, beylikduzu guvenlik, esenyurt guvenlik"
  },
};

export const SEO_CITY_CONTENTS: Record<string, SeoCityContent> = {};
for (const city of ALL_SEO_LOCATIONS) {
  SEO_CITY_CONTENTS[city] = OVERRIDES[city] ?? makeCitySeo(city);
}
