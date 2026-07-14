import { logger } from "../lib/logger";
import { extractPhoneNumbers } from "../lib/job-parsing";

const BASE = "https://www.eleman.net";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const ELEMAN_CITY_LIST: Array<{ slug: string; name: string }> = [
  { slug: "istanbul-avrupa", name: "İstanbul Avrupa" }, { slug: "istanbul-anadolu", name: "İstanbul Anadolu" },
  { slug: "adana", name: "Adana" }, { slug: "adiyaman", name: "Adıyaman" }, { slug: "afyon", name: "Afyonkarahisar" },
  { slug: "agri", name: "Ağrı" }, { slug: "amasya", name: "Amasya" }, { slug: "ankara", name: "Ankara" }, { slug: "antalya", name: "Antalya" },
  { slug: "artvin", name: "Artvin" }, { slug: "aydin", name: "Aydın" }, { slug: "balikesir", name: "Balıkesir" }, { slug: "bilecik", name: "Bilecik" },
  { slug: "bingol", name: "Bingöl" }, { slug: "bitlis", name: "Bitlis" }, { slug: "bolu", name: "Bolu" }, { slug: "burdur", name: "Burdur" },
  { slug: "bursa", name: "Bursa" }, { slug: "canakkale", name: "Çanakkale" }, { slug: "cankiri", name: "Çankırı" }, { slug: "corum", name: "Çorum" },
  { slug: "denizli", name: "Denizli" }, { slug: "diyarbakir", name: "Diyarbakır" }, { slug: "edirne", name: "Edirne" }, { slug: "elazig", name: "Elazığ" },
  { slug: "erzincan", name: "Erzincan" }, { slug: "erzurum", name: "Erzurum" }, { slug: "eskisehir", name: "Eskişehir" }, { slug: "gaziantep", name: "Gaziantep" },
  { slug: "giresun", name: "Giresun" }, { slug: "gumushane", name: "Gümüşhane" }, { slug: "hakkari", name: "Hakkari" }, { slug: "hatay", name: "Hatay" },
  { slug: "isparta", name: "Isparta" }, { slug: "izmir", name: "İzmir" }, { slug: "kars", name: "Kars" }, { slug: "kastamonu", name: "Kastamonu" },
  { slug: "kayseri", name: "Kayseri" }, { slug: "kirklareli", name: "Kırklareli" }, { slug: "kirsehir", name: "Kırşehir" }, { slug: "kocaeli", name: "Kocaeli" },
  { slug: "konya", name: "Konya" }, { slug: "kutahya", name: "Kütahya" }, { slug: "malatya", name: "Malatya" }, { slug: "manisa", name: "Manisa" },
  { slug: "kahramanmaras", name: "Kahramanmaraş" }, { slug: "mardin", name: "Mardin" }, { slug: "mugla", name: "Muğla" }, { slug: "mus", name: "Muş" },
  { slug: "nevsehir", name: "Nevşehir" }, { slug: "nigde", name: "Niğde" }, { slug: "ordu", name: "Ordu" }, { slug: "rize", name: "Ri" + "ze" },
  { slug: "sakarya", name: "Sakarya" }, { slug: "samsun", name: "Samsun" }, { slug: "siirt", name: "Siirt" }, { slug: "sinop", name: "Sinop" },
  { slug: "sivas", name: "Sivas" }, { slug: "tekirdag", name: "Tekirdağ" }, { slug: "tokat", name: "Tokat" }, { slug: "trabzon", name: "Trabzon" },
  { slug: "tunceli", name: "Tunceli" }, { slug: "sanliurfa", name: "Şanlıurfa" }, { slug: "usak", name: "Uşak" }, { slug: "van", name: "Van" },
  { slug: "yozgat", name: "Yozgat" }, { slug: "zonguldak", name: "Zonguldak" }, { slug: "aksaray", name: "Aksaray" }, { slug: "bayburt", name: "Bayburt" },
  { slug: "karaman", name: "Karaman" }, { slug: "kirikkale", name: "Kırıkkale" }, { slug: "batman", name: "Batman" }, { slug: "sirnak", name: "Şırnak" },
  { slug: "bartin", name: "Bartın" }, { slug: "ardahan", name: "Ardahan" }, { slug: "igdir", name: "Iğdır" }, { slug: "yalova", name: "Yalova" },
  { slug: "karabuk", name: "Karabük" }, { slug: "kilis", name: "Kilis" }, { slug: "osmaniye", name: "Osmaniye" }, { slug: "duzce", name: "Düzce" },
  { slug: "mersin", name: "Mersin" },
];

