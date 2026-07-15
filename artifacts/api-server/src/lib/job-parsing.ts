// Telegram/elle eklenen ilan metinlerinden akıllı ilan bilgisi çıkarımı.
import {
  getSupplementalDistricts,
  getSupplementalNeighborhoods,
} from "./location-terms";
const NUM = "(\\d{1,3}(?:[.,]\\d{3})+|\\d{5,6})";
const CUR = "(?:tl|₺|try|lira)";

const CITY_DISPLAY: Record<string, string> = {
  adana: "Adana", adıyaman: "Adıyaman", afyonkarahisar: "Afyonkarahisar", afyon: "Afyonkarahisar", ağrı: "Ağrı",
  amasya: "Amasya", ankara: "Ankara", antalya: "Antalya", artvin: "Artvin", aydın: "Aydın", balıkesir: "Balıkesir",
  bilecik: "Bilecik", bingöl: "Bingöl", bitlis: "Bitlis", bolu: "Bolu", burdur: "Burdur", bursa: "Bursa",
  çanakkale: "Çanakkale", çankırı: "Çankırı", çorum: "Çorum", denizli: "Denizli", diyarbakır: "Diyarbakır",
  edirne: "Edirne", elazığ: "Elazığ", erzincan: "Erzincan", erzurum: "Erzurum", eskişehir: "Eskişehir",
  gaziantep: "Gaziantep", giresun: "Giresun", gümüşhane: "Gümüşhane", hakkari: "Hakkari", hatay: "Hatay",
  ısparta: "Isparta", mersin: "Mersin", istanbul: "İstanbul", izmir: "İzmir", kars: "Kars", kastamonu: "Kastamonu",
  kayseri: "Kayseri", kırklareli: "Kırklareli", kırşehir: "Kırşehir", kocaeli: "Kocaeli", izmit: "Kocaeli",
  konya: "Konya", kütahya: "Kütahya", malatya: "Malatya", manisa: "Manisa", kahramanmaraş: "Kahramanmaraş",
  maraş: "Kahramanmaraş", mardin: "Mardin", muğla: "Muğla", muş: "Muş", nevşehir: "Nevşehir", niğde: "Niğde",
  ordu: "Ordu", rize: "Rize", sakarya: "Sakarya", adapazarı: "Sakarya", samsun: "Samsun", siirt: "Siirt",
  sinop: "Sinop", sivas: "Sivas", tekirdağ: "Tekirdağ", tokat: "Tokat", trabzon: "Trabzon", tunceli: "Tunceli",
  şanlıurfa: "Şanlıurfa", urfa: "Şanlıurfa", uşak: "Uşak", van: "Van", yozgat: "Yozgat", zonguldak: "Zonguldak",
  aksaray: "Aksaray", bayburt: "Bayburt", karaman: "Karaman", kırıkkale: "Kırıkkale", batman: "Batman",
  şırnak: "Şırnak", bartın: "Bartın", ardahan: "Ardahan", ığdır: "Iğdır", yalova: "Yalova", karabük: "Karabük",
  kilis: "Kilis", osmaniye: "Osmaniye", düzce: "Düzce",
};

const DISTRICT_TO_CITY: Record<string, { city: string; district: string }> = {
  esenyurt: { city: "İstanbul", district: "Esenyurt" }, avcılar: { city: "İstanbul", district: "Avcılar" },
  beylikdüzü: { city: "İstanbul", district: "Beylikdüzü" }, başakşehir: { city: "İstanbul", district: "Başakşehir" },
  arnavutköy: { city: "İstanbul", district: "Arnavutköy" }, sultangazi: { city: "İstanbul", district: "Sultangazi" },
  bağcılar: { city: "İstanbul", district: "Bağcılar" }, bahçelievler: { city: "İstanbul", district: "Bahçelievler" },
  bakırköy: { city: "İstanbul", district: "Bakırköy" }, zeytinburnu: { city: "İstanbul", district: "Zeytinburnu" },
  fatih: { city: "İstanbul", district: "Fatih" }, beşiktaş: { city: "İstanbul", district: "Beşiktaş" },
  şişli: { city: "İstanbul", district: "Şişli" }, kağıthane: { city: "İstanbul", district: "Kağıthane" },
  sarıyer: { city: "İstanbul", district: "Sarıyer" }, ümraniye: { city: "İstanbul", district: "Ümraniye" },
  ataşehir: { city: "İstanbul", district: "Ataşehir" }, kadıköy: { city: "İstanbul", district: "Kadıköy" },
  maltepe: { city: "İstanbul", district: "Maltepe" }, kartal: { city: "İstanbul", district: "Kartal" },
  pendik: { city: "İstanbul", district: "Pendik" }, tuzla: { city: "İstanbul", district: "Tuzla" },
  sultanbeyli: { city: "İstanbul", district: "Sultanbeyli" }, sancaktepe: { city: "İstanbul", district: "Sancaktepe" },
  çekmeköy: { city: "İstanbul", district: "Çekmeköy" }, silivri: { city: "İstanbul", district: "Silivri" },
  küçükçekmece: { city: "İstanbul", district: "Küçükçekmece" }, büyükçekmece: { city: "İstanbul", district: "Büyükçekmece" },
  eyüpsultan: { city: "İstanbul", district: "Eyüpsultan" }, beykoz: { city: "İstanbul", district: "Beykoz" },
  gebze: { city: "Kocaeli", district: "Gebze" }, darıca: { city: "Kocaeli", district: "Darıca" },
  çayırova: { city: "Kocaeli", district: "Çayırova" }, dilovası: { city: "Kocaeli", district: "Dilovası" },
  başiskele: { city: "Kocaeli", district: "Başiskele" },
  keçiören: { city: "Ankara", district: "Keçiören" }, çankaya: { city: "Ankara", district: "Çankaya" },
  yenimahalle: { city: "Ankara", district: "Yenimahalle" }, sincan: { city: "Ankara", district: "Sincan" },
  etimesgut: { city: "Ankara", district: "Etimesgut" }, mamak: { city: "Ankara", district: "Mamak" },
  pursaklar: { city: "Ankara", district: "Pursaklar" }, bornova: { city: "İzmir", district: "Bornova" },
  buca: { city: "İzmir", district: "Buca" }, karşıyaka: { city: "İzmir", district: "Karşıyaka" },
  konak: { city: "İzmir", district: "Konak" }, torbalı: { city: "İzmir", district: "Torbalı" },
  nilüfer: { city: "Bursa", district: "Nilüfer" }, osmangazi: { city: "Bursa", district: "Osmangazi" },
  yıldırım: { city: "Bursa", district: "Yıldırım" }, inegöl: { city: "Bursa", district: "İnegöl" },
  ...getSupplementalDistricts(),
};

