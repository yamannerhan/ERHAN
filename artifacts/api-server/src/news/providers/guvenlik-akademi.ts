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
  return /\/logo\/|favicon|sprite|\/icon|avatar|placeholder|1x1|pixel|banner-ad|adservice|gravatar|wp-includes/.test(u);
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

function pickCoverImage(html: string, pageUrl: string): string | null {
  const slug = (pageUrl.split("/").filter(Boolean).pop() || "").toLowerCase();
  const candidates: string[] = [];

  // 1) og / twitter (örnek sayfada her zaman var)
  for (const prop of ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]) {
    const v = resolveNewsImageUrl(metaContent(html, prop), pageUrl);
    if (v && !isBadCover(v)) candidates.push(v);
  }

  // 2) h1 öncesi featured img (class img-fluid / posts)
  const h1idx = html.search(/<h1[\s>]/i);
  if (h1idx > 0) {
    const before = html.slice(Math.max(0, h1idx - 3500), h1idx);
    for (const m of before.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      const v = resolveNewsImageUrl(decodeHtmlEntities(m[1]), pageUrl);
      if (v && !isBadCover(v)) candidates.push(v);
    }
  }

  // 3) tüm /uploads/posts/ görselleri
  for (const m of html.matchAll(/(?:src|content)=["']([^"']*\/uploads\/posts\/[^"']+)["']/gi)) {
    const v = resolveNewsImageUrl(decodeHtmlEntities(m[1]), pageUrl);
    if (v && !isBadCover(v)) candidates.push(v);
  }

  const uniq = [...new Set(candidates)];
  if (!uniq.length) return null;

  const slugKey = slug.replace(/[^a-z0-9-]/g, "").slice(0, 32);
  const matched = uniq.find((u) => slugKey.length > 8 && u.toLowerCase().includes(slugKey.slice(0, 20)));
  if (matched) return matched;

  // posts klasöründekileri tercih et
  const post = uniq.find((u) => /\/uploads\/posts\//i.test(u));
  return post || uniq[0]!;
}

function extractPostContent(html: string): string {
  const primary = extractBalancedByClass(html, "post-content")
    || extractBalancedByClass(html, "entry-content")
    || extractBalancedByClass(html, "td-post-content");
  if (primary && stripHtml(primary).length > 80) return stripJunkBlocks(primary);

  // Son çare: yalnızca ilk birkaç <p> — ilgili haber kartlarını alma
  const ps = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map((m) => m[0]);
  const joined = ps.slice(0, 12).join("\n");
  if (stripHtml(joined).length > 80) return joined;
  return "";
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

    const rawContent = extractPostContent(html);
    let contentHtml = sanitizeNewsHtml(rawContent);
    contentHtml = absolutizeContentImages(contentHtml, url);
    contentHtml = decodeHtmlEntities(contentHtml);
    const plain = stripHtml(contentHtml);
    if (plain.length < 40) return null;

    const excerpt = makeExcerpt(String(ld?.description || ogDesc || plain || title));
    const coverImage = pickCoverImage(html, url);
    const category = extractPageCategory(html) || mapCategory(title + " " + excerpt);

    // Kapak yoksa içerikten ilk uygun görseli dene
    const coverFinal = coverImage
      || resolveNewsImageUrl(
        (contentHtml.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1],
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

export function getProvider(key: string): NewsProvider | null {
  if (key === "guvenlik_akademi") return guvenlikAkademiProvider;
  return null;
}
