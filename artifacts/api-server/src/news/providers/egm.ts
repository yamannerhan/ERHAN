import {
  absolutizeContentImages,
  absolutizeUrl,
  cleanNewsTitle,
  decodeHtmlEntities,
  fetchText,
  makeExcerpt,
  resolveNewsImageUrl,
  sanitizeNewsHtml,
  stripHtml,
} from "../utils";
import { pickCoverImage } from "./cover";
import type { NewsListItem, NewsProvider, NormalizedArticle } from "./types";

const EGM_ORIGIN = "https://www.egm.gov.tr";
const DEFAULT_LISTING = `${EGM_ORIGIN}/ozelguvenlik/haberler`;
const LOAD_MORE_URL = `${EGM_ORIGIN}/ISAYWebPart/ContentList/DahaFazlaYukle`;
const FILTER_URL = `${EGM_ORIGIN}/ISAYWebPart/ContentList/ContentFilter`;
const MAX_LOAD_MORE_PAGES = 40;

const TR_MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, şubat: 2, mart: 3, nisan: 4, mayis: 5, mayıs: 5,
  haziran: 6, temmuz: 7, tem: 7, agustos: 8, ağustos: 8, eylul: 9, eylül: 9,
  ekim: 10, kasim: 11, kasım: 11, aralik: 12, aralık: 12,
};

function absEgm(url: string): string {
  const raw = url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim();
  try {
    const u = new URL(raw, EGM_ORIGIN);
    u.hash = "";
    u.search = "";
    if (u.hostname === "egm.gov.tr") u.hostname = "www.egm.gov.tr";
    return u.href.replace(/\/$/, "");
  } catch {
    return raw;
  }
}

function parseDotDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAnnounceDate(day: string, monthLabel: string): Date | null {
  const mon = TR_MONTHS[monthLabel.toLocaleLowerCase("tr-TR").trim()];
  const dd = Number(day);
  if (!mon || !dd) return null;
  const year = new Date().getFullYear();
  const d = new Date(`${year}-${String(mon).padStart(2, "0")}-${String(dd).padStart(2, "0")}T12:00:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isLikelyNavUrl(url: string): boolean {
  return /\/ozelguvenlik\/(hakkimizda|baskanimiz|teskilat|ucretler|sinav|temel-egitim|yenileme-egitimi|istatistik|izin|uniforma|silah|haberler|duyurular)\/?$/i.test(url);
}

function isBadEgmCover(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.toLowerCase();
  return /logo|favicon|sprite|\/icon|avatar|placeholder|1x1|pixel|banner|ataturk|tasar[iı]m|yenilogo|\/header\//i.test(u)
    || /\.svg(\?|$)/i.test(u);
}

function resolveEgmImage(raw: string | null | undefined, pageUrl: string): string | null {
  if (!raw?.trim()) return null;
  let src = decodeHtmlEntities(raw.trim()).replace(/&amp;/gi, "&");
  // resize parametreli lazy thumb yerine orijinal
  src = src.replace(/\?mode=resize[^"']*$/i, "");
  const abs = resolveNewsImageUrl(src, pageUrl) || absolutizeUrl(pageUrl, src);
  if (!abs || isBadEgmCover(abs)) return null;
  return abs;
}

function extractBalancedByClass(html: string, className: string): string {
  const re = new RegExp(`<div[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, "i");
  const open = html.match(re);
  if (!open || open.index == null) return "";
  const startContent = open.index + open[0].length;
  let i = startContent;
  let depth = 1;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(startContent, nextClose);
      i = nextClose + 6;
    }
  }
  return "";
}

function extractListMeta(html: string): { contentTypeId: string; contentCount: string; orderByAsc: string } {
  const contentTypeId = (html.match(/var\s+ContentTypeId\s*=\s*['"]([^'"]+)['"]/i) || [])[1] || "LhrMIkhqW9zoM3Q3Rlz9KQ==";
  const contentCount = (html.match(/var\s+ContentCount\s*=\s*['"]([^'"]+)['"]/i) || [])[1] || "6";
  const orderByAsc = (html.match(/var\s+OrderByAsc\s*=\s*['"]([^'"]+)['"]/i) || [])[1] || "true";
  return { contentTypeId, contentCount, orderByAsc };
}

