import { cleanNewsTitle, sha256, slugifyTr, stripHtml } from "./utils";

/** Başlık anahtarı — kaynaklar arası aynı haber yakalama */
export function titleKey(title: string): string {
  return slugifyTr(cleanNewsTitle(title))
    .replace(/-\d{3,}$/g, "")
    .slice(0, 100);
}

export function contentFingerprint(htmlOrText: string): string {
  const plain = stripHtml(htmlOrText)
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  return sha256(plain);
}

/** Jaccard benzerliği (kelime) */
export function textSimilarity(a: string, b: string): number {
  const wa = new Set(
    stripHtml(a).toLocaleLowerCase("tr-TR").split(/\s+/).filter((w) => w.length > 2),
  );
  const wb = new Set(
    stripHtml(b).toLocaleLowerCase("tr-TR").split(/\s+/).filter((w) => w.length > 2),
  );
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  const union = wa.size + wb.size - inter;
  return union ? inter / union : 0;
}

export function normalizeCanonical(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim());
    u.hash = "";
    u.search = "";
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    u.hostname = host;
    return u.href.replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

export function urlVariants(raw: string | null | undefined): string[] {
  const n = normalizeCanonical(raw);
  if (!n) return [];
  const out = new Set<string>([n, `${n}/`]);
  try {
    const u = new URL(n);
    out.add(u.href);
    out.add(`https://www.${u.hostname}${u.pathname}`.replace(/\/$/, ""));
    out.add(`https://${u.hostname}${u.pathname}`.replace(/\/$/, ""));
  } catch { /* ignore */ }
  return [...out];
}