const NEIGHBORHOODS: Record<string, { city: string; district?: string; neighborhood: string }> = {
  kıraç: { city: "İstanbul", district: "Esenyurt", neighborhood: "Kıraç" },
  hadımköy: { city: "İstanbul", district: "Arnavutköy", neighborhood: "Hadımköy" },
  ikitelli: { city: "İstanbul", district: "Başakşehir", neighborhood: "İkitelli" },
  dudullu: { city: "İstanbul", district: "Ümraniye", neighborhood: "Dudullu" },
  tuzlaosb: { city: "İstanbul", district: "Tuzla", neighborhood: "Tuzla OSB" },
  yenibosna: { city: "İstanbul", district: "Bahçelievler", neighborhood: "Yenibosna" },
  halkalı: { city: "İstanbul", district: "Küçükçekmece", neighborhood: "Halkalı" },
  atakent: { city: "İstanbul", district: "Küçükçekmece", neighborhood: "Atakent" },
  maslak: { city: "İstanbul", district: "Sarıyer", neighborhood: "Maslak" },
  etiler: { city: "İstanbul", district: "Beşiktaş", neighborhood: "Etiler" },
  kurtköy: { city: "İstanbul", district: "Pendik", neighborhood: "Kurtköy" },
  kozyatağı: { city: "İstanbul", district: "Kadıköy", neighborhood: "Kozyatağı" },
  mimaroba: { city: "İstanbul", district: "Büyükçekmece", neighborhood: "Mimaroba" },
  firuzköy: { city: "İstanbul", district: "Avcılar", neighborhood: "Firuzköy" },
  ataköy: { city: "İstanbul", district: "Bakırköy", neighborhood: "Ataköy" },
  ayazağa: { city: "İstanbul", district: "Sarıyer", neighborhood: "Ayazağa" },
  içmeler: { city: "İstanbul", district: "Tuzla", neighborhood: "İçmeler" },
  samandıra: { city: "İstanbul", district: "Sancaktepe", neighborhood: "Samandıra" },
  alemdağ: { city: "İstanbul", district: "Çekmeköy", neighborhood: "Alemdağ" },
  taşdelen: { city: "İstanbul", district: "Çekmeköy", neighborhood: "Taşdelen" },
  paşaköy: { city: "İstanbul", district: "Çekmeköy", neighborhood: "Paşaköy" },
  ferhatpaşa: { city: "İstanbul", district: "Ataşehir", neighborhood: "Ferhatpaşa" },
  çamlıca: { city: "İstanbul", district: "Üsküdar", neighborhood: "Çamlıca" },
  viaport: { city: "İstanbul", district: "Tuzla", neighborhood: "Viaport" },
  habibler: { city: "İstanbul", district: "Sultangazi", neighborhood: "Habibler" },
  ostim: { city: "Ankara", district: "Yenimahalle", neighborhood: "OSTİM" },
  aosb: { city: "İzmir", district: "Çiğli", neighborhood: "Atatürk OSB" },
  nosab: { city: "Bursa", district: "Nilüfer", neighborhood: "NOSAB" },
  ...getSupplementalNeighborhoods(),
};

