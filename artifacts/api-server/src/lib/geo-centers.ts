/**
 * İl / ilçe merkez koordinatları (WGS84) — yakındaki ilan araması için.
 * Nokta: ilçe merkezi tercih; yoksa il merkezi.
 */

export type GeoPoint = { lat: number; lng: number; accuracy: "district" | "city" };

function n(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/i̇/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

/** 81 il merkezi */
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  adana: { lat: 37.0, lng: 35.3213 },
  adiyaman: { lat: 37.7636, lng: 38.2773 },
  afyonkarahisar: { lat: 38.7507, lng: 30.5567 },
  agri: { lat: 39.7191, lng: 43.0503 },
  amasya: { lat: 40.6499, lng: 35.8353 },
  ankara: { lat: 39.9334, lng: 32.8597 },
  antalya: { lat: 36.8969, lng: 30.7133 },
  artvin: { lat: 41.1828, lng: 41.8183 },
  aydin: { lat: 37.8444, lng: 27.8458 },
  balikesir: { lat: 39.6484, lng: 27.8826 },
  bilecik: { lat: 40.1506, lng: 29.9793 },
  bingol: { lat: 38.8855, lng: 40.4966 },
  bitlis: { lat: 38.4006, lng: 42.1095 },
  bolu: { lat: 40.735, lng: 31.6061 },
  burdur: { lat: 37.7203, lng: 30.2908 },
  bursa: { lat: 40.1885, lng: 29.061 },
  canakkale: { lat: 40.1553, lng: 26.4142 },
  cankiri: { lat: 40.6013, lng: 33.6134 },
  corum: { lat: 40.5506, lng: 34.9556 },
  denizli: { lat: 37.7765, lng: 29.0864 },
  diyarbakir: { lat: 37.9144, lng: 40.2306 },
  edirne: { lat: 41.6818, lng: 26.5623 },
  elazig: { lat: 38.681, lng: 39.2264 },
  erzincan: { lat: 39.75, lng: 39.5 },
  erzurum: { lat: 39.9043, lng: 41.2679 },
  eskisehir: { lat: 39.7767, lng: 30.5206 },
  gaziantep: { lat: 37.0662, lng: 37.3833 },
  giresun: { lat: 40.9128, lng: 38.3895 },
  gumushane: { lat: 40.4603, lng: 39.4814 },
  hakkari: { lat: 37.5744, lng: 43.7408 },
  hatay: { lat: 36.4018, lng: 36.3498 },
  isparta: { lat: 37.7648, lng: 30.5566 },
  mersin: { lat: 36.8121, lng: 34.6415 },
  istanbul: { lat: 41.0082, lng: 28.9784 },
  izmir: { lat: 38.4192, lng: 27.1287 },
  kars: { lat: 40.6013, lng: 43.0975 },
  kastamonu: { lat: 41.3887, lng: 33.7827 },
  kayseri: { lat: 38.7312, lng: 35.4787 },
  kirklareli: { lat: 41.7333, lng: 27.2167 },
  kirsehir: { lat: 39.1425, lng: 34.1709 },
  kocaeli: { lat: 40.7654, lng: 29.9408 },
  konya: { lat: 37.8746, lng: 32.4932 },
  kutahya: { lat: 39.4242, lng: 29.9833 },
  malatya: { lat: 38.3552, lng: 38.3095 },
  manisa: { lat: 38.6191, lng: 27.4289 },
  kahramanmaras: { lat: 37.5858, lng: 36.9371 },
  mardin: { lat: 37.3212, lng: 40.7245 },
  mugla: { lat: 37.2153, lng: 28.3636 },
  mus: { lat: 38.7432, lng: 41.5065 },
  nevsehir: { lat: 38.6244, lng: 34.7239 },
  nigde: { lat: 37.9667, lng: 34.6833 },
  ordu: { lat: 40.9839, lng: 37.8764 },
  rize: { lat: 41.0201, lng: 40.5234 },
  sakarya: { lat: 40.7569, lng: 30.3781 },
  samsun: { lat: 41.2867, lng: 36.33 },
  siirt: { lat: 37.9274, lng: 41.9419 },
  sinop: { lat: 42.0231, lng: 35.1531 },
  sivas: { lat: 39.7477, lng: 37.0179 },
  tekirdag: { lat: 40.9833, lng: 27.5167 },
  tokat: { lat: 40.3167, lng: 36.55 },
  trabzon: { lat: 41.0015, lng: 39.7178 },
  tunceli: { lat: 39.1079, lng: 39.5401 },
  sanliurfa: { lat: 37.1591, lng: 38.7969 },
  usak: { lat: 38.6823, lng: 29.4082 },
  van: { lat: 38.4891, lng: 43.4089 },
  yozgat: { lat: 39.8181, lng: 34.8147 },
  zonguldak: { lat: 41.4564, lng: 31.7987 },
  aksaray: { lat: 38.3687, lng: 34.037 },
  bayburt: { lat: 40.2552, lng: 40.2249 },
  karaman: { lat: 37.1759, lng: 33.2287 },
  kirikkale: { lat: 39.8468, lng: 33.5153 },
  batman: { lat: 37.8812, lng: 41.1351 },
  sirnak: { lat: 37.5164, lng: 42.4611 },
  bartin: { lat: 41.6358, lng: 32.3375 },
  ardahan: { lat: 41.1105, lng: 42.7022 },
  igdir: { lat: 39.9167, lng: 44.0333 },
  yalova: { lat: 40.655, lng: 29.2769 },
  karabuk: { lat: 41.2061, lng: 32.6204 },
  kilis: { lat: 36.7184, lng: 37.1212 },
  osmaniye: { lat: 37.0742, lng: 36.2478 },
  duzce: { lat: 40.8438, lng: 31.1565 },
};