/** Liste kartlarından URL + tarih + kapak + başlık */
export function parseHaberlerList(html: string): NewsListItem[] {
  const out: NewsListItem[] = [];
  const blocks = [...html.matchAll(
    /<a[^>]*class=["'][^"']*news-card-horizontal[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  for (const b of blocks) {
    const sourceUrl = absEgm(b[1]);
    if (!/\/ozelguvenlik\//i.test(sourceUrl) || isLikelyNavUrl(sourceUrl)) continue;
    const body = b[2];
    const date = parseDotDate((body.match(/class=["']cardDate["'][^>]*>\s*([^<]+)/i) || body.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1]);
    const title = cleanNewsTitle(stripHtml((body.match(/class=["']card-title["'][^>]*>([\s\S]*?)<\/h5>/i) || [])[1] || ""));
    const imgRaw =
      (body.match(/data-src=["']([^"']+)["']/i) || [])[1]
      || (body.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1]
      || null;
    const coverImage = resolveEgmImage(imgRaw, sourceUrl);
    out.push({
      sourceUrl,
      lastmod: date,
      coverImage,
      title: title || null,
    });
  }
  const seen = new Set<string>();
  return out.filter((x) => {
    if (seen.has(x.sourceUrl)) return false;
    seen.add(x.sourceUrl);
    return true;
  });
}

function parseDuyurularList(html: string): NewsListItem[] {
  const out: NewsListItem[] = [];
  const blocks = [...html.matchAll(
    /<div class=["']ministry-announcements["']>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi,
  )];
  for (const b of blocks) {
    const chunk = b[1];
    const href = (chunk.match(/<a[^>]*class=["'][^"']*announce-text[^"']*["'][^>]*href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const sourceUrl = absEgm(href);
    const day = (chunk.match(/class=["']day["']>\s*(\d{1,2})\s*</i) || [])[1];
    const month = (chunk.match(/class=["']month["']>\s*([^<]+)/i) || [])[1];
    const titleDate = parseDotDate(stripHtml(chunk));
    const lastmod = titleDate || (day && month ? parseAnnounceDate(day, month) : null);
    out.push({ sourceUrl, lastmod });
  }
  if (!out.length) {
    for (const m of html.matchAll(/href=["'](\/\/www\.egm\.gov\.tr\/ozelguvenlik\/[^"']+)["']/gi)) {
      out.push({ sourceUrl: absEgm(m[1]), lastmod: null });
    }
  }
  const seen = new Set<string>();
  return out.filter((x) => {
    if (seen.has(x.sourceUrl)) return false;
    seen.add(x.sourceUrl);
    return true;
  });
}

async function postEgmJson(url: string, body: Record<string, unknown>): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: {
        Accept: "text/html, */*; q=0.01",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: EGM_ORIGIN,
        Referer: DEFAULT_LISTING,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function collectHaberlerList(listingUrl: string): Promise<NewsListItem[]> {
  const listing = listingUrl.trim() || DEFAULT_LISTING;
  const res = await fetchText(listing, 30_000);
  if (!res.ok) throw new Error(`EGM haberler HTTP ${res.status}`);

  const meta = extractListMeta(res.text);
  const byUrl = new Map<string, NewsListItem>();
  const merge = (items: NewsListItem[]) => {
    for (const item of items) {
      const prev = byUrl.get(item.sourceUrl);
      byUrl.set(item.sourceUrl, {
        sourceUrl: item.sourceUrl,
        lastmod: item.lastmod || prev?.lastmod || null,
        coverImage: item.coverImage || prev?.coverImage || null,
        title: item.title || prev?.title || null,
      });
    }
  };

  merge(parseHaberlerList(res.text));

  // «Daha fazla göster» — sayfa 2+ (ilk sayfa HTML’de)
  for (let page = 2; page <= MAX_LOAD_MORE_PAGES; page++) {
    const html = await postEgmJson(LOAD_MORE_URL, {
      page,
      ContentTypeId: meta.contentTypeId,
      OrderByAsc: meta.orderByAsc,
      ContentCount: meta.contentCount,
    });
    if (!html.trim()) break;
    const batch = parseHaberlerList(html);
    if (!batch.length) break;
    merge(batch);
    // Çok eski sayfada kes (lookback + tampon)
    const lookbackCutoff = Date.now() - 100 * 24 * 60 * 60 * 1000;
    if (batch.every((it) => it.lastmod && it.lastmod.getTime() < lookbackCutoff)) break;
  }

  // Son 2 ay tarih filtresi (eksik kalan güncel kartlar için)
  try {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const filtered = await postEgmJson(FILTER_URL, {
      page: 1,
      ContentTypeId: meta.contentTypeId,
      OrderByAsc: meta.orderByAsc,
      ContentCount: "50",
      basTarih: from.toISOString(),
      bitTarih: now.toISOString(),
    });
    if (filtered.trim()) merge(parseHaberlerList(filtered));
  } catch { /* ignore */ }

  return [...byUrl.values()].sort(
    (a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0),
  );
}

async function getEgmDetail(
  url: string,
  hint: { lastmod?: Date | null; coverImage?: string | null; title?: string | null } | undefined,
  category: string,
): Promise<NormalizedArticle | null> {
  const pageUrl = absEgm(url);
  const res = await fetchText(pageUrl, 30_000);
  if (!res.ok) return null;
  const html = res.text;

  const pageTitle = stripHtml((html.match(/<h2[^>]*class=["'][^"']*page-title[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || "");
  const docTitle = stripHtml((html.match(/<title>([^<]+)/i) || [])[1] || "")
    .replace(/^T\.C\.\s*İçişleri Bakanlığı Emniyet Genel Müdürlüğü\s*-\s*/i, "")
    .trim();
  const title = cleanNewsTitle(pageTitle || hint?.title || docTitle || "");
  if (!title || title.length < 8) return null;

  let raw = extractBalancedByClass(html, "icerik")
    || extractBalancedByClass(html, "detail-content")
    || extractBalancedByClass(html, "f-data-content")
    || "";
  raw = raw.replace(/<script[\s\S]*?<\/script>/gi, "");
  // EGM içerik çoğu zaman entity-encoded düz metin + <br />
  raw = decodeHtmlEntities(raw);
  let contentHtml = sanitizeNewsHtml(raw);
  contentHtml = absolutizeContentImages(contentHtml, pageUrl);
  contentHtml = decodeHtmlEntities(contentHtml);
  const plain = stripHtml(contentHtml);

  let excerpt = makeExcerpt(plain || title, 280);
  excerpt = decodeHtmlEntities(excerpt).replace(/\s+/g, " ").trim();
  if (!excerpt || excerpt.length < 8) {
    excerpt = makeExcerpt(title, 280);
  }
  if (!excerpt || excerpt.length < 8) return null;
  if (plain.length < 40) contentHtml = `<p>${makeExcerpt(excerpt, 900)}</p>`;

  const hintCover = resolveEgmImage(hint?.coverImage || null, pageUrl);
  let coverImage =
    hintCover
    || resolveEgmImage(
      (html.match(/class=["'][^"']*card-img[^"']*["'][\s\S]{0,500}?(?:data-src|src)=["']([^"']+)["']/i) || [])[1],
      pageUrl,
    )
    || null;

  if (!coverImage) {
    const picked = pickCoverImage(html, pageUrl, contentHtml);
    if (picked && !isBadEgmCover(picked)) coverImage = picked;
  }

  // İçerikte /IcSite/ görseli varsa tercih et
  if (!coverImage || isBadEgmCover(coverImage)) {
    for (const m of html.matchAll(/(?:data-src|src)=["']([^"']*IcSite\/ozelguvenlik\/[^"']+\.(?:jpe?g|png|webp|jfif)[^"']*)["']/gi)) {
      const hit = resolveEgmImage(m[1], pageUrl);
      if (hit) {
        coverImage = hit;
        break;
      }
    }
  }

  if (!coverImage || isBadEgmCover(coverImage)) coverImage = hintCover;
  if (!coverImage) return null;

  const dateInPage = parseDotDate(
    (html.match(/class=["']cardDate["'][^>]*>\s*([^<]+)/i) || [])[1]
    || (html.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1],
  ) || hint?.lastmod || null;

  return {
    title,
    excerpt,
    contentHtml: contentHtml || `<p>${excerpt}</p>`,
    coverImage,
    category,
    authorName: null,
    sourceUrl: pageUrl,
    canonicalUrl: absolutizeUrl(pageUrl, pageUrl),
    sourcePublishedAt: dateInPage,
    sourcePublishedMissing: !dateInPage,
    tags: [category.toLocaleLowerCase("tr-TR")],
  };
}

export const egmHaberlerProvider: NewsProvider = {
  key: "egm_haberler",
  async getArticleList(opts) {
    const listing = opts.listingUrl?.trim() || DEFAULT_LISTING;
    return collectHaberlerList(listing);
  },
  getArticleDetail(url, hint) {
    return getEgmDetail(url, hint, "EGM Haber");
  },
};

export const egmDuyurularProvider: NewsProvider = {
  key: "egm_duyurular",
  async getArticleList(opts) {
    const listing = opts.listingUrl?.trim() || `${EGM_ORIGIN}/ozelguvenlik/duyurular`;
    const res = await fetchText(listing, 30_000);
    if (!res.ok) throw new Error(`EGM duyurular HTTP ${res.status}`);
    return parseDuyurularList(res.text);
  },
  getArticleDetail(url, hint) {
    return getEgmDetail(url, hint, "EGM Duyuru");
  },
};

export const EGM_HABERLER_LISTING = DEFAULT_LISTING;
export const EGM_DUYURULAR_LISTING = `${EGM_ORIGIN}/ozelguvenlik/duyurular`;
