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

const TR_MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, şubat: 2, mart: 3, nisan: 4, mayis: 5, mayıs: 5,
  haziran: 6, temmuz: 7, tem: 7, agustos: 8, ağustos: 8, eylul: 9, eylül: 9,
  ekim: 10, kasim: 11, kasım: 11, aralik: 12, aralık: 12,
};

function absEgm(url: string): string {
  const raw = url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim();
  try {
    const u = new URL(raw, "https://www.egm.gov.tr");
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

function parseHaberlerList(html: string): NewsListItem[] {
  const out: NewsListItem[] = [];
  const blocks = [...html.matchAll(
    /<a[^>]*class=["'][^"']*news-card-horizontal[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  for (const b of blocks) {
    const sourceUrl = absEgm(b[1]);
    if (!/\/ozelguvenlik\//i.test(sourceUrl)) continue;
    // menü / sabit sayfaları ele
    if (/\/(hakkimizda|baskanimiz|teskilat|ucretler|sinav|egitim|istatistik|izin|uniforma)/i.test(sourceUrl)
      && !/faaliyet|istihdam|denetleniyor|calistay|iskur/i.test(sourceUrl)) {
      // allow news-like slugs; skip obvious nav only if very short path segments that are known nav
    }
    const date = parseDotDate((b[2].match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1]);
    out.push({ sourceUrl, lastmod: date });
  }
  // unique
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
    // fallback: tüm ozelguvenlik duyuru linkleri
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

async function getEgmDetail(url: string, hint: { lastmod?: Date | null } | undefined, category: string): Promise<NormalizedArticle | null> {
  const pageUrl = absEgm(url);
  const res = await fetchText(pageUrl);
  if (!res.ok) return null;
  const html = res.text;

  const pageTitle = stripHtml((html.match(/<h2[^>]*class=["'][^"']*page-title[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || "");
  const docTitle = stripHtml((html.match(/<title>([^<]+)/i) || [])[1] || "")
    .replace(/^T\.C\.\s*İçişleri Bakanlığı Emniyet Genel Müdürlüğü\s*-\s*/i, "")
    .trim();
  const title = cleanNewsTitle(pageTitle || docTitle || "");
  if (!title || title.length < 8) return null;

  let raw = extractBalancedByClass(html, "icerik")
    || extractBalancedByClass(html, "detail-content")
    || "";
  raw = raw.replace(/<script[\s\S]*?<\/script>/gi, "");
  let contentHtml = sanitizeNewsHtml(raw);
  contentHtml = absolutizeContentImages(contentHtml, pageUrl);
  contentHtml = decodeHtmlEntities(contentHtml);
  const plain = stripHtml(contentHtml);

  const excerpt = makeExcerpt(plain || title);
  if (!excerpt || excerpt.length < 8) return null;
  if (plain.length < 40) contentHtml = `<p>${makeExcerpt(excerpt, 800)}</p>`;

  const coverImage = pickCoverImage(html, pageUrl, contentHtml)
    || resolveNewsImageUrl(
      (html.match(/class=["'][^"']*card-img[^"']*["'][\s\S]{0,400}?(?:data-src|src)=["']([^"']+)["']/i) || [])[1],
      pageUrl,
    );

  const dateInPage = parseDotDate(html) || hint?.lastmod || null;

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
    const listing = opts.listingUrl?.trim() || "https://www.egm.gov.tr/ozelguvenlik/haberler";
    const res = await fetchText(listing);
    if (!res.ok) throw new Error(`EGM haberler HTTP ${res.status}`);
    return parseHaberlerList(res.text);
  },
  getArticleDetail(url, hint) {
    return getEgmDetail(url, hint, "EGM Haber");
  },
};

export const egmDuyurularProvider: NewsProvider = {
  key: "egm_duyurular",
  async getArticleList(opts) {
    const listing = opts.listingUrl?.trim() || "https://www.egm.gov.tr/ozelguvenlik/duyurular";
    const res = await fetchText(listing);
    if (!res.ok) throw new Error(`EGM duyurular HTTP ${res.status}`);
    return parseDuyurularList(res.text);
  },
  getArticleDetail(url, hint) {
    return getEgmDetail(url, hint, "EGM Duyuru");
  },
};

export const EGM_HABERLER_LISTING = "https://www.egm.gov.tr/ozelguvenlik/haberler";
export const EGM_DUYURULAR_LISTING = "https://www.egm.gov.tr/ozelguvenlik/duyurular";