/** İlçe / semt merkezleri — key: "il|ilce" veya sadece ilce (istanbul agirlikli) */
const DISTRICT_CENTERS: Record<string, { lat: number; lng: number; city: string }> = {
  // İstanbul Anadolu
  "istanbul|kadikoy": { lat: 40.9819, lng: 29.0578, city: "İstanbul" },
  "istanbul|uskudar": { lat: 41.0255, lng: 29.0159, city: "İstanbul" },
  "istanbul|umraniye": { lat: 41.0165, lng: 29.1244, city: "İstanbul" },
  "istanbul|atasehir": { lat: 40.9833, lng: 29.1278, city: "İstanbul" },
  "istanbul|maltepe": { lat: 40.9351, lng: 29.1398, city: "İstanbul" },
  "istanbul|kartal": { lat: 40.8885, lng: 29.1856, city: "İstanbul" },
  "istanbul|pendik": { lat: 40.8775, lng: 29.2669, city: "İstanbul" },
  "istanbul|tuzla": { lat: 40.8167, lng: 29.3, city: "İstanbul" },
  "istanbul|sancaktepe": { lat: 40.9897, lng: 29.2303, city: "İstanbul" },
  "istanbul|sultanbeyli": { lat: 40.9609, lng: 29.2674, city: "İstanbul" },
  "istanbul|cekmekoy": { lat: 41.0328, lng: 29.1897, city: "İstanbul" },
  "istanbul|beykoz": { lat: 41.1256, lng: 29.1044, city: "İstanbul" },
  "istanbul|sile": { lat: 41.1754, lng: 29.6122, city: "İstanbul" },
  "istanbul|adalar": { lat: 40.8731, lng: 29.0897, city: "İstanbul" },
  // İstanbul Avrupa
  "istanbul|besiktas": { lat: 41.0422, lng: 29.0067, city: "İstanbul" },
  "istanbul|sisli": { lat: 41.0602, lng: 28.9877, city: "İstanbul" },
  "istanbul|beyoglu": { lat: 41.0369, lng: 28.985, city: "İstanbul" },
  "istanbul|fatih": { lat: 41.0186, lng: 28.9397, city: "İstanbul" },
  "istanbul|bakirkoy": { lat: 40.9819, lng: 28.8772, city: "İstanbul" },
  "istanbul|bahcelievler": { lat: 41.002, lng: 28.8597, city: "İstanbul" },
  "istanbul|bagcilar": { lat: 41.039, lng: 28.8567, city: "İstanbul" },
  "istanbul|kucukcekmece": { lat: 41.0026, lng: 28.775, city: "İstanbul" },
  "istanbul|buyukcekmece": { lat: 41.0207, lng: 28.585, city: "İstanbul" },
  "istanbul|avcilar": { lat: 40.9792, lng: 28.7214, city: "İstanbul" },
  "istanbul|esenyurt": { lat: 41.034, lng: 28.6764, city: "İstanbul" },
  "istanbul|beylikduzu": { lat: 41.001, lng: 28.6412, city: "İstanbul" },
  "istanbul|basaksehir": { lat: 41.0931, lng: 28.802, city: "İstanbul" },
  "istanbul|kagithane": { lat: 41.083, lng: 28.978, city: "İstanbul" },
  "istanbul|sariyer": { lat: 41.1664, lng: 29.05, city: "İstanbul" },
  "istanbul|eyupsultan": { lat: 41.0792, lng: 28.9236, city: "İstanbul" },
  "istanbul|gaziosmanpasa": { lat: 41.0742, lng: 28.9097, city: "İstanbul" },
  "istanbul|sultangazi": { lat: 41.1064, lng: 28.8681, city: "İstanbul" },
  "istanbul|zeytinburnu": { lat: 40.9933, lng: 28.9033, city: "İstanbul" },
  "istanbul|guneyoren": { lat: 41.0225, lng: 28.875, city: "İstanbul" },
  "istanbul|gungoren": { lat: 41.0225, lng: 28.875, city: "İstanbul" },
  "istanbul|esenler": { lat: 41.0433, lng: 28.8764, city: "İstanbul" },
  "istanbul|bayrampasa": { lat: 41.0481, lng: 28.9006, city: "İstanbul" },
  "istanbul|arnavutkoy": { lat: 41.185, lng: 28.7406, city: "İstanbul" },
  "istanbul|catalca": { lat: 41.1431, lng: 28.4614, city: "İstanbul" },
  "istanbul|silivri": { lat: 41.0736, lng: 28.2464, city: "İstanbul" },
  // Semt kısayolları
  "istanbul|samandira": { lat: 40.9897, lng: 29.2303, city: "İstanbul" },
  "istanbul|dudullu": { lat: 41.0165, lng: 29.155, city: "İstanbul" },
  "istanbul|ikitelli": { lat: 41.078, lng: 28.79, city: "İstanbul" },
  "istanbul|kirac": { lat: 41.02, lng: 28.645, city: "İstanbul" },
  "istanbul|hadimkoy": { lat: 41.155, lng: 28.615, city: "İstanbul" },
  "istanbul|kurtkoy": { lat: 40.905, lng: 29.295, city: "İstanbul" },
  "istanbul|kozyatagi": { lat: 40.966, lng: 29.1, city: "İstanbul" },
  // Kocaeli
  "kocaeli|gebze": { lat: 40.8028, lng: 29.4307, city: "Kocaeli" },
  "kocaeli|darica": { lat: 40.767, lng: 29.385, city: "Kocaeli" },
  "kocaeli|cayirova": { lat: 40.826, lng: 29.375, city: "Kocaeli" },
  "kocaeli|dilovasi": { lat: 40.78, lng: 29.535, city: "Kocaeli" },
  "kocaeli|izmit": { lat: 40.7654, lng: 29.9408, city: "Kocaeli" },
  "kocaeli|korfez": { lat: 40.765, lng: 29.785, city: "Kocaeli" },
  "kocaeli|derince": { lat: 40.756, lng: 29.825, city: "Kocaeli" },
  "kocaeli|golcuk": { lat: 40.703, lng: 29.818, city: "Kocaeli" },
  "kocaeli|basiskele": { lat: 40.715, lng: 29.92, city: "Kocaeli" },
  "kocaeli|kartepe": { lat: 40.735, lng: 30.02, city: "Kocaeli" },
  "kocaeli|karamursel": { lat: 40.691, lng: 29.616, city: "Kocaeli" },
  // Sakarya / Yalova (Gebze çevresi)
  "sakarya|adapazari": { lat: 40.7833, lng: 30.4, city: "Sakarya" },
  "sakarya|serdivan": { lat: 40.766, lng: 30.36, city: "Sakarya" },
  "sakarya|hendek": { lat: 40.799, lng: 30.73, city: "Sakarya" },
  "yalova|yalova": { lat: 40.655, lng: 29.2769, city: "Yalova" },
  "yalova|cinarcik": { lat: 40.645, lng: 29.12, city: "Yalova" },
  "yalova|altinova": { lat: 40.695, lng: 29.51, city: "Yalova" },
  // Ankara
  "ankara|cankaya": { lat: 39.907, lng: 32.86, city: "Ankara" },
  "ankara|kecioren": { lat: 39.977, lng: 32.86, city: "Ankara" },
  "ankara|yenimahalle": { lat: 39.968, lng: 32.78, city: "Ankara" },
  "ankara|etimesgut": { lat: 39.948, lng: 32.68, city: "Ankara" },
  "ankara|sincan": { lat: 39.972, lng: 32.58, city: "Ankara" },
  "ankara|mamak": { lat: 39.92, lng: 32.92, city: "Ankara" },
  "ankara|pursaklar": { lat: 40.04, lng: 32.9, city: "Ankara" },
  // İzmir
  "izmir|konak": { lat: 38.4192, lng: 27.1287, city: "İzmir" },
  "izmir|bornova": { lat: 38.47, lng: 27.22, city: "İzmir" },
  "izmir|karsiyaka": { lat: 38.46, lng: 27.11, city: "İzmir" },
  "izmir|buca": { lat: 38.385, lng: 27.175, city: "İzmir" },
  // Bursa
  "bursa|osmangazi": { lat: 40.1885, lng: 29.061, city: "Bursa" },
  "bursa|nilufer": { lat: 40.213, lng: 28.96, city: "Bursa" },
  "bursa|yildirim": { lat: 40.185, lng: 29.1, city: "Bursa" },
};