export interface ParsedLocation {
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  display: string | null;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr-TR")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, " ")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTr(text: string): string {
  return text.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

function moneyToNumber(raw: string | undefined, minValue = 400): number | null {
  if (!raw) return null;
  const clean = raw.replace(/[^\d]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) && n >= minValue ? n : null;
}

function formatTL(n: number): string {
  return `${n.toLocaleString("tr-TR")} TL`;
}

/**
 * Kullanıcı / ayıklama maaşı → standart "45.300 TL" (veya günlük).
 * Zaten metinsel ("Asgari Ücret") ise olduğu gibi bırakır.
 */
export function normalizeSalaryString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/asgari\s*[üu]cret/i.test(s) && !/\d/.test(s)) return "Asgari Ücret";

  const isDaily = /g[üu]nl[üu]k|yevmiye/i.test(s);
  const isTotal = /toplam/i.test(s);
  const n = moneyToNumber(s, isDaily ? 400 : 1000);
  if (!n) return s;
  if (n > 500_000) return s; // telefon / abartı rakam
  if (isDaily && n <= 25_000) return `${formatTL(n)} / Günlük`;
  if (isTotal) return `${formatTL(n)} Toplam`;
  return formatTL(n);
}

function extractLabeledAmount(text: string, labels: string[]): number | null {
  const tl = normalizeTr(text);
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = tl.match(new RegExp(`${escaped}[^\\d]{0,24}${NUM}\\s*${CUR}?`));
    const value = moneyToNumber(match?.[1]);
    if (value) return value;
  }
  return null;
}

function buildCompensationPackage(text: string): string | null {
  const salary = extractSalaryRange(text);
  const base = salary.total;
  if (!base) return null;

  const mealCard = extractLabeledAmount(text, ["yemek kartı", "yemekkartı", "multinet", "sodexo", "edenred", "ticket", "setcard", "metropol"]);
  const road = extractLabeledAmount(text, ["yol", "ulaşım", "servis ücreti"]);
  const mealCash = extractLabeledAmount(text, ["yemek ücreti", "yemek parası"]);
  const bonus = extractLabeledAmount(text, ["prim", "ikramiye", "bonus"]);
  const additions = [
    mealCard ? ["Yemek Kartı", mealCard] as const : null,
    road ? ["Yol", road] as const : null,
    mealCash ? ["Yemek", mealCash] as const : null,
    bonus ? ["Prim", bonus] as const : null,
  ].filter(Boolean) as Array<readonly [string, number]>;

  if (additions.length === 0) return null;
  const total = additions.reduce((sum, [, value]) => sum + value, base);
  const details = additions.map(([label, value]) => `${label} ${formatTL(value)}`).join(" + ");
  return `Maaş ${formatTL(base)} + ${details} = Toplam ${formatTL(total)}`;
}

export function extractSalaryRange(text: string): { min: number | null; max: number | null; total: number | null } {
  const tl = normalizeTr(text);
  const totalMatch = tl.match(new RegExp(`(?:toplam\\s+(?:hakedi[şs]|kazan[çc]|[üu]cret|paket|maa[şs])|ele\\s+ge[çc]en)\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`));
  const rangeMatch = tl.match(new RegExp(`${NUM}\\s*[-–]\\s*${NUM}\\s*${CUR}?`));
  const labeled = tl.match(new RegExp(`(?:maa[şs]|[üu]cret|ayl[ıi]k|net\\s+maa[şs]|hakedi[şs])\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`));
  const generic = tl.match(new RegExp(`${NUM}\\s*${CUR}`));
  const total = moneyToNumber(totalMatch?.[1]);
  if (rangeMatch) {
    const min = moneyToNumber(rangeMatch[1]);
    const max = moneyToNumber(rangeMatch[2]);
    return { min, max, total: total ?? max ?? min };
  }
  const single = moneyToNumber(labeled?.[1] ?? generic?.[1]);
  return { min: single, max: single, total: total ?? single };
}

