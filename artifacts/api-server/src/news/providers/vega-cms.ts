/**
 * Vega CMS siteleri (ozelguvenlikajans, ogghaber) için ortak çıkarım.
 */
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

function unwrapCdata(s: string): string {
  return decodeHtmlEntities(
    String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeArticleUrl(raw: string, host: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.search = "";
    const bare = host.replace(/^www\./, "");
    if (u.hostname.replace(/^www\./, "") === bare) {
      u.hostname = host.startsWith("www.") ? host : `www.${bare}`;
    }
    // Orijinal sondaki / korunur (ogghaber), .html için slash yok
    const keepSlash = raw.includes(u.pathname) && raw.replace(u.origin, "").endsWith("/");
    let out = u.href.replace(/\/$/, "");
    if (keepSlash || (!out.endsWith(".html") && /\/haber\//i.test(out))) {
      if (!out.endsWith(".html")) out += "/";
    }
    return out;
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

function parseTrDateTime(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] || "12"}:${m[5] || "00"}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadRssDates(rssUrl: string, host: string): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  try {
    const res = await fetchText(rssUrl);
    if (!res.ok) return map;
    for (const item of res.text.match(/<item>[\s\S]*?<\/item>/gi) || []) {
      const link = unwrapCdata((item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
      const pub = unwrapCdata((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
      if (!link) continue;
      const d = pub ? new Date(pub) : null;
      if (d && !Number.isNaN(d.getTime())) {
        const n = normalizeArticleUrl(link, host);
        map.set(n, d);
        map.set(n.replace(/\/$/, ""), d);
      }
    }
  } catch { /* ignore */ }
  return map;
}

export function createVegaCmsProvider(opts: {
  key: string;
  host: string;
  defaultListing: string;
  rssUrl: string;
  defaultCategory: string;
  articlePathRe: RegExp;
}): NewsProvider {
  const host = opts.host.replace(/^www\./, "");
  const wwwHost = `www.${host}`;

  return {
    key: opts.key,

    async getArticleList(listOpts) {
      const listing = listOpts.listingUrl?.trim() || opts.defaultListing;
      const res = await fetchText(listing);
      if (!res.ok) throw new Error(`Liste HTTP ${res.status}`);
      const urls: string[] = [];
      for (const m of res.text.matchAll(opts.articlePathRe)) {
        urls.push(normalizeArticleUrl(m[1], wwwHost));
      }
      const uniq = [...new Set(urls)];
      const dates = await loadRssDates(opts.rssUrl, wwwHost);
      return uniq.map((sourceUrl): NewsListItem => ({
        sourceUrl,
        lastmod: dates.get(sourceUrl) || dates.get(sourceUrl.replace(/\/$/, "")) || null,
      }));
    },

    async getArticleDetail(url, hint) {
      const pageUrl = normalizeArticleUrl(url, wwwHost);
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
      rawContent = rawContent
        .replace(/<div[^>]*class=["'][^"']*g-ads[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "");

      let contentHtml = sanitizeNewsHtml(rawContent);
      contentHtml = absolutizeContentImages(contentHtml, pageUrl);
      contentHtml = decodeHtmlEntities(contentHtml);
      const plain = stripHtml(contentHtml);

      const excerpt = makeExcerpt(articleDesc || ogDesc || plain || title);
      if (!excerpt || excerpt.length < 8) return null;

      if (plain.length < 40) {
        contentHtml = `<p>${makeExcerpt(excerpt, 800)}</p>`;
      }

      const coverImage = pickCoverImage(html, pageUrl, contentHtml);
      const dateRaw = (html.match(/class=["']date["'][^>]*>\s*([^<]+)/i) || [])[1]?.trim();
      const sourcePublishedAt = parseTrDateTime(dateRaw) || hint?.lastmod || null;

      const canonical = metaContent(html, "og:url")
        || (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || [])[1]
        || pageUrl;

      const catRaw = stripHtml(
        (html.match(/class=["'][^"']*baddi[^"']*["'][^>]*>([\s\S]*?)</i) || [])[1] || "",
      );

      return {
        title,
        excerpt,
        contentHtml: contentHtml || `<p>${excerpt}</p>`,
        coverImage,
        category: catRaw || opts.defaultCategory,
        authorName: null,
        sourceUrl: pageUrl,
        canonicalUrl: absolutizeUrl(pageUrl, canonical),
        sourcePublishedAt,
        sourcePublishedMissing: !sourcePublishedAt,
        tags: [opts.defaultCategory.toLocaleLowerCase("tr-TR")],
      } satisfies NormalizedArticle;
    },
  };
}
