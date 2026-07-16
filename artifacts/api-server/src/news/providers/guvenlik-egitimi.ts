import {
  absolutizeContentImages,
  absolutizeUrl,
  cleanNewsTitle,
  decodeHtmlEntities,
  fetchText,
  makeExcerpt,
  sanitizeNewsHtml,
  stripHtml,
} from "../utils";
import { metaContent, pickCoverImage } from "./cover";
import type { NewsListItem, NewsProvider, NormalizedArticle } from "./types";

export const DEFAULT_EGITIM_BASE = "https://www.guvenlikegitimi.com";
export const DEFAULT_EGITIM_LISTING = "https://www.guvenlikegitimi.com/duyurular/";
const FEED_URL = "https://www.guvenlikegitimi.com/feed/";

function unwrapCdata(s: string): string {
  return decodeHtmlEntities(
    String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .trim(),
  );
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.search = "";
    if (u.hostname === "guvenlikegitimi.com") u.hostname = "www.guvenlikegitimi.com";
    return u.href.replace(/\/$/, "") + "/";
  } catch {
    return raw.trim();
  }
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

function parseRssItems(xml: string): NewsListItem[] {
  const out: NewsListItem[] = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/gi) || []) {
    const link = unwrapCdata((item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
    if (!link || !/guvenlikegitimi\.com/i.test(link)) continue;
    const pub = unwrapCdata((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
    const d = pub ? new Date(pub) : null;
    out.push({
      sourceUrl: normalizeUrl(link),
      lastmod: d && !Number.isNaN(d.getTime()) ? d : null,
    });
  }
  return out;
}

function parseListingLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<h2[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/gi)) {
    out.push(normalizeUrl(m[1]));
  }
  return [...new Set(out)];
}

export const guvenlikEgitimiProvider: NewsProvider = {
  key: "guvenlik_egitimi",

  async getArticleList(opts) {
    const listing = opts.listingUrl?.trim() || DEFAULT_EGITIM_LISTING;
    const urls = new Map<string, Date | null>();

    const feed = await fetchText(FEED_URL);
    if (feed.ok) {
      for (const item of parseRssItems(feed.text)) {
        urls.set(item.sourceUrl, item.lastmod ?? null);
      }
    }

    const page = await fetchText(listing);
    if (page.ok) {
      for (const u of parseListingLinks(page.text)) {
        if (!urls.has(u)) urls.set(u, null);
      }
    }

    if (!urls.size) throw new Error("Güvenlik Eğitimi listesi boş");
    return [...urls.entries()].map(([sourceUrl, lastmod]) => ({ sourceUrl, lastmod }));
  },

  async getArticleDetail(url, hint) {
    const pageUrl = normalizeUrl(url);
    const res = await fetchText(pageUrl);
    if (!res.ok) return null;
    const html = res.text;

    const h1 = stripHtml((html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
      || [])[1] || "");
    const ogTitle = metaContent(html, "og:title");
    const title = cleanNewsTitle(ogTitle || h1 || "");
    if (!title || title.length < 8) return null;

    const ogDesc = metaContent(html, "og:description");
    // Makale gövdesi: article içindeki entry-content tercih
    const articleBlock = (html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || [])[1] || html;
    let raw = extractBalancedByClass(articleBlock, "entry-content")
      || extractBalancedByClass(articleBlock, "post-content")
      || extractBalancedByClass(html, "entry-content");
    raw = raw
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<(?:div|aside)[^>]*(?:sharedaddy|jp-related|comments|sidebar)[^>]*>[\s\S]*?<\/(?:div|aside)>/gi, "");

    let contentHtml = sanitizeNewsHtml(raw);
    contentHtml = absolutizeContentImages(contentHtml, pageUrl);
    contentHtml = decodeHtmlEntities(contentHtml);
    const plain = stripHtml(contentHtml);
    const excerpt = makeExcerpt(ogDesc || plain || title);
    if (!excerpt || excerpt.length < 8) return null;
    if (plain.length < 40) contentHtml = `<p>${makeExcerpt(excerpt, 800)}</p>`;

    const coverImage = pickCoverImage(html, pageUrl, contentHtml);

    let sourcePublishedAt: Date | null = hint?.lastmod ?? null;
    const time = (html.match(/<time[^>]+datetime=["']([^"']+)["']/i) || [])[1];
    if (time) {
      const d = new Date(time);
      if (!Number.isNaN(d.getTime())) sourcePublishedAt = d;
    }

    const canonical = metaContent(html, "og:url")
      || (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || [])[1]
      || pageUrl;

    return {
      title,
      excerpt,
      contentHtml: contentHtml || `<p>${excerpt}</p>`,
      coverImage,
      category: "Eğitim ve Sınav",
      authorName: null,
      sourceUrl: pageUrl,
      canonicalUrl: absolutizeUrl(pageUrl, canonical),
      sourcePublishedAt,
      sourcePublishedMissing: !sourcePublishedAt,
      tags: ["egitim"],
    };
  },
};
