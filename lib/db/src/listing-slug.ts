/**
 * İlan SEO slug üretimi — başlık + ilçe + şehir.
 * Frontend ve API aynı kuralları kullanır.
 */

export function splitListingLocation(cityRaw: string): { city: string; district: string | null } {
  const raw = String(cityRaw || "").trim();
  if (!raw) return { city: "", district: null };
  const parts = raw.split(/\s*[\/|,·–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // "Gebze / Kocaeli" → district=Gebze, city=Kocaeli
    return { district: parts[0]!, city: parts[parts.length - 1]! };
  }
  return { city: raw, district: null };
}

/** Türkçe karakter + slugify kuralları */
export function slugifyListingSegment(input: string): string {
  return String(input || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

/**
 * Örnek: title="Güvenlik Personeli (Fabrika)", city="Gebze / Kocaeli"
 * → guvenlik-personeli-fabrika-gebze-kocaeli
 */
export function buildListingSlug(title: string, cityField: string, districtOverride?: string | null): string {
  const { city, district } = splitListingLocation(cityField);
  const dist = (districtOverride ?? district ?? "").trim();
  const parts = [title, dist, city].filter((p) => p && String(p).trim());
  const slug = slugifyListingSegment(parts.join(" "));
  return slug || "ilan";
}

/** Canonical path: /ilan/{id}/{slug} */
export function listingSeoPath(id: number, slug: string | null | undefined): string {
  const s = (slug || "").trim() || "ilan";
  return `/ilan/${id}/${s}`;
}

export function listingSeoUrl(baseUrl: string, id: number, slug: string | null | undefined): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${listingSeoPath(id, slug)}`;
}
