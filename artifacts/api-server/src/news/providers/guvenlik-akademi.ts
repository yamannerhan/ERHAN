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

function parseSitemap(xml: string, baseUrl: string): NewsListItem[] {
  const out: NewsListItem[] = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/i) || [])[1]?.trim();
    if (!loc) continue;
    if (!loc.startsWith(baseUrl.replace(/\/$/, ""))) continue;
    if (loc.replace(/\/$/, "") === baseUrl.replace(/\/$/, "")) continue;
    if (/\/(kategori|category|tag|sayfa|page|giris|uye|admin|sinavlar|iletisim)\b/i.test(loc)) continue;
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
  if (/teknoloji|kamera|cctv/.test(t)) return "Teknoloji";
  if (/rehber/.test(t)) return "Rehberler";
  if (/firma|kurum/.test(t)) return "Firma ve Kurumlar";
  if (/sektör|sektor|haber/.test(t)) return "Sektör Haberleri";
  return "Genel Haberler";
}

/** Sayfadaki kategori linkinden oku (ör. Sektör Haberleri) */
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
  return /\/logo\/|favicon|sprite|\/icon|avatar|placeholder|1x1|pixel|banner-ad|adservice|gravatar|wp-includes|default-user|emoji/.test(u);
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
  // JSON-LD gövdesi düz metin olabilir
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return plain
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
}

/** class="post-content ..." bloğunu div derinliğiyle güvenli çıkar (sidebar/ilgili haber karışmasın) */
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
      if (depth === 0) {
        return html.slice(startContent, nextClose);
      }
      i = nextClose + 6;
    }
  }
  return "";
}

function stripJunkBlocks(html: string): string {
  let out = html;
  // Paylaş / ilgili / benzer / yorum bloklarını at
  out = out.replace(/<(?:div|section|aside)[^>]*(?:share|paylas|related|ilgili|benzer|comment|yorum|sidebar|widget)[^>]*>[\s\S]*?<\/(?:div|section|aside)>/gi, "");
  out = out.replace(/<a[^>]*(?:facebook|twitter|whatsapp|telegram|sharer)[^>]*>[\s\S]*?<\/a>/gi, "");
  return out;
}

function pickCoverImage(html: string, pageUrl: string, ld?: Record<string, unknown> | null): string | null {
  const slug = (pageUrl.split("/").filter(Boolean).pop() || "").toLowerCase();
  const candidates: string[] = [];

  const push = (raw: string | null | undefined) => {
    const v = resolveNewsImageUrl(raw ? decodeHtmlEntities(raw) : null, pageUrl);
    if (v && !isBadCover(v)) candidates.push(v);
  };

  // 0) JSON-LD image
  push(extractLdImage(ld ?? null));

  // 1) og / twitter
  for (const prop of ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]) {
    push(metaContent(html, prop));
  }

  // 2) h1 öncesi featured img (src / data-src)
  const h1idx = html.search(/<h1[\s>]/i);
  if (h1idx > 0) {
    const before = html.slice(Math.max(0, h1idx - 4500), h1idx);
    for (const m of before.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) {
      push(m[1]);
    }
  }

  // 3) tüm /uploads/posts/ görselleri
  for (const m of html.matchAll(/(?:src|content|data-src)=["']([^"']*\/uploads\/posts\/[^"']+)["']/gi)) {
    push(m[1]);
  }

  // 4) wp-content/uploads genel
  for (const m of html.matchAll(/(?:src|content)=["']([^"']*\/wp-content\/uploads\/[^"']+\.(?:jpe?g|png|webp|gif))["']/gi)) {
    push(m[1]);
  }

  const uniq = [...new Set(candidates)];
  if (!uniq.length) return null;

  const slugKey = slug.replace(/[^a-z0-9-]/g, "").slice(0, 32);
  const matched = uniq.find((u) => slugKey.length > 8 && u.toLowerCase().includes(slugKey.slice(0, 20)));
  if (matched) return matched;

  const post = uniq.find((u) => /\/uploads\/posts\//i.test(u) || /\/wp-content\/uploads\//i.test(u));
  return post || uniq[0]!;
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

  // Son çare: yalnızca ilk birkaç <p>
  const ps = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map((m) => m[0]);
  const joined = ps.slice(0, 16).join("\n");
  if (stripHtml(joined).length > 80) return joined;
  return "";
}

function parseHomepageLinks(html: string, baseUrl: string): NewsListItem[] {
  const base = baseUrl.replace(/\/$/, "");
  const out: string[] = [];
  for (const m of html.matchAll(/href=["'](https?:\/\/(?:www\.)?guvenlikakademi\.com\/[^"'#?]+)["']/gi)) {
    out.push(m[1]!);
  }
  for (const m of html.matchAll(/href=["'](\/[a-z0-9][^"'#?]*)["']/gi)) {
    out.push(`${base}${m[1]}`);
  }
  const skip = /\/(kategori|category|tag|sayfa|page|giris|uye|admin|sinavlar|iletisim|hakkimizda|gizlilik|kurs|firma|haber-ihbar|sponsor|wp-|feed|sitemap)\b/i;
  const uniq = new Set<string>();
  const items: NewsListItem[] = [];
  for (const raw of out) {
    try {
      const u = new URL(raw);
      u.hash = "";
      u.search = "";
      if (u.hostname.replace(/^www\./, "") !== "guvenlikakademi.com") continue;
      const path = u.pathname.replace(/\/$/, "") || "/";
      if (path === "/" || path.split("/").filter(Boolean).length !== 1) continue;
      if (skip.test(path)) continue;
      const href = u.href.replace(/\/$/, "");
      if (uniq.has(href)) continue;
      uniq.add(href);
      items.push({ sourceUrl: href, lastmod: null });
    } catch { /* ignore */ }
  }
  return items;
}

export const guvenlikAkademiProvider: NewsProvider = {
  key: "guvenlik_akademi",

  async getArticleList(opts) {
    const base = opts.baseUrl.replace(/\/$/, "") || "https://guvenlikakademi.com";
    const listing = opts.listingUrl?.trim() || `${base}/sitemap.xml`;
    const byUrl = new Map<string, NewsListItem>();

    // Ana sayfa haber kartları (en yeni)
    try {
      const home = await fetchText(`${base}/`);
      if (home.ok) {
        for (const item of parseHomepageLinks(home.text, base)) {
          byUrl.set(item.sourceUrl, item);
        }
      }
    } catch { /* ignore */ }

    // Sitemap — tam envanter
    try {
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

    const rawContent = extractPostContent(html, ld);
    let contentHtml = sanitizeNewsHtml(rawContent);
    contentHtml = absolutizeContentImages(contentHtml, url);
    contentHtml = decodeHtmlEntities(contentHtml);
    const plain = stripHtml(contentHtml);
    if (plain.length < 40) return null;

    const excerpt = makeExcerpt(String(ld?.description || ogDesc || plain || title));
    const coverImage = pickCoverImage(html, url, ld);
    const category = extractPageCategory(html) || mapCategory(title + " " + excerpt);

    // Kapak yoksa içerikten ilk uygun görseli dene
    const coverFinal = coverImage
      || resolveNewsImageUrl(
        (contentHtml.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i) || [])[1],
        url,
      );

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
      coverImage: coverFinal,
      category,
      authorName,
      sourceUrl: url,
      canonicalUrl: absolutizeUrl(url, canonical),
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
