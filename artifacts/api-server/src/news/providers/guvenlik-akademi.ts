import {
  absolutizeUrl,
  cleanNewsTitle,
  fetchText,
  makeExcerpt,
  sanitizeNewsHtml,
  stripHtml,
} from "../utils";
import type { NewsListItem, NewsProvider, NormalizedArticle } from "./types";

function parseSitemap(xml: string, baseUrl: string): NewsListItem[] {
  const out: NewsListItem[] = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/i) || [])[1]?.trim();
    if (!loc) continue;
    if (!loc.startsWith(baseUrl.replace(/\/$/, ""))) continue;
    if (loc.replace(/\/$/, "") === baseUrl.replace(/\/$/, "")) continue;
    if (/\/(kategori|category|tag|sayfa|page|giris|uye|admin)\b/i.test(loc)) continue;
    const lastmodRaw = (block.match(/<lastmod>([^<]+)<\/lastmod>/i) || [])[1]?.trim();
    const lastmod = lastmodRaw ? new Date(lastmodRaw) : null;
    out.push({
      sourceUrl: loc,
      lastmod: lastmod && !Number.isNaN(lastmod.getTime()) ? lastmod : null,
    });
  }
  return out;
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
  const re3 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["]([^"]+)["]`,
    "i",
  );
  return decodeEntities((html.match(re) || html.match(re2) || html.match(re3) || [])[1]?.trim() || "") || null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    try {
      const data = JSON.parse(m[1]) as unknown;
      const nodes = Array.isArray(data)
        ? data
        : data && typeof data === "object" && Array.isArray((data as { "@graph"?: unknown[] })["@graph"])
          ? (data as { "@graph": unknown[] })["@graph"]
          : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const t = String((node as { "@type"?: string })["@type"] || "");
        if (/NewsArticle|Article|BlogPosting/i.test(t)) return node as Record<string, unknown>;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function mapCategory(raw: string | null | undefined): string {
  const t = (raw || "").toLocaleLowerCase("tr-TR");
  if (/mevzuat|yasal|kanun|yonetmelik/.test(t)) return "Mevzuat";
  if (/sinav|egitim|kurs|sertifika/.test(t)) return "Eğitim ve Sınav";
  if (/maas|ucret|hak|sendika/.test(t)) return "Maaş ve Haklar";
  if (/teknoloji|kamera|cctv/.test(t)) return "Teknoloji";
  if (/rehber|nasil|kariyer/.test(t)) return "Rehberler";
  if (/firma|sirket|kurum/.test(t)) return "Firma ve Kurumlar";
  if (/sektor|haber|saldiri|olay/.test(t)) return "Sektör Haberleri";
  return "Genel Haberler";
}

function parseTrDate(html: string): Date | null {
  const m = html.match(/(\d{2})[./](\d{2})[./](\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isBadCover(url: string): boolean {
  const u = url.toLowerCase();
  return /logo|favicon|sprite|icon|avatar|placeholder|1x1|pixel|banner-ad|adservice|gravatar|wp-includes/.test(u);
}

function pickCoverImage(html: string, pageUrl: string, ld: Record<string, unknown> | null): string | null {
  const ldImage = ld?.image;
  let fromLd: string | null = null;
  if (typeof ldImage === "string") fromLd = ldImage;
  else if (Array.isArray(ldImage) && ldImage.length) {
    const first = ldImage[0];
    fromLd = typeof first === "string" ? first : (first as { url?: string })?.url || null;
  } else if (ldImage && typeof ldImage === "object") {
    fromLd = (ldImage as { url?: string }).url || null;
  }

  const candidates = [
    fromLd,
    metaContent(html, "og:image"),
    metaContent(html, "og:image:secure_url"),
    metaContent(html, "twitter:image"),
    metaContent(html, "twitter:image:src"),
    (html.match(/class=["'][^"']*(?:wp-post-image|featured|post-thumbnail|attachment-post)[^"']*["'][^>]*src=["']([^"']+)/i) || [])[1],
    (html.match(/src=["']([^"']+)["'][^>]*class=["'][^"']*(?:wp-post-image|featured|post-thumbnail)[^"']*/i) || [])[1],
    (html.match(/<article[\s\S]{0,4000}?<img[^>]+(?:data-src|src)=["']([^"']+)/i) || [])[1],
    (html.match(/class=["'][^"']*post-content[^"']*["'][\s\S]{0,2000}?<img[^>]+(?:data-src|src)=["']([^"']+)/i) || [])[1],
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const abs = absolutizeUrl(pageUrl, decodeEntities(String(raw).trim()));
    if (!abs || !/^https?:\/\//i.test(abs) || isBadCover(abs)) continue;
    return abs;
  }
  return null;
}

export const guvenlikAkademiProvider: NewsProvider = {
  key: "guvenlik_akademi",

  async getArticleList(opts) {
    const base = opts.baseUrl.replace(/\/$/, "");
    const listing = opts.listingUrl?.trim() || `${base}/sitemap.xml`;
    const res = await fetchText(listing);
    if (!res.ok) throw new Error(`Sitemap HTTP ${res.status}`);
    return parseSitemap(res.text, base);
  },

  async getArticleDetail(url, hint) {
    const res = await fetchText(url);
    if (!res.ok) return null;
    const html = res.text;
    const ld = extractJsonLd(html);
    const ogTitle = metaContent(html, "og:title");
    const ogDesc = metaContent(html, "og:description");
    const canonical = metaContent(html, "og:url")
      || (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || [])[1]
      || null;

    const h1 = stripHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
    const title = cleanNewsTitle(String(ld?.headline || ogTitle || h1 || ""));
    if (!title || title.length < 8) return null;

    const contentMatch = html.match(
      /class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>\s*<(?:div|section|footer|aside)|$)/i,
    )
      || html.match(/class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>\s*<(?:div|section|footer|aside)|$)/i)
      || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const rawContent = contentMatch?.[1] || "";
    const contentHtml = sanitizeNewsHtml(rawContent);
    const plain = stripHtml(contentHtml);
    const excerpt = makeExcerpt(String(ld?.description || ogDesc || plain || title));
    const coverImage = pickCoverImage(html, url, ld);

    let sourcePublishedAt: Date | null = null;
    let sourcePublishedMissing = false;
    const ldDate = ld?.datePublished ? new Date(String(ld.datePublished)) : null;
    if (ldDate && !Number.isNaN(ldDate.getTime())) sourcePublishedAt = ldDate;
    else if (hint?.lastmod) sourcePublishedAt = hint.lastmod;
    else {
      const tr = parseTrDate(html);
      if (tr) sourcePublishedAt = tr;
      else {
        sourcePublishedMissing = true;
        sourcePublishedAt = null;
      }
    }

    const authorName = ld?.author
      ? typeof ld.author === "string"
        ? ld.author
        : String((ld.author as { name?: string }).name || "") || null
      : null;

    return {
      title,
      excerpt,
      contentHtml: contentHtml || `<p>${excerpt}</p>`,
      coverImage,
      category: mapCategory(title + " " + excerpt),
      authorName,
      sourceUrl: url,
      canonicalUrl: absolutizeUrl(url, canonical),
      sourcePublishedAt,
      sourcePublishedMissing,
      tags: [],
    } satisfies NormalizedArticle;
  },
};

export function getProvider(key: string): NewsProvider | null {
  if (key === "guvenlik_akademi") return guvenlikAkademiProvider;
  return null;
}
