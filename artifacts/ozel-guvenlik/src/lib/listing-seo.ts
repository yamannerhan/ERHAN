/** İlan SEO path + meta helpers — frontend (API SSR ile aynı kurallar) */

import { SEO_BASE_URL, truncateDescription, safeText } from "@/lib/seo-config";

export function splitListingLocation(cityRaw: string): { city: string; district: string | null } {
  const raw = String(cityRaw || "").trim();
  if (!raw) return { city: "", district: null };
  const parts = raw.split(/\s*[\/|,·–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { district: parts[0]!, city: parts[parts.length - 1]! };
  }
  return { city: raw, district: null };
}

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

export function buildListingSlug(title: string, cityField: string): string {
  const { city, district } = splitListingLocation(cityField);
  const parts = [title, district, city].filter((p) => p && String(p).trim());
  const slug = slugifyListingSegment(parts.join(" "));
  return slug || "ilan";
}

export function listingSeoPath(id: number, slug?: string | null): string {
  const s = (slug || "").trim() || `ilan-${id}`;
  return `/ilan/${id}/${s}`;
}

export function listingSeoUrl(id: number, slug?: string | null): string {
  return `${SEO_BASE_URL}${listingSeoPath(id, slug)}`;
}

/** API listing objesinden path — slug/seoPath varsa kullan, yoksa üret */
export function listingHref(listing: {
  id: number;
  slug?: string | null;
  seoPath?: string | null;
  title?: string | null;
  city?: string | null;
}): string {
  if (listing.seoPath) return listing.seoPath;
  if (listing.slug) return listingSeoPath(listing.id, listing.slug);
  return listingSeoPath(
    listing.id,
    buildListingSlug(listing.title || "ilan", listing.city || ""),
  );
}

/** Meta title: {Başlık} İş İlanı | {İlçe} {Şehir} | {Maaş} */
export function buildListingSeoTitle(opts: {
  title?: string | null;
  city?: string | null;
  salary?: string | null;
}): string {
  const listingTitle = safeText(opts.title, "Güvenlik Personeli");
  const { city, district } = splitListingLocation(opts.city || "");
  const locCity = city || "Türkiye";
  const locForTitle = [district, locCity].filter(Boolean).join(" ");
  const salaryText = (opts.salary || "").trim();
  return [ `${listingTitle} İş İlanı`, locForTitle || null, salaryText || null ]
    .filter(Boolean)
    .join(" | ");
}

/** Meta description */
export function buildListingSeoDescription(opts: {
  title?: string | null;
  city?: string | null;
  salary?: string | null;
}): string {
  const listingTitle = safeText(opts.title, "Güvenlik Personeli");
  const { city, district } = splitListingLocation(opts.city || "");
  const locCity = city || "Türkiye";
  const locPhrase = district ? `${district} / ${locCity}` : locCity;
  const salaryText = (opts.salary || "").trim();
  const salaryPart = salaryText ? ` Maaş ${salaryText}.` : "";
  return truncateDescription(
    `${locPhrase}'de ${listingTitle} iş ilanı.${salaryPart} Servis ve yemek imkanı. Hemen başvurun.`,
  );
}

/** H1: {Başlık} İş İlanı - {İlçe} / {Şehir} */
export function buildListingH1(opts: {
  title?: string | null;
  city?: string | null;
}): string {
  const listingTitle = safeText(opts.title, "Güvenlik Personeli");
  const { city, district } = splitListingLocation(opts.city || "");
  const locCity = city || "Türkiye";
  return district
    ? `${listingTitle} İş İlanı - ${district} / ${locCity}`
    : `${listingTitle} İş İlanı - ${locCity}`;
}

export function toCitySlug(name: string): string {
  return slugifyListingSegment(name) || "turkiye";
}
