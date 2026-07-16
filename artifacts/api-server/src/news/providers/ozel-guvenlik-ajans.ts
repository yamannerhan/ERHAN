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
import type { NewsListItem, NewsProvider, NormalizedArticle } from "./types";

const DEFAULT_BASE = "https://www.ozelguvenlikajans.com";
const DEFAULT_LISTING = "https://www.ozelguvenlikajans.com/haberler/guncel/";
const RSS_URL = "https://ozelguvenlikajans.com/rss.xml";

function normalizeArticleUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.search = "";
    if (u.hostname === "ozelguvenlikajans.com") u.hostname = "www.ozelguvenlikajans.com";
    return u.href.replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

function unwrapCdata(s: string): string {
  return decodeHtmlEntities(
    String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  return decodeHtmlEntities((html.match(re) || html.match(re2) || [])[1]?.trim() || "") || null;
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

function parseTrDateTime(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4] || "12"}:${m[5] || "00"}:00+03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isBadCover(url: string): boolean {
  const u = url.toLowerCase();
  return /\/logo\/|favicon|sprite|\/icon|avatar|placeholder|advert|reklam|1x1|pixel|banner/.test(u);
}

async function loadRssDates(): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  try {
    const res = await fetchText(RSS_URL);
    if (!res.ok) return map;
    const items = res.text.match(/<item>[\s\S]*?<\/item>/gi) || [];
    for (const item of items) {
      const link = unwrapCdata((item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
      const pub = unwrapCdata((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
      if (!link) continue;
      const d = pub ? new Date(pub) : null;
      if (d && !Number.isNaN(d.getTime())) {
        map.set(normalizeArticleUrl(link), d);
        // www'siz anahtar da
        map.set(normalizeArticleUrl(link.replace("www.", "")), d);
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

function parseListingLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["'](https?:\/\/(?:www\.)?ozelguvenlikajans\.com\/haber\/[^"']+\.html)["']/gi)) {
    out.push(normalizeArticleUrl(m[1]));
  }
  return [...new Set(out)];
}

export const ozelGuvenlikAjansProvider: NewsProvider = {
  key: "ozel_guvenlik_ajans",

  async getArticleList(opts) {
    const listing = opts.listingUrl?.trim() || DEFAULT_LISTING;
    const res = await fetchText(listing);
    if (!res.ok) throw new Error(`Liste HTTP ${res.status}`);
    const urls = parseListingLinks(res.text);
    const dates = await loadRssDates();
    return urls.map((sourceUrl): NewsListItem => ({
      sourceUrl,
      lastmod: dates.get(sourceUrl) || dates.get(sourceUrl.replace("www.", "")) || null,
    }));
  },

  async getArticleDetail(url, hint) {
    const pageUrl = normalizeArticleUrl(url);
    const res = await fetchText(pageUrl);
    if (!res.ok) return null;
    const html = res.text;

    const h1 = stripHtml((html.match(/<h1[^>]*class=["'][^"']*article-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
      || [])[1] || "");
    const ogTitle = metaContent(html, "og:title");
    const title = cleanNewsTitle(ogTitle || h1 || "");
    if (!title || title.length < 8) return null;

    const articleDesc = stripHtml(
      (html.match(/<p[^>]*class=["'][^"']*article-description[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "",
    );
    const ogDesc = metaContent(html, "og:description");

    let rawContent = extractBalancedByClass(html, "article-text");
    // reklam / boş satır temizliği
    rawContent = rawContent
      .replace(/<div[^>]*class=["'][^"']*g-ads[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "");

    let contentHtml = sanitizeNewsHtml(rawContent);
    contentHtml = absolutizeContentImages(contentHtml, pageUrl);
    contentHtml = decodeHtmlEntities(contentHtml);
    const plain = stripHtml(contentHtml);
    if (plain.length < 40 && !articleDesc && !ogDesc) return null;

    if (plain.length < 40) {
      contentHtml = `<p>${makeExcerpt(articleDesc || ogDesc || title, 800)}</p>`;
    }

    const excerpt = makeExcerpt(articleDesc || ogDesc || plain || title);
    const ogImage = resolveNewsImageUrl(metaContent(html, "og:image"), pageUrl);
    const contentImg = resolveNewsImageUrl(
      (contentHtml.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1],
      pageUrl,
    );
    const coverImage = (ogImage && !isBadCover(ogImage) ? ogImage : null)
      || (contentImg && !isBadCover(contentImg) ? contentImg : null);

    const dateRaw = (html.match(/class=["']date["'][^>]*>\s*([^<]+)/i) || [])[1]?.trim();
    let sourcePublishedAt = parseTrDateTime(dateRaw)
      || (hint?.lastmod ?? null);
    let sourcePublishedMissing = !sourcePublishedAt;
    if (!sourcePublishedAt) {
      sourcePublishedMissing = true;
    }

    const canonical = metaContent(html, "og:url")
      || (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || [])[1]
      || pageUrl;

    return {
      title,
      excerpt,
      contentHtml: contentHtml || `<p>${excerpt}</p>`,
      coverImage,
      category: "Güncel",
      authorName: null,
      sourceUrl: pageUrl,
      canonicalUrl: absolutizeUrl(pageUrl, canonical),
      sourcePublishedAt,
      sourcePublishedMissing,
      tags: ["guncel"],
    } satisfies NormalizedArticle;
  },
};

export { DEFAULT_BASE, DEFAULT_LISTING };