export function resolveGeoFromCityText(cityText: string | null | undefined): GeoPoint | null {
  if (!cityText?.trim()) return null;
  // "İstanbul / Tuzla", "Gebze - Kocaeli", "Tuzla, İstanbul"
  const parts = cityText.split(/[\/|,–—\-]+/).map((p) => n(p.trim())).filter(Boolean);
  if (parts.length === 0) return null;

  const head = parts[0]!;
  const second = parts[1];
  const third = parts[2];

  // İl / İlçe / Semt
  if (second) {
    const dk = `${head}|${second}`;
    if (DISTRICT_CENTERS[dk]) {
      const d = DISTRICT_CENTERS[dk]!;
      return { lat: d.lat, lng: d.lng, accuracy: "district" };
    }
    // Ters sıra: "Gebze / Kocaeli" veya "Tuzla / İstanbul"
    const reverse = `${second}|${head}`;
    if (DISTRICT_CENTERS[reverse]) {
      const d = DISTRICT_CENTERS[reverse]!;
      return { lat: d.lat, lng: d.lng, accuracy: "district" };
    }
    // Semt olarak second (İstanbul / Samandıra)
    const alone =
      DISTRICT_CENTERS[`istanbul|${second}`] ||
      DISTRICT_CENTERS[`kocaeli|${second}`] ||
      DISTRICT_CENTERS[`sakarya|${second}`] ||
      DISTRICT_CENTERS[`yalova|${second}`];
    if (alone) return { lat: alone.lat, lng: alone.lng, accuracy: "district" };
  }
  if (third) {
    const dk = `${head}|${third}`;
    if (DISTRICT_CENTERS[dk]) {
      const d = DISTRICT_CENTERS[dk]!;
      return { lat: d.lat, lng: d.lng, accuracy: "district" };
    }
  }

  // Metinde bilinen ilçe adı geçiyorsa (öncelik: ilçe merkezi)
  for (const part of parts) {
    for (const [key, val] of Object.entries(DISTRICT_CENTERS)) {
      if (key.endsWith(`|${part}`)) {
        return { lat: val.lat, lng: val.lng, accuracy: "district" };
      }
    }
  }

  // Tek parça semt/ilçe
  for (const [key, val] of Object.entries(DISTRICT_CENTERS)) {
    if (key.endsWith(`|${head}`)) {
      return { lat: val.lat, lng: val.lng, accuracy: "district" };
    }
  }

  const city = CITY_CENTERS[head] ?? (second ? CITY_CENTERS[second] : undefined);
  if (city) return { lat: city.lat, lng: city.lng, accuracy: "city" };

  return null;
}

export function resolveDistrictCenter(city: string, district: string): GeoPoint | null {
  const key = `${n(city)}|${n(district)}`;
  const d = DISTRICT_CENTERS[key];
  if (d) return { lat: d.lat, lng: d.lng, accuracy: "district" };
  const c = CITY_CENTERS[n(city)];
  if (c) return { lat: c.lat, lng: c.lng, accuracy: "city" };
  return null;
}

export function listProvinces(): string[] {
  return [
    "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın",
    "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum",
    "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun",
    "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri",
    "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin",
    "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas",
    "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray",
    "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova",
    "Karabük", "Kilis", "Osmaniye", "Düzce",
  ];
}

export function listDistrictsForProvince(province: string): string[] {
  const p = n(province);
  const out: string[] = [];
  for (const key of Object.keys(DISTRICT_CENTERS)) {
    if (!key.startsWith(`${p}|`)) continue;
    const dist = key.slice(p.length + 1);
    // Skip neighborhood shortcuts that don't look like district titles
    const title = dist
      .split(" ")
      .map((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1))
      .join(" ");
    out.push(title);
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b, "tr"));
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