export function extractSalary(text: string): string | null {
  const tl = text.toLocaleLowerCase("tr-TR");
  const rangeInfo = extractSalaryRange(text);
  const isDaily = /g[üu]nl[üu]k|yevmiye|g[üu]n\s*ba[şs][ıi]|g[üu]nl[üu]k\s+[üu]cret|part[\s-]?time|yar[ıi]\s+zamanl[ıi]/.test(tl);

  // Günlük / part-time: "günlük 1500", "1500 tl günlük", "yevmiye 2.000", "günlük 2 bin"
  const dailyBin = tl.match(/(?:g[üu]nl[üu]k|yevmiye|part[\s-]?time)[^0-9]{0,16}(\d{1,2})\s*bin/);
  if (dailyBin) {
    const n = parseInt(dailyBin[1]!, 10) * 1000;
    if (n >= 500 && n <= 20000) return `${formatTL(n)} / Günlük`;
  }
  const dailyLabeled = tl.match(new RegExp(`(?:g[üu]nl[üu]k|yevmiye|g[üu]n\\s*ba[şs][ıi])\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`))
    ?? tl.match(new RegExp(`${NUM}\\s*${CUR}?\\s*(?:g[üu]nl[üu]k|yevmiye)`))
    ?? tl.match(new RegExp(`(?:ücret|maa[şs]|hakedi[şs])\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?\\s*(?:g[üu]nl[üu]k|yevmiye)`));
  if (dailyLabeled?.[1]) {
    const n = moneyToNumber(dailyLabeled[1], 400);
    if (n && n <= 25000) return `${formatTL(n)} / Günlük`;
  }

  const total = tl.match(new RegExp(`toplam\\s+(?:hakedi[şs]|kazan[çc]|[üu]cret|paket)\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`));
  if (total && rangeInfo.total) return `${formatTL(rangeInfo.total)} Toplam`;

  const binLabeled = tl.match(/(?:maa[şs]|[üu]cret|net|ayl[ıi]k|hakedi[şs]|g[üu]nl[üu]k)\D{0,12}(\d{1,3})\s*bin/);
  const binCur = tl.match(/(\d{1,3})\s*bin\s*(?:tl|₺|lira)?/);
  const binBare = tl.match(/\b(\d{2,3})\s*bin\b/);
  const bin = binLabeled ?? binCur ?? binBare;
  if (bin) {
    const n = parseInt(bin[1]!, 10);
    if (isDaily && n >= 1 && n <= 15) return `${formatTL(n * 1000)} / Günlük`;
    if (n >= 10 && n <= 200) return formatTL(n * 1000);
  }

  const labeled = tl.match(new RegExp(`(?:maa[şs]|[üu]cret|ayl[ıi]k|net\\s+maa[şs]|ele\\s+ge[çc]en|hakedi[şs])\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`))
    ?? tl.match(new RegExp(`(?:maa[şs]|[üu]cret|ayl[ıi]k|net\\s+maa[şs]|hakedi[şs])\\s*[:\\-]?\\s*${NUM}(?!\\s*[-–])`));
  if (labeled?.[1]) {
    const n = moneyToNumber(labeled[1], isDaily ? 400 : 1000);
    if (n) return isDaily && n < 20000 ? `${formatTL(n)} / Günlük` : formatTL(n);
  }

  const range = tl.match(new RegExp(`${NUM}\\s*[-–]\\s*${NUM}\\s*${CUR}?`));
  if (range) {
    const a = moneyToNumber(range[1]);
    const b = moneyToNumber(range[2]);
    if (a && b) return `${formatTL(a).replace(" TL", "")}-${formatTL(b)}`;
  }

  const generic = tl.match(new RegExp(`${NUM}\\s*${CUR}`));
  if (generic?.[1]) {
    const n = moneyToNumber(generic[1], isDaily ? 400 : 1000);
    if (n) {
      if (isDaily && n < 20000) return `${formatTL(n)} / Günlük`;
      return formatTL(n);
    }
  }

  // "2500" / "1.800" yalnız başına + günlük/part-time bağlamı
  if (isDaily) {
    const bare = tl.match(/(?<!\d)(\d{1,2}[.,]\d{3}|\d{3,5})(?!\d)/);
    if (bare?.[1]) {
      const n = moneyToNumber(bare[1], 400);
      if (n && n <= 20000) return `${formatTL(n)} / Günlük`;
    }
  }

  // Çıplak aylık maaş: 45300 / 45.300 (etiketsiz ama makul aralık)
  const bareMonthly = tl.match(/(?<!\d)(\d{1,3}(?:[.,]\d{3}){1,2}|\d{5,6})(?!\d)/);
  if (bareMonthly?.[1]) {
    const n = moneyToNumber(bareMonthly[1], 15_000);
    if (n && n <= 250_000) return formatTL(n);
  }

  if (/asgari\s+[üu]cret/.test(tl)) return "Asgari Ücret";

  return null;
}

// Cinsiyet algısı: bayan/kadın/hanım → Bayan; bay/erkek → Bay; ikisi de → Bay / Bayan
// Hiçbiri yoksa null döner (çağıran taraf "Belirtilmemiş" yazabilir).
export function extractGender(text: string): string | null {
  const t = text.toLocaleLowerCase("tr-TR");
  const female = /\b(?:bayan|kad[ıi]n|han[ıi]m)\b/.test(t);
  // "bay" kelimesi "bayan" içinde sayılmaz (kelime sınırı sayesinde)
  const male = /\b(?:bay|erkek)\b/.test(t);
  if (female && male) return "Bay / Bayan";
  if (female) return "Bayan";
  if (male) return "Bay";
  return null;
}

export function extractBenefits(text: string): string[] {
  const t = normalizeTr(text);
  const benefits: string[] = [];
  const add = (label: string) => { if (!benefits.includes(label)) benefits.push(label); };
  if (/\bservis\b|ula[şs][ıi]m|personel\s+servisi/.test(t)) add("Servis");
  if (/\byemek\b|ö[ğg]le\s+yeme[ğg]i|yemekhane/.test(t)) add("Yemek");
  if (/yemek\s+kart[ıi]|multinet|sodexo|edenred|ticket|setcard|metropol/.test(t)) add("Yemek Kartı");
  if (/\bsgk\b|sigorta|sosyal\s+g[üu]vence/.test(t)) add("SGK");
  if (/prim|ikramiye|bonus/.test(t)) add("Prim");
  if (/konaklama|lojman|yat[ıi]l[ıi]/.test(t)) add("Konaklama");
  if (/k[ıi]yafet|uniforma|elbise/.test(t)) add("Kıyafet");
  if (/mesai|fazla\s+mesai/.test(t)) add("Mesai");
  return benefits;
}

