import { REGIONAL_LOCATION_KEYWORDS } from "./location-terms";
import { districtsAndLandmarksForSide } from "./istanbul-side";

export const SEO_PROVINCES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın",
  "Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum",
  "Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun",
  "Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri",
  "Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin",
  "Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas",
  "Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray",
  "Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova",
  "Karabük","Kilis","Osmaniye","Düzce",
];

export const SEO_DISTRICTS = [
  "Gebze","Darıca","Çayırova","Dilovası","İzmit","GOSB","TOSB",
  "İstanbul Anadolu Yakası","İstanbul Avrupa Yakası",
];

export const ALL_LOCATIONS = [...SEO_PROVINCES, ...SEO_DISTRICTS];

export function toSlug(txt: string): string {
  return txt
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const slugMap = new Map<string, string>();
for (const location of ALL_LOCATIONS) slugMap.set(toSlug(location), location);

export function slugToCity(slug: string): string | null {
  return slugMap.get(slug) ?? null;
}

export function normalizeSeoLocation(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(haystack: string, term: string): boolean {
  const normalizedTerm = normalizeSeoLocation(term);
  return normalizedTerm.length > 0 && (` ${haystack} `).includes(` ${normalizedTerm} `);
}

const GENERIC_LOCATIONS = new Set([
  "turkiye", "turkiye geneli", "tum turkiye", "genel", "ulke geneli", "farketmez", "fark etmez",
]);

const provinceTerms = SEO_PROVINCES.map((province) => ({
  province,
  normalized: normalizeSeoLocation(province),
}));

function explicitProvince(location: string): string | null {
  const firstSegment = normalizeSeoLocation(location.split(/[\/,|;-]/, 1)[0] ?? "");
  return provinceTerms.find((item) => item.normalized === firstSegment)?.province ?? null;
}

function inferredProvince(location: string): string | null {
  const normalized = normalizeSeoLocation(location);
  const firstSegment = normalizeSeoLocation(location.split(/[\/,|;-]/, 1)[0] ?? "");
  if (GENERIC_LOCATIONS.has(firstSegment) || firstSegment.startsWith("turkiye geneli")) return null;
  const authoritative = explicitProvince(location);
  if (authoritative) return authoritative;

  const direct = provinceTerms.filter((item) => containsTerm(normalized, item.normalized));
  if (direct.length === 1) return direct[0]!.province;

  const inferred = new Set<string>();
  for (const [province, config] of Object.entries(REGIONAL_LOCATION_KEYWORDS)) {
    const candidates = [
      ...config.aliases,
      ...config.districts,
      ...config.terms.flatMap((item) => [item.term, item.display, item.district ?? "", item.neighborhood ?? ""]),
    ];
    if (candidates.some((candidate) => normalizeSeoLocation(candidate).length >= 4 && containsTerm(normalized, candidate))) {
      inferred.add(province);
    }
  }
  return inferred.size === 1 ? [...inferred][0]! : null;
}

/**
 * Yalnız yapılandırılmış `city` alanını değerlendirir. Başlık/açıklamadaki kelime
 * geçişleri konum kanıtı sayılmaz; "Türkiye" gibi genel kayıtlar şehir sayfasına girmez.
 */
export function listingMatchesSeoLocation(listingCity: string | null | undefined, target: string): boolean {
  const raw = String(listingCity ?? "").trim();
  const normalized = normalizeSeoLocation(raw);
  if (!normalized || GENERIC_LOCATIONS.has(normalized)) return false;

  if (target === "İstanbul Anadolu Yakası" || target === "İstanbul Avrupa Yakası") {
    if (inferredProvince(raw) !== "İstanbul") return false;
    const side = target.includes("Anadolu") ? "anadolu" : "avrupa";
    return containsTerm(normalized, target)
      || districtsAndLandmarksForSide(side).some((term) => containsTerm(normalized, term));
  }

  if (SEO_DISTRICTS.includes(target)) {
    const parent = ["Gebze", "Darıca", "Çayırova", "Dilovası", "İzmit", "GOSB", "TOSB"].includes(target)
      ? "Kocaeli"
      : null;
    return (!parent || inferredProvince(raw) === parent) && containsTerm(normalized, target);
  }

  return inferredProvince(raw) === target;
}
