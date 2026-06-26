// Telegram/elle eklenen ilan metinlerinden akıllı ilan bilgisi çıkarımı.
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
  gebze: { city: "Kocaeli", district: "Gebze" }, darıca: { city: "Kocaeli", district: "Darıca" },
  çayırova: { city: "Kocaeli", district: "Çayırova" }, dilovası: { city: "Kocaeli", district: "Dilovası" },
  keçiören: { city: "Ankara", district: "Keçiören" }, çankaya: { city: "Ankara", district: "Çankaya" },
  yenimahalle: { city: "Ankara", district: "Yenimahalle" }, sincan: { city: "Ankara", district: "Sincan" },
  etimesgut: { city: "Ankara", district: "Etimesgut" }, mamak: { city: "Ankara", district: "Mamak" },
  pursaklar: { city: "Ankara", district: "Pursaklar" }, bornova: { city: "İzmir", district: "Bornova" },
  buca: { city: "İzmir", district: "Buca" }, karşıyaka: { city: "İzmir", district: "Karşıyaka" },
  konak: { city: "İzmir", district: "Konak" }, torbalı: { city: "İzmir", district: "Torbalı" },
  nilüfer: { city: "Bursa", district: "Nilüfer" }, osmangazi: { city: "Bursa", district: "Osmangazi" },
  yıldırım: { city: "Bursa", district: "Yıldırım" }, inegöl: { city: "Bursa", district: "İnegöl" },
};

const NEIGHBORHOODS: Record<string, { city: string; district?: string; neighborhood: string }> = {
  kıraç: { city: "İstanbul", district: "Esenyurt", neighborhood: "Kıraç" },
  hadımköy: { city: "İstanbul", district: "Arnavutköy", neighborhood: "Hadımköy" },
  ikitelli: { city: "İstanbul", district: "Başakşehir", neighborhood: "İkitelli" },
  dudullu: { city: "İstanbul", district: "Ümraniye", neighborhood: "Dudullu" },
  tuzlaosb: { city: "İstanbul", district: "Tuzla", neighborhood: "Tuzla OSB" },
  ostim: { city: "Ankara", district: "Yenimahalle", neighborhood: "OSTİM" },
  aosb: { city: "İzmir", district: "Çiğli", neighborhood: "Atatürk OSB" },
  nosab: { city: "Bursa", district: "Nilüfer", neighborhood: "NOSAB" },
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

function moneyToNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const clean = raw.replace(/[^\d]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) && n >= 1000 ? n : null;
}

function formatTL(n: number): string {
  return `${n.toLocaleString("tr-TR")} TL`;
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

  const total = tl.match(new RegExp(`toplam\\s+(?:hakedi[şs]|kazan[çc]|[üu]cret|paket)\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`));
  if (total && rangeInfo.total) return `${formatTL(rangeInfo.total)} Toplam`;

  const binLabeled = tl.match(/(?:maa[şs]|[üu]cret|net|ayl[ıi]k|hakedi[şs])\D{0,12}(\d{1,3})\s*bin/);
  const binCur = tl.match(/(\d{1,3})\s*bin\s*(?:tl|₺|lira)/);
  const bin = binLabeled ?? binCur;
  if (bin) {
    const n = parseInt(bin[1]!, 10);
    if (n >= 10 && n <= 200) return `${n}.000 TL`;
  }

  const labeled = tl.match(new RegExp(`(?:maa[şs]|[üu]cret|ayl[ıi]k|net\\s+maa[şs]|ele\\s+ge[çc]en)\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`));
  if (labeled) {
    return `${labeled[1]} TL`;
  }

  const range = tl.match(new RegExp(`${NUM}\\s*[-–]\\s*${NUM}\\s*${CUR}`));
  if (range) return `${range[1]}-${range[2]} TL`;

  const generic = tl.match(new RegExp(`${NUM}\\s*${CUR}`));
  if (generic) return `${generic[1]} TL`;

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

export function extractLocation(text: string): ParsedLocation {
  const plain = normalizeTr(text);
  const ascii = normalize(text);

  for (const [key, loc] of Object.entries(NEIGHBORHOODS)) {
    if (ascii.includes(normalize(key)) || plain.includes(loc.neighborhood.toLocaleLowerCase("tr-TR"))) {
      const display = [loc.city, loc.district, loc.neighborhood].filter(Boolean).join(" / ");
      return { city: loc.city, district: loc.district ?? null, neighborhood: loc.neighborhood, display };
    }
  }

  for (const [key, loc] of Object.entries(DISTRICT_TO_CITY)) {
    if (ascii.includes(normalize(key)) || plain.includes(loc.district.toLocaleLowerCase("tr-TR"))) {
      return { city: loc.city, district: loc.district, neighborhood: null, display: `${loc.city} / ${loc.district}` };
    }
  }

  for (const [key, city] of Object.entries(CITY_DISPLAY)) {
    if (ascii.includes(normalize(key)) || plain.includes(city.toLocaleLowerCase("tr-TR"))) {
      return { city, district: null, neighborhood: null, display: city };
    }
  }

  return { city: null, district: null, neighborhood: null, display: null };
}

export function isJobSeekerPost(text: string): boolean {
  const t = normalizeTr(text);
  return /(?:i[şs]\s+ar[ıi]yorum|i[şs]\s+bak[ıi]yorum|i[şs]\s+istiyorum|g[üu]venlik\s+i[şs]i\s+ar[ıi]yorum|çalışmak\s+istiyorum|sertifikam\s+var|kimli[ğg]im\s+var|tecr[üu]beliyim|cv|özgeçmiş)/.test(t)
    && !/(?:aran[ıi]yor|al[ıi]nacak|al[ıi]m[ıi]|personel\s+al[ıi]m[ıi]|eleman\s+al[ıi]m[ıi]|görevlisi\s+aran[ıi]yor)/.test(t);
}

export function isSecurityJobPosting(text: string): boolean {
  if (isJobSeekerPost(text) || text.length < 40) return false;
  const t = normalizeTr(text);
  const security = /(özel\s+g[üu]venlik|g[üu]venlik\s+görevlisi|g[üu]venlik\s+personeli|g[üu]venlik|ögg|ogg|silahl[ıi]|silahs[ıi]z|5188|kimlikli|sertifikal[ıi])/.test(t);
  const hiring = /(aran[ıi]yor|al[ıi]nacak|al[ıi]m[ıi]|al[ıi]n[ıi]cakt[ıi]r|ihtiya[çc]|personel|eleman|tak[ıi]m\s+arkada[şs][ıi]|görevlisi|bay|bayan|bay\s*\/\s*bayan|bay-bayan)/.test(t);
  const details = /(?:0|\+90)?5\d{9}|maa[şs]|[üu]cret|vardiya|servis|yemek|sgk|başvuru|ileti[şs]im|proje|avm|site|fabrika|depo|hastane|metro/.test(t);
  return security && (hiring || details);
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
