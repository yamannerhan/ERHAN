/** İstanbul Anadolu / Avrupa yakası — API city filtresi için */

export type IstanbulSide = "anadolu" | "avrupa";

export const ISTANBUL_ANADOLU_DISTRICTS = [
  "Adalar", "Ataşehir", "Beykoz", "Çekmeköy", "Kadıköy", "Kartal", "Maltepe",
  "Pendik", "Sancaktepe", "Sultanbeyli", "Şile", "Tuzla", "Ümraniye", "Üsküdar",
] as const;

export const ISTANBUL_AVRUPA_DISTRICTS = [
  "Arnavutköy", "Avcılar", "Bağcılar", "Bahçelievler", "Bakırköy", "Başakşehir",
  "Bayrampaşa", "Beşiktaş", "Beylikdüzü", "Beyoğlu", "Büyükçekmece", "Çatalca",
  "Esenler", "Esenyurt", "Eyüpsultan", "Eyüp", "Fatih", "Gaziosmanpaşa", "Güngören",
  "Kağıthane", "Küçükçekmece", "Sarıyer", "Silivri", "Sultangazi", "Şişli", "Zeytinburnu",
] as const;

const SIDE_LANDMARKS: Record<IstanbulSide, string[]> = {
  anadolu: [
    "dudullu", "kozyatağı", "bostancı", "fikirtepe", "haydarpaşa", "moda", "acıbadem",
    "idosb", "deri osb", "anadolu yakası", "samandıra", "alemdağ", "taşdelen", "paşaköy",
    "ferhatpaşa", "çamlıca", "viaport", "kurtköy", "sabiha gökçen",
  ],
  avrupa: [
    "ikitelli", "mecidiyeköy", "levent", "maslak", "florya", "yeşilköy", "kıraç",
    "hadımköy", "bahçeşehir", "birlik osb", "beylikdüzü osb", "avrupa yakası",
    "habibler", "kuzey marmara", "istanbul havalimanı",
  ],
};

function normalizeCityText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/i̇/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveIstanbulSideFromQuery(city?: string | null): IstanbulSide | null {
  if (!city?.trim()) return null;
  const n = normalizeCityText(city);
  if (
    n === "anadolu yakasi" ||
    n === "istanbul anadolu yakasi" ||
    n.includes("istanbul anadolu") ||
    (n.includes("anadolu") && n.includes("yaka"))
  ) {
    return "anadolu";
  }
  if (
    n === "avrupa yakasi" ||
    n === "istanbul avrupa yakasi" ||
    n.includes("istanbul avrupa") ||
    (n.includes("avrupa") && n.includes("yaka"))
  ) {
    return "avrupa";
  }
  return null;
}

export function districtsAndLandmarksForSide(side: IstanbulSide): string[] {
  const districts = side === "anadolu" ? ISTANBUL_ANADOLU_DISTRICTS : ISTANBUL_AVRUPA_DISTRICTS;
  return [...districts, ...SIDE_LANDMARKS[side]];
}

export function sideLiteralPatterns(side: IstanbulSide): string[] {
  return side === "anadolu"
    ? ["anadolu yakası", "anadolu yakasi", "İstanbul Anadolu", "istanbul anadolu"]
    : ["avrupa yakası", "avrupa yakasi", "İstanbul Avrupa", "istanbul avrupa"];
}
