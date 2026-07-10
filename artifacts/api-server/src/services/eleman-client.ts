import { logger } from "../lib/logger";
import { extractPhoneNumber } from "../lib/job-parsing";

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
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
  // Sadece özel güvenlik / güvenlik görevlisi ilanları
  const ok = /(?:özel\s+güvenlik|ögg\b|güvenlik\s+görevlisi|güvenlik\s+personeli|kimlikli\s+güvenlik|silahl[ıi]\s+güvenlik|silahs[ıi]z\s+güvenlik|5188)/.test(t);
  if (!ok) return false;
  // Açıkça başka meslek
  if (/(?:temizlik\s+personeli|aşçı|garson|kurye|şoför|muhasebe|yazılım|satış\s+danışmanı)/.test(t) && !/güvenlik/.test(t)) {
    return false;
  }
  return true;
}

function cleanElemanDescription(text: string): string {
  return text
    .replace(/Eleman\.net['']?te yayınlanmaktadır\.?\s*İlan No:\s*\d+/gi, "")
    .replace(/Eleman\.net['']?te yayınlanmaktadır\.?/gi, "")
    .replace(/Kaynak:\s*Eleman\.net/gi, "")
    .replace(/İlan URL:\s*\S+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseElemanDetailHtml(html: string, item: ElemanListItem): ElemanJobDetail | null {
  const job = getJsonLdJobPosting(html);
  const title = typeof job?.title === "string" ? job.title : item.title;
  let description = typeof job?.description === "string" ? decodeHtml(job.description) : "";
  if (!description || description.length < 40) {
    description = decodeHtml(html);
  }
  description = cleanElemanDescription(description);

  if (!isOzelGuvenlikJob(title, description)) {
    logger.info({ id: item.id, title }, "eleman: özel güvenlik değil — atlandı");
    return null;
  }

  const company = job?.hiringOrganization;
  const companyName = typeof company === "object" && company !== null && typeof (company as Record<string, unknown>).name === "string"
    ? (company as Record<string, unknown>).name as string
    : null;
  const phone = extractPhoneNumber(`${description}\n${title}`);
  // Detayda numara yoksa HTML'in ilgili kısmından dene (footer/script hariç kısaltılmış)
  const phoneFallback = phone || extractPhoneNumber(html.slice(0, 60_000));
  if (!phoneFallback) return null;

  const rawText = [title, companyName, description, `Telefon: ${phoneFallback}`]
    .filter(Boolean)
    .join("\n\n");
  return { ...item, title, companyName, description, phone: phoneFallback, rawText };
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
