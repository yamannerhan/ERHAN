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

const HOST = "guvenlikakademi.com";

/** Tek biçim URL — çift kayıt / www farkı olmasın */
export function normalizeAkademiUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.search = "";
    u.hostname = HOST;
    u.protocol = "https:";
    return u.href.replace(/\/$/, "");
  } catch {
    return raw.trim().replace(/\/$/, "");
  }
}

function isArticlePath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/") return false;
  if (path.split("/").filter(Boolean).length !== 1) return false;
  return !/\/(kategori|category|tag|sayfa|page|giris|uye|admin|sinavlar|iletisim|hakkimizda|gizlilik|kurs|firma|haber-ihbar|sponsor|wp-|feed|sitemap)\b/i.test(path);
}

function parseSitemap(xml: string, baseUrl: string): NewsListItem[] {
  const out: NewsListItem[] = [];
  const seen = new Set<string>();
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/i) || [])[1]?.trim();
    if (!loc) continue;
    let href: string;
    try {
      const u = new URL(loc);
      if (u.hostname.replace(/^www\./, "") !== HOST) continue;
      if (!isArticlePath(u.pathname)) continue;
      href = normalizeAkademiUrl(loc);
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    const lastmodRaw = (block.match(/<lastmod>([^<]+)<\/lastmod>/i) || [])[1]?.trim();
    const lastmod = lastmodRaw ? new Date(lastmodRaw) : null;
    out.push({
      sourceUrl: href,
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
  return decodeHtmlEntities((html.match(re) || html.match(re2) || [])[1]?.trim() || "") || null;
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
  if (/mevzuat/.test(t)) return "Mevzuat";
  if (/eğitim|egitim|sınav|sinav/.test(t)) return "Eğitim ve Sınav";
  if (/maaş|maas|hak/.test(t)) return "Maaş ve Haklar";
  if (/teknoloji|kamera|cctv|x-ray|dedektör|dedektor/.test(t)) return "Teknoloji";
  if (/rehber/.test(t)) return "Rehberler";
  if (/firma|kurum/.test(t)) return "Firma ve Kurumlar";
  if (/sektör|sektor|haber/.test(t)) return "Sektör Haberleri";
  return "Genel Haberler";
}

function extractPageCategory(html: string): string | null {
  const m = html.match(/bi-folder[\s\S]{0,240}<a[^>]*>\s*([^<]+?)\s*<\/a>/i)
    || html.match(/class=["'][^"']*badge[^"']*["'][^>]*>\s*([^<]+?)\s*</i);
  const raw = m?.[1]?.replace(/\s+/g, " ").trim();
  if (!raw || raw.length < 3 || raw.length > 60) return null;
  return mapCategory(raw) !== "Genel Haberler" ? mapCategory(raw) : raw;
}

function parseTrDate(html: string): Date | null {
  const m = html.match(/(\d{2})[./](\d{2})[./](\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isBadCover(url: string): boolean {
  const u = url.toLowerCase();
  return /\/logo\/|favicon|sprite|\/icon|avatar|placeholder|1x1|pixel|banner-ad|adservice|gravatar|wp-includes|default-user|emoji|sponsor/.test(u);
}

function extractLdImage(ld: Record<string, unknown> | null): string | null {
  if (!ld?.image) return null;
  const img = ld.image;
  if (typeof img === "string" && img.trim()) return img.trim();
  if (Array.isArray(img)) {
    for (const item of img) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object" && "url" in item) {
        const u = String((item as { url?: string }).url || "").trim();
        if (u) return u;
      }
    }
  }
  if (typeof img === "object" && img && "url" in img) {
    const u = String((img as { url?: string }).url || "").trim();
    if (u) return u;
  }
  return null;
}

function extractLdArticleBody(ld: Record<string, unknown> | null): string {
  const body = ld?.articleBody;
  if (typeof body !== "string" || body.trim().length < 40) return "";
  const plain = stripHtml(body);
  if (plain.length < 40) return "";
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return plain
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
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

function stripJunkBlocks(html: string): string {
  let out = html;
  out = out.replace(/<(?:div|section|aside)[^>]*(?:share|paylas|related|ilgili|benzer|comment|yorum|sidebar|widget|popular|populer|rastgele)[^>]*>[\s\S]*?<\/(?:div|section|aside)>/gi, "");
  out = out.replace(/<a[^>]*(?:facebook|twitter|whatsapp|telegram|sharer)[^>]*>[\s\S]*?<\/a>/gi, "");
  return out;
}

/**
 * Kapak: yalnızca bu haberin og/json-ld/içerik görseli.
 * Sayfadaki “ilgili / rastgele” görselleri ASLA alınmaz (aynı resmi farklı habere yapıştırma).
 */
function pickCoverImage(
  html: string,
  pageUrl: string,
  ld?: Record<string, unknown> | null,
  contentHtml?: string,
): string | null {
  const pushOk = (raw: string | null | undefined): string | null => {
    const v = resolveNewsImageUrl(raw ? decodeHtmlEntities(raw) : null, pageUrl);
    if (!v || isBadCover(v)) return null;
    return v;
  };

  const og = pushOk(metaContent(html, "og:image"))
    || pushOk(metaContent(html, "og:image:secure_url"));
  if (og) return og;

  const tw = pushOk(metaContent(html, "twitter:image"))
    || pushOk(metaContent(html, "twitter:image:src"));
  if (tw) return tw;

  const ldImg = pushOk(extractLdImage(ld ?? null));
  if (ldImg) return ldImg;

  if (contentHtml) {
    for (const m of contentHtml.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) {
      const hit = pushOk(m[1]);
      if (hit) return hit;
    }
  }

  // h1 öncesi featured — yalnızca ilk img
  const h1idx = html.search(/<h1[\s>]/i);
  if (h1idx > 0) {
    const before = html.slice(Math.max(0, h1idx - 3500), h1idx);
    const m = before.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i);
    const hit = pushOk(m?.[1]);
    if (hit) return hit;
  }

  return null;
}

function extractPostContent(html: string, ld?: Record<string, unknown> | null): string {
  const primary = extractBalancedByClass(html, "post-content")
    || extractBalancedByClass(html, "entry-content")
    || extractBalancedByClass(html, "td-post-content")
    || extractBalancedByClass(html, "article-content")
    || extractBalancedByClass(html, "single-content");
  if (primary && stripHtml(primary).length > 80) return stripJunkBlocks(primary);

  const article = (html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || [])[1] || "";
  if (article && stripHtml(article).length > 120) {
    const cleaned = stripJunkBlocks(article);
    if (stripHtml(cleaned).length > 80) return cleaned;
  }

  const ldBody = extractLdArticleBody(ld ?? null);
  if (ldBody) return ldBody;

  const ps = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map((m) => m[0]);
  const joined = ps.slice(0, 16).join("\n");
  if (stripHtml(joined).length > 80) return joined;
  return "";
}

function parseListingPageLinks(html: string): NewsListItem[] {
  const seen = new Set<string>();
  const items: NewsListItem[] = [];
  for (const m of html.matchAll(/href=["'](https?:\/\/(?:www\.)?guvenlikakademi\.com\/[^"'#?]+)["']/gi)) {
    try {
      const href = normalizeAkademiUrl(m[1]!);
      const path = new URL(href).pathname;
      if (!isArticlePath(path)) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      items.push({ sourceUrl: href, lastmod: null });
    } catch { /* ignore */ }
  }
  for (const m of html.matchAll(/href=["'](\/[a-z0-9][^"'#?]*)["']/gi)) {
    try {
      const href = normalizeAkademiUrl(`https://${HOST}${m[1]}`);
      const path = new URL(href).pathname;
      if (!isArticlePath(path)) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      items.push({ sourceUrl: href, lastmod: null });
    } catch { /* ignore */ }
  }
  return items;
}

/** Kart tarihini liste HTML’inden yakala (DD.MM.YYYY) */
function attachDatesFromListing(html: string, items: NewsListItem[]): void {
  for (const item of items) {
    if (item.lastmod) continue;
    const slug = item.sourceUrl.split("/").pop() || "";
    if (slug.length < 8) continue;
    const idx = html.indexOf(slug);
    if (idx < 0) continue;
    const window = html.slice(Math.max(0, idx - 200), idx + slug.length + 400);
    const dm = window.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (!dm) continue;
    const d = new Date(`${dm[3]}-${dm[2]}-${dm[1]}T12:00:00+03:00`);
    if (!Number.isNaN(d.getTime())) item.lastmod = d;
  }
}

export const guvenlikAkademiProvider: NewsProvider = {
  key: "guvenlik_akademi",

  async getArticleList(opts) {
    const base = (opts.baseUrl || `https://${HOST}`).replace(/\/$/, "");
    const byUrl = new Map<string, NewsListItem>();

    // Ana sayfa + sayfalar (1..8) — screenshot’taki pagination
    for (let page = 1; page <= 8; page++) {
      const pageUrl = page === 1 ? `${base}/` : `${base}/page/${page}/`;
      try {
        const res = await fetchText(pageUrl);
        if (!res.ok) break;
        const items = parseListingPageLinks(res.text);
        if (!items.length && page > 1) break;
        attachDatesFromListing(res.text, items);
        for (const item of items) {
          const prev = byUrl.get(item.sourceUrl);
          byUrl.set(item.sourceUrl, {
            sourceUrl: item.sourceUrl,
            lastmod: item.lastmod || prev?.lastmod || null,
          });
        }
      } catch {
        if (page > 1) break;
      }
    }

    // Sitemap tamamlayıcı
    try {
      const listing = opts.listingUrl?.trim() || `${base}/sitemap.xml`;
      const res = await fetchText(listing.includes("sitemap") ? listing : `${base}/sitemap.xml`);
      if (res.ok) {
        for (const item of parseSitemap(res.text, base)) {
          const prev = byUrl.get(item.sourceUrl);
          byUrl.set(item.sourceUrl, {
            sourceUrl: item.sourceUrl,
            lastmod: item.lastmod || prev?.lastmod || null,
          });
        }
      }
    } catch { /* ignore */ }

    if (!byUrl.size) throw new Error("Güvenlik Akademi listesi boş / erişilemedi");
    return [...byUrl.values()];
  },

  async getArticleDetail(url, hint) {
    const pageUrl = normalizeAkademiUrl(url);
    const res = await fetchText(pageUrl);
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

    const rawContent = extractPostContent(html, ld);
    let contentHtml = sanitizeNewsHtml(rawContent);
    contentHtml = absolutizeContentImages(contentHtml, pageUrl);
    contentHtml = decodeHtmlEntities(contentHtml);
    const plain = stripHtml(contentHtml);
    if (plain.length < 40) return null;

    const excerpt = makeExcerpt(String(ld?.description || ogDesc || plain || title), 280);
    const coverImage = pickCoverImage(html, pageUrl, ld, contentHtml);
    if (!coverImage) return null;
    if (!excerpt || excerpt.length < 8) return null;

    const category = extractPageCategory(html) || mapCategory(title + " " + excerpt);

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

    const canonicalNorm = normalizeAkademiUrl(absolutizeUrl(pageUrl, canonical) || pageUrl);

    return {
      title,
      excerpt,
      contentHtml: contentHtml || `<p>${excerpt}</p>`,
      coverImage,
      category,
      authorName,
      sourceUrl: pageUrl,
      canonicalUrl: canonicalNorm,
      sourcePublishedAt,
      sourcePublishedMissing,
      tags: [],
    } satisfies NormalizedArticle;
  },
};

/** @deprecated use getProvider from ./providers/index */
export function getProvider(key: string): NewsProvider | null {
  if (key === "guvenlik_akademi") return guvenlikAkademiProvider;
  return null;
}
