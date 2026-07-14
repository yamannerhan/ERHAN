/** İstanbul Anadolu / Avrupa yakası ilçe listeleri ve eşleştirme. */

export type IstanbulSide = "anadolu" | "avrupa";

/** Anadolu Yakası ilçeleri */
export const ISTANBUL_ANADOLU_DISTRICTS = [
  "Adalar",
  "Ataşehir",
  "Beykoz",
  "Çekmeköy",
  "Kadıköy",
  "Kartal",
  "Maltepe",
  "Pendik",
  "Sancaktepe",
  "Sultanbeyli",
  "Şile",
  "Tuzla",
  "Ümraniye",
  "Üsküdar",
] as const;

/** Avrupa Yakası ilçeleri */
export const ISTANBUL_AVRUPA_DISTRICTS = [
  "Arnavutköy",
  "Avcılar",
  "Bağcılar",
  "Bahçelievler",
  "Bakırköy",
  "Başakşehir",
  "Bayrampaşa",
  "Beşiktaş",
  "Beylikdüzü",
  "Beyoğlu",
  "Büyükçekmece",
  "Çatalca",
  "Esenler",
  "Esenyurt",
  "Eyüpsultan",
  "Eyüp",
  "Fatih",
  "Gaziosmanpaşa",
  "Güngören",
  "Kağıthane",
  "Küçükçekmece",
  "Sarıyer",
  "Silivri",
  "Sultangazi",
  "Şişli",
  "Zeytinburnu",
] as const;

/** Semt / OSB kısayolları → yaka */
const SIDE_LANDMARKS: Array<{ side: IstanbulSide; terms: string[] }> = [
  {
    side: "anadolu",
    terms: [
      "dudullu", "kozyatagi", "kozyatağı", "bostanci", "bostancı", "fikirtepe",
      "haydarpasa", "haydarpaşa", "moda", "acibadem", "acıbadem",
      "idosb", "deri osb", "anadolu yakasi osb", "anadolu yakası osb",
      "samandira", "samandıra", "alemdag", "alemdağ", "tasdelen", "taşdelen",
      "pasakoy", "paşaköy", "ferhatpasa", "ferhatpaşa", "camlica", "çamlıca",
      "viaport", "kurtkoy", "kurtköy", "sabiha gokcen", "sabiha gökçen",
    ],
  },
  {
    side: "avrupa",
    terms: [
      "ikitelli", "mecidiyekoy", "mecidiyeköy", "levent", "maslak", "florya",
      "yesilkoy", "yeşilköy", "kirac", "kıraç", "hadimkoy", "hadımköy",
      "bahcesehir", "bahçeşehir", "birlik osb", "beylikduzu osb", "beylikdüzü osb",
      "habibler", "kuzey marmara", "istanbul havalimani", "istanbul havalimanı",
    ],
  },
];

export function normalizeIstanbulText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function districtNeedles(districts: readonly string[]): string[] {
  return districts
    .map((d) => normalizeIstanbulText(d))
    .sort((a, b) => b.length - a.length);
}

const ANADOLU_NEEDLES = districtNeedles(ISTANBUL_ANADOLU_DISTRICTS);
const AVRUPA_NEEDLES = districtNeedles(ISTANBUL_AVRUPA_DISTRICTS);

const SIDE_QUERY_ALIASES: Record<IstanbulSide, string[]> = {
  anadolu: [
    "istanbul anadolu yakasi",
    "anadolu yakasi",
    "istanbul / anadolu yakasi",
    "istanbul/anadolu yakasi",
  ],
  avrupa: [
    "istanbul avrupa yakasi",
    "avrupa yakasi",
    "istanbul / avrupa yakasi",
    "istanbul/avrupa yakasi",
  ],
};

/** SEO / filtre etiketinden yaka çıkarır */
export function resolveIstanbulSideFromLabel(cityOrLabel?: string | null): IstanbulSide | null {
  if (!cityOrLabel?.trim()) return null;
  const n = normalizeIstanbulText(cityOrLabel);
  for (const alias of SIDE_QUERY_ALIASES.anadolu) {
    if (n === alias || n.includes(alias)) return "anadolu";
  }
  for (const alias of SIDE_QUERY_ALIASES.avrupa) {
    if (n === alias || n.includes(alias)) return "avrupa";
  }
  if (/\banadolu\b/.test(n) && /yaka/.test(n)) return "anadolu";
  if (/\bavrupa\b/.test(n) && /yaka/.test(n)) return "avrupa";
  return null;
}

function haystackHasNeedle(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  const compactHay = hay.replace(/\s+/g, "");
  const compactNeedle = needle.replace(/\s+/g, "");
  return compactNeedle.length >= 4 && compactHay.includes(compactNeedle);
}

/** İlan city alanının hangi yakaya ait olduğunu bulur */
export function detectIstanbulSide(cityText?: string | null): IstanbulSide | null {
  if (!cityText?.trim()) return null;
  const hay = normalizeIstanbulText(cityText);

  if (/\banadolu\b/.test(hay) || hay.includes("anadolu yakasi")) return "anadolu";
  if (/\bavrupa\b/.test(hay) || hay.includes("avrupa yakasi")) return "avrupa";

  for (const group of SIDE_LANDMARKS) {
    for (const term of group.terms) {
      if (haystackHasNeedle(hay, normalizeIstanbulText(term))) return group.side;
    }
  }

  for (const needle of ANADOLU_NEEDLES) {
    if (haystackHasNeedle(hay, needle)) return "anadolu";
  }
  for (const needle of AVRUPA_NEEDLES) {
    if (haystackHasNeedle(hay, needle)) return "avrupa";
  }

  return null;
}

export function matchesIstanbulSide(cityText: string | null | undefined, side: IstanbulSide): boolean {
  return detectIstanbulSide(cityText) === side;
}

export function isIstanbulSideLabel(cityOrLabel?: string | null): boolean {
  return resolveIstanbulSideFromLabel(cityOrLabel) != null;
}

/** API city query için: yaka seçiliyse genelde İstanbul çekilir */
export function istanbulApiCityForSide(side: IstanbulSide | null): string | undefined {
  return side ? "İstanbul" : undefined;
}

export function districtsForSide(side: IstanbulSide): readonly string[] {
  return side === "anadolu" ? ISTANBUL_ANADOLU_DISTRICTS : ISTANBUL_AVRUPA_DISTRICTS;
}