export interface ElemanListItem {
  id: string;
  title: string;
  url: string;
}

export interface ElemanJobDetail extends ElemanListItem {
  companyName: string | null;
  description: string;
  phone: string;
  rawText: string;
  postedAt?: Date | null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Script/style/nav çöplerini at — tüm sayfa HTML'ini açıklama sanma. */
function stripPageChrome(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function absoluteUrl(url: string): string {
  return new URL(url, BASE).toString();
}

export function buildElemanListUrl(citySlug: string | null, page: number): string {
  const path = citySlug ? `/is-ilanlari/${citySlug}` : "/is-ilanlari";
  const url = new URL(path, BASE);
  url.searchParams.set("aranan", "Ozel Guvenlik Gorevlisi");
  url.searchParams.set("arandi", "e");
  url.searchParams.set("telefonla_basvuru_ilanlari", "1");
  url.searchParams.set("sy", String(Math.max(1, page)));
  return url.toString();
}

export function parseElemanListingId(url: string): string | null {
  const match = url.match(/-i(\d+)(?:[/?#]|$)/i) ?? url.match(/\/is-ilani\/(\d+)(?:[/?#]|$)/i);
  return match?.[1] ?? null;
}

export function parseElemanListHtml(html: string): ElemanListItem[] {
  const results = new Map<string, ElemanListItem>();
  for (const section of html.split(/ilan_listeleme_bol/i).slice(1)) {
    const link = section.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']*\/is-ilani\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = absoluteUrl(link[1]!);
    const id = parseElemanListingId(url);
    const title = decodeHtml(link[2]!);
    if (id && title) results.set(id, { id, title, url });
  }
  return [...results.values()];
}

function getJsonLdJobPosting(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const parsed: unknown = JSON.parse(script[1]!);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const job = entries.find((entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null &&
        ((entry as Record<string, unknown>)["@type"] === "JobPosting"
          || (Array.isArray((entry as Record<string, unknown>)["@type"])
            && ((entry as Record<string, unknown>)["@type"] as unknown[]).includes("JobPosting"))),
      );
      if (job) return job;
    } catch {
      // Ignore malformed structured-data blocks and continue searching.
    }
  }
  return null;
}

function isOzelGuvenlikJob(title: string, description: string): boolean {
  const t = `${title}\n${description}`.toLocaleLowerCase("tr-TR");
  const ok = /(?:özel\s+güvenlik|ögg\b|güvenlik\s+görevlisi|güvenlik\s+personeli|kimlikli\s+güvenlik|silahl[ıi]\s+güvenlik|silahs[ıi]z\s+güvenlik|5188|guvenlik\s+gorevlisi|ozel\s+guvenlik)/.test(t);
  if (!ok) return false;
  if (/(?:temizlik\s+personeli|aşçı|garson|kurye|şoför|muhasebe|yazılım|satış\s+danışmanı)/.test(t) && !/güvenlik|guvenlik/.test(t)) {
    return false;
  }
  return true;
}

/** Filtre menüsü / index / JS çöpü mü? */
function isGarbageDescription(text: string): boolean {
  if (!text || text.length < 20) return true;
  const lower = text.toLocaleLowerCase("tr-TR");
  if (/function\s*\(|=>\s*\{|document\.|window\.|var\s+\w+\s*=|const\s+\w+\s*=/.test(text)) return true;
  if (/#####\s*(şehir|pozisyon|bölüm|sektör)/i.test(text)) return true;
  if (/arama seçimleriniz|detaylı ara|haritada göster|kelimeyi en uygun/i.test(lower)) return true;
  // Uzun sektör/bölüm index listeleri
  const indexHits = (lower.match(/\b(?:acente|ambulans|anestezi|arge|bordro|cnc|depo|eczane|finans|grafik|ihracat|ithalat|kalite|lojistik|muhasebe|pazarlama|sekreterlik|yazılım)\b/g) || []).length;
  if (indexHits >= 8 && !/güvenlik|guvenlik|ögg|ogg/.test(lower)) return true;
  if (indexHits >= 12) return true;
  // Aşırı uzun ve güvenlik kelimesi yok
  if (text.length > 4000 && !/güvenlik|guvenlik|ögg|5188/.test(lower)) return true;
  return false;
}

function cleanElemanDescription(text: string): string {
  return text
    .replace(/Eleman\.net['']?te yayınlanmaktadır\.?\s*İlan No:\s*\d+/gi, "")
    .replace(/Eleman\.net['']?te\s+yayınlanmaktadır\.?/gi, "")
    .replace(/bu\s+ilan\s+eleman\.net[^\n]*/gi, "")
    .replace(/ilan\s+(?:eleman\.net|eleman\s*net)[^\n]*/gi, "")
    .replace(/başvuru\s+için\s+eleman\.net[^\n]*/gi, "")
    .replace(/detay(?:lı|li)?\s+(?:bilgi|başvuru).*eleman\.net[^\n]*/gi, "")
    .replace(/www\.eleman\.net\/[^\s]*/gi, "")
    .replace(/https?:\/\/(?:www\.)?eleman\.net\/[^\s]*/gi, "")
    .replace(/\beleman\.net\b/gi, "")
    .replace(/Kaynak\s*:\s*Eleman\.net/gi, "")
    .replace(/İlan\s*(?:No|Numarası|URL|Kodu)\s*[:#]?\s*\S+/gi, "")
    .replace(/Eleman\s*Net/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{3,}/g, " ")
    .trim();
}

/** Açıklamaya telefon(lar) ekle (yoksa); Eleman.net markasını temizle. */
export function finalizeElemanListingText(description: string, phone: string): string {
  let text = cleanElemanDescription(description || "");
  const phones = extractPhoneNumbers(`${phone}\n${text}`);
  if (phones.length === 0 && phone.trim()) {
    const digits = phone.replace(/\D/g, "");
    // ham metin ekle (normalize edilememişse)
    if (digits.length >= 10) {
      text = `${text}\n\nTelefon: ${phone.trim()}`.trim();
    }
    return text;
  }
  const textDigits = text.replace(/\D/g, "");
  const missing = phones.filter((p) => !textDigits.includes(p.slice(-10)));
  if (missing.length) {
    text = `${text}\n\nTelefon: ${missing.join(" / ")}`.trim();
  }
  return text;
}

/** Detay sayfasından yalnızca ilan gövdesini çek — tüm HTML değil. */
function extractDescriptionFromHtml(html: string): string {
  const cleaned = stripPageChrome(html);
  const patterns = [
    /<(?:div|section|article)[^>]*(?:ilan[_-]?detay|job[_-]?desc|description|ilan[_-]?aciklama|ilan_icerik)[^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /<div[^>]*class=["'][^"']*(?:aciklama|description|ilan-detay|detay-icerik)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<(?:p|div)[^>]*itemprop=["']description["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) {
      const text = decodeHtml(m[1]);
      if (text.length >= 40 && !isGarbageDescription(text)) return text;
    }
  }
  // meta description
  const meta = cleaned.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    ?? cleaned.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  if (meta?.[1]) {
    const text = decodeHtml(meta[1]);
    if (text.length >= 40 && !isGarbageDescription(text)) return text;
  }
  return "";
}

export function parseElemanDetailHtml(html: string, item: ElemanListItem): ElemanJobDetail | null {
  const job = getJsonLdJobPosting(html);
  const title = typeof job?.title === "string" ? job.title : item.title;

  let description = "";
  if (typeof job?.description === "string") {
    description = cleanElemanDescription(decodeHtml(job.description));
  }
  if (!description || description.length < 40 || isGarbageDescription(description)) {
    description = cleanElemanDescription(extractDescriptionFromHtml(html));
  }
  // Hâlâ çöp / boşsa sadece başlık kullan — tüm sayfa HTML'ini ASLA alma
  if (!description || isGarbageDescription(description)) {
    description = title;
  }

  if (!isOzelGuvenlikJob(title, description)) {
    logger.info({ id: item.id, title }, "eleman: özel güvenlik değil — atlandı");
    return null;
  }

  const company = job?.hiringOrganization;
  const companyName = typeof company === "object" && company !== null && typeof (company as Record<string, unknown>).name === "string"
    ? (company as Record<string, unknown>).name as string
    : null;

  // Telefon: önce temiz açıklama, sonra sınırlı HTML (script'siz)
  const phoneZone = stripPageChrome(html).slice(0, 80_000);
  const phones = extractPhoneNumbers(`${description}\n${title}\n${phoneZone}`);
  const phone = phones[0] ?? null;
  if (!phone) {
    logger.info({ id: item.id, title }, "eleman: telefon yok — ilan çekilmedi");
    return null;
  }

  let postedAt: Date | null = null;
  const dateRaw = job?.datePosted ?? job?.datePublished;
  if (typeof dateRaw === "string") {
    const d = new Date(dateRaw);
    if (!Number.isNaN(d.getTime())) postedAt = d;
  }

  const phoneJoined = phones.join(",");
  const rawText = [title, companyName, finalizeElemanListingText(description, phoneJoined)]
    .filter(Boolean)
    .join("\n\n");
  return {
    ...item,
    title,
    companyName,
    description: finalizeElemanListingText(description, phoneJoined),
    phone: phoneJoined,
    rawText,
    postedAt,
  };
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) {
      logger.warn({ status: response.status, url }, "Eleman.net request failed");
      return null;
    }
    return await response.text();
  } catch (error) {
    logger.warn({ err: error, url }, "Eleman.net request failed");
    return null;
  }
}

export async function fetchElemanListPage(citySlug: string | null, page: number): Promise<ElemanListItem[]> {
  const html = await fetchHtml(buildElemanListUrl(citySlug, page));
  return html ? parseElemanListHtml(html) : [];
}

export async function fetchElemanJobDetail(item: ElemanListItem): Promise<ElemanJobDetail | null> {
  const html = await fetchHtml(item.url);
  return html ? parseElemanDetailHtml(html, item) : null;
}

export async function scrapeElemanCityPages(
  citySlug: string | null,
  startPage = 1,
  pages = 1,
): Promise<ElemanJobDetail[]> {
  const jobs: ElemanJobDetail[] = [];
  for (let page = Math.max(1, startPage); page < Math.max(1, startPage) + Math.max(1, pages); page += 1) {
    const listings = await fetchElemanListPage(citySlug, page);
    for (const listing of listings) {
      // Liste başlığında güvenlik yoksa detaya girme
      if (!isOzelGuvenlikJob(listing.title, "")) continue;
      await new Promise((r) => setTimeout(r, 350));
      const detail = await fetchElemanJobDetail(listing);
      if (detail) jobs.push(detail);
    }
    if (listings.length === 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return jobs;
}

export function getElemanCityByIndex(index: number): { slug: string; name: string } | null {
  return ELEMAN_CITY_LIST[index] ?? null;
}

export function elemanCityCount(): number {
  return ELEMAN_CITY_LIST.length;
}

export function parseElemanCursor(cursor: string | null | undefined): { cityIndex: number; page: number } {
  const match = cursor?.match(/^(\d+):(\d+)$/);
  return match ? { cityIndex: Number(match[1]), page: Math.max(1, Number(match[2])) } : { cityIndex: 0, page: 1 };
}

export function formatElemanCursor(cityIndex: number, page: number): string {
  return `${Math.max(0, Math.floor(cityIndex))}:${Math.max(1, Math.floor(page))}`;
}
