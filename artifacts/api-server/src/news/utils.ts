import { createHash } from "node:crypto";

export function slugifyTr(input: string): string {
  return String(input || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "haber";
}

/** Kaynak site adlarını temizle, başlığı okunaklı bırak */
export function cleanNewsTitle(input: string): string {
  let t = stripHtml(String(input || "")).replace(/\s+/g, " ").trim();
  t = t.replace(/\s*[\|–—·•]\s*(güvenlik\s*akademi(si)?\.?(com)?)\s*$/i, "");
  t = t.replace(/\s*[\-\–—]\s*(güvenlik\s*akademi(si)?\.?(com)?)\s*$/i, "");
  t = t.replace(/\(\s*güvenlik\s*akademi(si)?\.?(com)?\s*\)\s*$/i, "");
  t = t.replace(/\s+güvenlik\s*akademi(si)?\.?(com)?\s*$/i, "");
  t = t.replace(/\s*[\|–—·•]\s*guvenlikakademi\.com\s*$/i, "");
  t = t.replace(/\s+/g, " ").trim();
  // Çift boşluk / bozuk noktalama
  t = t.replace(/\s+([:?!.])/g, "$1");
  return t;
}

/** Göreli kapak URL'lerini kaynak siteye göre mutlaklaştır */
export function resolveNewsImageUrl(image: string | null | undefined, sourceUrl?: string | null): string | null {
  if (!image?.trim()) return null;
  const raw = image.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  const base = sourceUrl?.trim() || "https://guvenlikakademi.com/";
  return absolutizeUrl(base, raw);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function sourceHash(parts: { sourceUrl: string; title: string; excerpt?: string | null }): string {
  const norm = [
    parts.sourceUrl.trim().toLowerCase(),
    parts.title.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " "),
    (parts.excerpt || "").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").slice(0, 280),
  ].join("|");
  return sha256(norm);
}

export function absolutizeUrl(base: string, maybeRelative: string | null | undefined): string | null {
  if (!maybeRelative?.trim()) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "0.0.0.0") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Basit HTML sanitizer — excerpt/full güvenli etiketler */
export function sanitizeNewsHtml(html: string): string {
  let out = String(html || "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<\/?(?:form|object|embed|iframe|link|meta|svg|button|input|textarea|select)[^>]*>/gi, "");
  out = out.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/javascript:/gi, "");
  // span/div sarmalayıcıları kaldır, içeriği tut
  out = out.replace(/<\/?(?:span|div|section|article|header|footer|aside|main|font)[^>]*>/gi, "");
  // yalnızca izinli etiketleri bırak (kabaca)
  out = out.replace(/<\/?(?!\/?(?:p|h1|h2|h3|h4|strong|b|em|i|ul|ol|li|blockquote|figure|figcaption|img|a|br)\b)[a-z0-9-]+[^>]*>/gi, "");
  // img src göreli ise sonra resolve edilir — data-src -> src
  out = out.replace(/<img([^>]*?)data-(?:src|lazy-src)=["']([^"']+)["']([^>]*?)>/gi, '<img$1src="$2"$3>');
  return out.trim();
}

/** İçerikteki göreli img src'lerini mutlaklaştır */
export function absolutizeContentImages(html: string, pageUrl: string): string {
  return String(html || "").replace(
    /(<img[^>]+src=["'])([^"']+)(["'])/gi,
    (_m, pre: string, src: string, post: string) => {
      const abs = resolveNewsImageUrl(src, pageUrl) || src;
      return `${pre}${abs}${post}`;
    },
  );
}

export function makeExcerpt(text: string, max = 220): string {
  const t = stripHtml(text).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export async function fetchText(url: string, timeoutMs = 20_000): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 0, text: "", finalUrl: url };
  }
  if (!["http:", "https:"].includes(parsed.protocol) || isPrivateHostname(parsed.hostname)) {
    return { ok: false, status: 0, text: "", finalUrl: url };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "ozelguvenlik-newsbot/1.0 (+https://ozelguvenlik.online)",
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}