/** Kelime sınırı: "des" → "adres" içinde eşleşmesin; "gebze'de" eşleşsin. */
function hasTerm(haystackAscii: string, term: string): boolean {
  const needle = normalize(term);
  if (!needle || needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(haystackAscii);
}

/** Görev yeri / OSB — firma merkezinden (İzmir vb.) daha güçlü sinyal */
const WORKPLACE_BOOST = new Set([
  "gosb", "taysad", "gebze taysad", "tosb", "gebkim", "gebze osb", "gebze organize sanayi bolgesi",
  "imes osb", "plastikciler osb", "kimya ihtisas osb", "dilovasi makine osb", "demirciler osb",
  "tuzlaosb", "idosb", "ikitelli osb", "dudullu osb", "ostim", "aosb", "nosab",
  "cerkezkoy osb", "velimese osb", "ergene osb", "muratli osb", "luleburgaz osb",
]);

function workplaceBoost(termKey: string): number {
  const n = normalize(termKey).replace(/\s+/g, " ");
  if (WORKPLACE_BOOST.has(n) || WORKPLACE_BOOST.has(n.replace(/\s+/g, ""))) return 420;
  if (/\bosb\b|organize sanayi|taysad|gosb|tosb|gebkim|gise|otoyol|kopru/.test(n)) return 380;
  return 0;
}

function detectMentionedCities(ascii: string): Set<string> {
  const mentioned = new Set<string>();
  const cityKeys = Object.entries(CITY_DISPLAY).sort((a, b) => b[0].length - a[0].length);
  for (const [key, city] of cityKeys) {
    if (hasTerm(ascii, key)) mentioned.add(city);
  }
  return mentioned;
}

export function extractLocation(text: string): ParsedLocation {
  const ascii = normalize(text);
  const mentioned = detectMentionedCities(ascii);

  // Görev yeri bağlamı: merkez şehir cezası daha hafif
  const hasWorkplaceCue = /gorev yeri|calis(ilacak|ma) yer|proje lokasyon|proje yeri|lokasyon|tesis|fabrika|osb|organize sanayi|taysad|gosb|gise|otoyol|kopru|havaliman|viaport|samandira/.test(ascii);

  type Candidate = ParsedLocation & { score: number };
  const candidates: Candidate[] = [];

  const preferCity = (city: string): number => {
    if (mentioned.size === 0) return 0;
    if (mentioned.has(city)) return 50;
    // Başka bir il açıkça yazıyorsa sırf servis/merkez satırındaki ilçe yüzünden şehir değiştirme.
    // Gerçek OSB/görev yeri sinyali workplaceBoost ile ayrıca puan alır.
    return hasWorkplaceCue ? -90 : -110;
  };

  for (const [key, loc] of Object.entries(NEIGHBORHOODS)) {
    const nKey = normalize(key);
    if (!hasTerm(ascii, key) && !hasTerm(ascii, loc.neighborhood)) continue;
    const display = [loc.city, loc.district, loc.neighborhood].filter(Boolean).join(" / ");
    candidates.push({
      city: loc.city,
      district: loc.district ?? null,
      neighborhood: loc.neighborhood,
      display,
      score: 300 + nKey.length + preferCity(loc.city) + workplaceBoost(key) + workplaceBoost(loc.neighborhood),
    });
  }

  for (const [key, loc] of Object.entries(DISTRICT_TO_CITY)) {
    const nKey = normalize(key);
    if (!hasTerm(ascii, key) && !hasTerm(ascii, loc.district)) continue;
    candidates.push({
      city: loc.city,
      district: loc.district,
      neighborhood: null,
      display: `${loc.city} / ${loc.district}`,
      score: 200 + nKey.length + preferCity(loc.city) + workplaceBoost(key) + workplaceBoost(loc.district),
    });
  }

  for (const [key, city] of Object.entries(CITY_DISPLAY)) {
    if (!hasTerm(ascii, key)) continue;
    // Sadece il adı: görev yeri OSB sinyali varsa zayıf kalsın
    const alone = 100 + normalize(key).length + preferCity(city);
    candidates.push({
      city,
      district: null,
      neighborhood: null,
      display: city,
      score: alone,
    });
  }

  if (candidates.length === 0) {
    return { city: null, district: null, neighborhood: null, display: null };
  }

  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0]!;
  // Metinde tek bir il açıkça yazıyorsa, başka ile ait çıplak ilçe/servis adının
  // daha yüksek taban puanla bu ili ezmesine izin verme.
  if (mentioned.size === 1 && !mentioned.has(best.city!)) {
    const sameProvince = candidates.find((candidate) => mentioned.has(candidate.city!));
    if (sameProvince) best = sameProvince;
  }
  return {
    city: best.city,
    district: best.district,
    neighborhood: best.neighborhood,
    display: best.display,
  };
}

/** Açıkça görev/çalışma yeri diye etiketlenmiş konumu servis ve merkez adreslerinden önce alır. */
export function extractExplicitWorkLocation(text: string): ParsedLocation | null {
  const patterns = [
    /(?:görev|gorev|çalışma|calisma|proje|iş|is)\s*(?:yeri|lokasyonu|lokasyon|bölgesi|bolgesi)\s*[:\-–]\s*([^\n\r;|]{2,120})/gi,
    /(?:lokasyon|konum)\s*[:\-–]\s*([^\n\r;|]{2,120})/gi,
    /(?:personel|güvenlik|guvenlik)\s+(?:aranan|aranacak|alınacak|alinacak)\s+(?:yer|bölge|bolge)\s*[:\-–]?\s*([^\n\r;|]{2,120})/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const parsed = extractLocation(match[1] ?? "");
      if (parsed.city || parsed.district || parsed.neighborhood) return parsed;
    }
  }
  return null;
}

