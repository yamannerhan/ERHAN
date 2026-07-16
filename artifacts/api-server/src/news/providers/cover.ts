import { decodeHtmlEntities, resolveNewsImageUrl } from "../utils";

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

function extractLdImage(html: string): string | null {
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
        if (!/NewsArticle|Article|BlogPosting/i.test(t)) continue;
        const img = (node as { image?: unknown }).image;
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
        if (img && typeof img === "object" && "url" in img) {
          const u = String((img as { url?: string }).url || "").trim();
          if (u) return u;
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

function isBadCover(url: string): boolean {
  const u = url.toLowerCase();
  return /\/logo\/|favicon|sprite|\/icon|avatar|placeholder|advert|reklam|1x1|pixel|banner|emoji/.test(u);
}

/** Kapak önceliği: NewsArticle image → og:image → twitter → ilk büyük görsel */
export function pickCoverImage(html: string, pageUrl: string, contentHtml?: string): string | null {
  const candidates: string[] = [];
  const push = (raw: string | null | undefined) => {
    const v = resolveNewsImageUrl(raw ? decodeHtmlEntities(raw) : null, pageUrl);
    if (v && !isBadCover(v)) candidates.push(v);
  };

  push(extractLdImage(html));
  for (const prop of ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]) {
    push(metaContent(html, prop));
  }

  for (const m of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|content)=["']([^"']+\.(?:jpe?g|png|webp|gif)[^"']*)["']/gi)) {
    push(m[1]);
  }
  if (contentHtml) {
    for (const m of contentHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      push(m[1]);
    }
  }

  const uniq = [...new Set(candidates)];
  if (!uniq.length) return null;

  const preferred = uniq.find((u) => /\/uploads\/news\/|\/files\/uploads\/|\/IcSite\/|\/kurumlar\//i.test(u));
  return preferred || uniq[0]!;
}

export { metaContent };
