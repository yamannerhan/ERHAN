/** Varsayılan marka logosu — firma logosu yoksa kullanılır */
export const BRAND_LOGO_URL = "/brand-logo.png";
export const BRAND_LOGO_ICON_URL = "/brand-logo-icon.png";

export function isRealCompanyLogo(url?: string | null): boolean {
  if (!url) return false;
  const u = url.trim();
  if (!u || u.startsWith("data:image/svg")) return false;
  if (/unsplash\.com|randomuser\.me|picsum/i.test(u)) return false;
  return (
    u.startsWith("/api/company-logos/") ||
    u.startsWith("/api/listing-images/") ||
    u.startsWith("blob:") ||
    u.startsWith("data:image/") ||
    u.startsWith("http")
  );
}

export function resolveCompanyLogo(url?: string | null): string {
  return isRealCompanyLogo(url) ? url!.trim() : BRAND_LOGO_URL;
}