/** Açıklama içindeki tüm TR cep numaralarını yakala (benzersiz, 05XXXXXXXXX). */
export function extractPhoneNumbers(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /(?:\+90|0)?[ \t\-./()]*(?:5(?:[ \t\-./()]*\d){9})/g,
    /(?<!\d)5(?:[ \t\-./()]*\d){9}(?!\d)/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      let normalized = digits;
      if (normalized.startsWith("90") && normalized.length >= 12) {
        normalized = "0" + normalized.slice(2);
      }
      if (normalized.length === 10 && normalized.startsWith("5")) {
        normalized = "0" + normalized;
      }
      if (/^0+5\d{9}$/.test(normalized)) {
        normalized = "0" + normalized.slice(-10);
      }
      if (/^05\d{9}$/.test(normalized) && !seen.has(normalized)) {
        seen.add(normalized);
        found.push(normalized);
      }
    }
  }
  return found;
}

/** Bot metnindeki tekrar/yanlış eklenmiş telefonları temizleyip ilk gerçek numarayı korur. */
export function keepPrimaryPhoneInText(text: string): string {
  if (!text) return text;
  let kept = false;
  const phonePattern = /(?<!\d)(?:\+90|0)?[ \t\-./()]*(?:5(?:[ \t\-./()]*\d){9})(?!\d)/g;
  return text
    .replace(phonePattern, (raw) => {
      const phone = extractPhoneNumbers(raw)[0];
      if (!phone) return raw;
      if (kept) return "";
      kept = true;
      return phone;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*([/,|])[ \t]*(?=\1|$)/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** İlk bulunan numara — geriye uyumlu. */
export function extractPhoneNumber(text: string): string | null {
  return extractPhoneNumbers(text)[0] ?? null;
}

/** Birden fazla numarayı tek applyUrl alanında sakla: tel:05...,05... */
export function formatTelApplyUrl(phones: string[]): string | null {
  const list = [...new Set(
    phones
      .map((p) => {
        const digits = String(p ?? "").replace(/\D/g, "");
        let n = digits;
        if (n.startsWith("90") && n.length >= 12) n = "0" + n.slice(2);
        if (n.length === 10 && n.startsWith("5")) n = "0" + n;
        if (/^0+5\d{9}$/.test(n)) n = "0" + n.slice(-10);
        return /^05\d{9}$/.test(n) ? n : "";
      })
      .filter(Boolean),
  )];
  if (list.length === 0) return null;
  return `tel:${list.join(",")}`;
}

/** applyUrl / serbest metinden tüm telefonları çıkar. */
export function parseApplyUrlPhones(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const body = raw.replace(/^tel:/i, "");
  return extractPhoneNumbers(body);
}

const HIRING_SIGNAL = /(?:aran[ıi]yor|aranmaktad[ıi]r|al[ıi]nacakt[ıi]r|al[ıi]n[ıi]cakt[ıi]r|al[ıi]m[ıi]\s+yap[ıi]lacak|al[ıi]m[ıi]\s+olacak|personel\s+al[ıi]m[ıi]|personeli\s+al[ıi]m[ıi]|eleman\s+al[ıi]m[ıi]|görevlisi\s+aran[ıi]yor|ihtiyac[ıi]m[ıi]z|ihtiya[çc][ıi]m[ıi]z|istihdam|kontenjan|görevlendirilmek|çalışma\s+arkadaşları\s+aran|ekip\s+arkadaş)/;

export function isSponsoredPost(text: string): boolean {
  const t = normalizeTr(text);
  return /#sponsorlu|sponsorlu\s*·|garanti\s+bbva|sur\s+yap[ıi]|ömür\s+boyu\s+tatil|magfi\b|caz\s+festivali|hemen\s+keşfet/i.test(t);
}

export function isNonSecurityStaffPosting(text: string): boolean {
  const t = normalizeTr(text);
  const staffJob = /(?:temizlik\s+personeli|temizlik\s+görevlisi|temizlik\s+gorevlisi|camc[ıi]\s+temizlik|makineci\s+temizlik|bak[ıi]m\s+personeli|bak[ıi]c[ıi]\s+personeli|hasta\s+bak[ıi]m|kad[ıi]n\s+bak[ıi]m|zemin\s+y[ıi]kama\s+personeli|çöp\s+toplama)/.test(t);
  if (!staffJob) return false;
  const securityRole = /(?:özel\s+g[üu]venlik|ögg|g[üu]venlik\s+(?:görevlisi|personeli|amiri|sorumlusu)|5188)/.test(t);
  return !securityRole;
}

export function isJobSeekerPost(text: string): boolean {
  const t = normalizeTr(text);
  const seeking = /(?:i[şs]\s+ar[ıi]yorum|i[şs]\s+bak[ıi]yorum|i[şs]\s+istiyorum|i[şs]\s+aray[ıi][şs][ıi]nday[ıi]m|i[şs]\s+aramaktan|g[üu]venlik\s+i[şs]i\s+ar[ıi]yorum|çalışmak\s+istiyorum|sertifikam\s+var|kimli[ğg]im\s+(?:var|mevcut)|tecr[üu]beliyim|özgeçmiş(?:im)?\s+var|cv\s+(?:gönder|yolla|atsam|atabilir)|part\s*time\s+aray[ıi][şs]|projesi\s+laz[ıi]m|laz[ıi]m\s+varsa\s+dm|işverenler\s+dm|sadece\s+yard[ıi]mc[ıi]\s+olabilecek|başvuru\s+yapan\s+var\s*m[ıi]|bilgisi\s+(?:olan|fikri)|nasıl\s+başvuru|şartlar\s+nedir)/.test(t);
  if (!seeking) return false;
  return !HIRING_SIGNAL.test(t);
}

export function isSecurityJobPosting(text: string): boolean {
  if (text.length < 35) return false;
  if (isSponsoredPost(text) || isNonSecurityStaffPosting(text) || isJobSeekerPost(text)) return false;

  const t = normalizeTr(text);

  // Sohbet / bilgi / soru gürültüsü — ilan değil
  if (/(?:selam|merhaba|nas[ıi]ls[ıi]n|te[şs]ekk[üu]r|kolay gelsin|hay[ıi]rl[ıi]s[ıi]|amin\b|in[şs]allah)/.test(t) && t.length < 120) {
    return false;
  }
  if (/(?:ne\s+zaman|var\s*m[ıi]\s*\?|bilen\s+var\s*m[ıi]|yard[ıi]mc[ıi]\s+olur\s*mus|nas[ıi]l\s+ba[şs]vuru)/.test(t) && !HIRING_SIGNAL.test(t)) {
    return false;
  }

  const explicitSecurity = /(?:özel\s+g[üu]venlik|ögg\b|ögg\s+kimlik|g[üu]venlik\s+(?:iş\s+ilan[ıi]|eleman[ıi]|görevlisi|personeli|amiri|sorumlusu)|g[üu]venlik\s+görev|bay\s+g[üu]venlik|bayan\s+g[üu]venlik|silahl[ıi]\s+g[üu]venlik|silahs[ıi]z\s+g[üu]venlik|5188|ögg\s+personel|koruma\s+görev|kimlikli\s+(?:özel\s+)?g[üu]venlik|maç\s+günü\s+görev)/.test(t);
  const broadSecurity = /(?:g[üu]venlik|ögg|ogg)/.test(t);

  if (!explicitSecurity && !broadSecurity) return false;

  const hiringStrong = HIRING_SIGNAL.test(t)
    || /(?:al[ıi]nacak|personel\s+al[ıi]m|eleman\s+al[ıi]m|ba[şs]vuru\s*(?:için|icin|:)|ileti[şs]im\s*:|irtibat\s*:)/.test(t);
  const salary = /(?:maa[şs]|[üu]cret|hakedi[şs]|ayl[ıi]k|ele\s+ge[çc]en|g[üu]nl[üu]k\s+(?:[üu]cret|maa[şs])|\d{2,3}\s*bin|\d{1,3}[.,]\d{3}(?:\s*(?:tl|lira))?|asgari\s+[üu]cret|net\s+maa[şs]|görev\s+[üu]creti|yevmiye)/.test(t);
  const hasPhone = /(?:0|\+90)?[\s-]*5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/.test(t) || /5\d{9}/.test(t);
  const hasJobDetails = /vardiya|servis|yemek|sgk|proje|avm|site|fabrika|depo|hastane|metro|2\+2|2\s+\+\s+2|part[\s-]?time|g[üu]nl[üu]k/.test(t);

  // Açık güvenlik rolü + (alım sinyali veya maaş+iletişim)
  if (explicitSecurity && hiringStrong) return true;
  if (explicitSecurity && salary && (hasPhone || hiringStrong || hasJobDetails)) return true;
  if (explicitSecurity && hasPhone && hasJobDetails) return true;

  // Genel "güvenlik" — sohbet değilse maaş+telefon veya güçlü alım yeterli
  if (broadSecurity && salary && hasPhone) return true;
  if (broadSecurity && hiringStrong && (salary || hasPhone || hasJobDetails)) return true;

  return false;
}

export function extractWorkType(text: string): string {
  const t = normalizeTr(text);
  if (/part[\s-]?time|part time|yar[ıi]\s+zamanl[ıi]|g[üu]nl[üu]k|ek\s+i[şs]/.test(t)) return "Part Time";
  if (/vardiya|2\s*\/\s*2|4\s*\/\s*2|12\s*\/\s*36|12\s*\/\s*24|gece/.test(t)) return "Vardiyalı";
  if (/proje|dönemsel|ge[çc]ici/.test(t)) return "Proje Bazlı";
  return "Tam Zamanlı";
}

export function extractCompany(text: string, fallback?: string): string {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const labeled = text.match(/(?:firma|şirket|kurum|proje)\s*[:\-]\s*([^\n,.]+)/i);
  if (labeled?.[1]) return labeled[1].trim().slice(0, 60);
  const projectLine = lines.find(l => /(avm|site|metro|hastane|fabrika|depo|lojistik|otel|belediye|okul|plaza|rezidans)/i.test(l));
  if (projectLine) return projectLine.replace(/(?:aranıyor|alınacak|güvenlik|personel|görevlisi)/gi, "").trim().slice(0, 60) || (fallback ?? "Belirtilmemiş");
  return fallback ?? "Belirtilmemiş";
}

export function extractProjectType(text: string): string {
  const t = normalizeTr(text);
  const entries: [RegExp, string][] = [
    [/metro|metrob[üu]s|marmaray|istasyon/, "Metro"],
    [/avm|alışveriş|ma[ğg]aza|market/, "AVM"],
    [/site|rezidans|konut|apartman/, "Site"],
    [/fabrika|sanayi|üretim|tesis|osb/, "Fabrika"],
    [/depo|lojistik|ambar|kargo/, "Depo"],
    [/belediye|kamu|kurum/, "Belediye"],
    [/hastane|sa[ğg]l[ıi]k|klinik|acil/, "Hastane"],
    [/otel|resort|turizm/, "Otel"],
    [/okul|kamp[üu]s|üniversite|e[ğg]itim/, "Okul"],
    [/plaza|ofis|iş merkezi/, "Plaza"],
    [/havaalan[ıi]|havaliman[ıi]|terminal/, "Terminal"],
  ];
  return entries.find(([re]) => re.test(t))?.[1] ?? "Özel Güvenlik";
}

export function extractTitle(text: string): string {
  const t = normalizeTr(text);
  const location = extractLocation(text);
  const project = extractProjectType(text);
  let role = "Güvenlik Personeli";
  if (/silahl[ıi]/.test(t)) role = "Silahlı Güvenlik Görevlisi";
  else if (/silahs[ıi]z/.test(t)) role = "Silahsız Güvenlik Görevlisi";
  else if (/amir/.test(t)) role = "Güvenlik Amiri";
  else if (/şef|sef/.test(normalize(t))) role = "Güvenlik Şefi";
  else if (/dan[ıi][şs]ma|resepsiyon/.test(t)) role = "Güvenlik Danışma Personeli";
  const loc = location.district ?? location.city ?? "Türkiye";
  return `${role}${project !== "Özel Güvenlik" ? ` (${project})` : ""}${loc ? ` — ${loc}` : ""}`;
}

export function buildListingRequirements(input: {
  gender: string | null;
  location: ParsedLocation;
  benefits: string[];
  contactName?: string | null;
  projectType?: string;
  source?: string;
}): string {
  return [
    `Cinsiyet: ${input.gender ?? "Belirtilmemiş"}`,
    input.location.display ? `Lokasyon: ${input.location.display}` : null,
    input.projectType ? `Proje Tipi: ${input.projectType}` : null,
    input.benefits.length ? `Yan Haklar: ${input.benefits.join(", ")}` : null,
    input.contactName ? `Yetkili: ${input.contactName}` : null,
    input.source ? `Kaynak: ${input.source}` : null,
  ].filter(Boolean).join("\n");
}

export function createSmartListingImage(text: string, title: string): string {
  const project = extractProjectType(text);
  const location = extractLocation(text);
  const palette: Record<string, [string, string, string]> = {
    Metro: ["#0f172a", "#2563eb", "#22d3ee"],
    AVM: ["#1e1b4b", "#7c3aed", "#f472b6"],
    Site: ["#052e16", "#16a34a", "#86efac"],
    Fabrika: ["#111827", "#f97316", "#facc15"],
    Depo: ["#172554", "#0891b2", "#67e8f9"],
    Belediye: ["#450a0a", "#dc2626", "#fca5a5"],
    Hastane: ["#042f2e", "#0d9488", "#99f6e4"],
    Otel: ["#422006", "#d97706", "#fde68a"],
    Okul: ["#312e81", "#4f46e5", "#c4b5fd"],
    Plaza: ["#0f172a", "#64748b", "#e2e8f0"],
    Terminal: ["#0c4a6e", "#0284c7", "#bae6fd"],
    "Özel Güvenlik": ["#020617", "#1d4ed8", "#38bdf8"],
  };
  const [a, b, c] = palette[project] ?? palette["Özel Güvenlik"]!;
  const safeTitle = title.replace(/[<>&"]/g, "");
  const loc = (location.display ?? "Türkiye").replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 450"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity=".35"/></filter></defs><rect width="900" height="450" fill="url(#g)"/><circle cx="760" cy="80" r="180" fill="#fff" opacity=".08"/><circle cx="110" cy="390" r="160" fill="#000" opacity=".18"/><path d="M450 70l150 55v105c0 92-62 142-150 180-88-38-150-88-150-180V125l150-55z" fill="#fff" opacity=".14"/><path d="M450 104l112 41v84c0 66-43 105-112 136-69-31-112-70-112-136v-84l112-41z" fill="#fff" opacity=".18"/><text x="54" y="86" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#fff" opacity=".95">ÖZEL GÜVENLİK</text><text x="54" y="136" font-family="Arial, sans-serif" font-size="54" font-weight="900" fill="#fff" filter="url(#s)">${project}</text><text x="54" y="205" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#fff" opacity=".92">${safeTitle.slice(0, 38)}</text><text x="54" y="258" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#e0f2fe">${loc}</text><text x="535" y="405" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#fff" opacity=".18" transform="rotate(-18 535 405)">ÖZEL GÜVENLİK</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
