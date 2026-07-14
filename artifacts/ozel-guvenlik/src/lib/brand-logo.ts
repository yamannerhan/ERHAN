/** Varsayılan marka logosu — firma logosu yoksa kullanılır */
export const BRAND_LOGO_URL = "/api/default-company-logo";
export const BRAND_LOGO_ICON_URL = "/brand-logo-icon.png";

export function isRealCompanyLogo(url?: string | null): boolean {
  if (!url) return false;
  const u = url.trim();
  if (!u || u.startsWith("data:image/svg")) return false;
  if (/unsplash\.com|randomuser\.me|picsum/i.test(u)) return false;
  return (
    u.startsWith("/api/company-logos/") ||
    u.startsWith("/api/default-company-logo") ||
    u.startsWith("/api/known-company-logos/") ||
    u.startsWith("/known-logos/") ||
    u.startsWith("/api/listing-images/") ||
    u.startsWith("blob:") ||
    u.startsWith("data:image/") ||
    u.startsWith("http")
  );
}

export function resolveCompanyLogo(url?: string | null): string {
  return isRealCompanyLogo(url) ? url!.trim() : BRAND_LOGO_URL;
}

export function useBrandLogoFallback(image: HTMLImageElement): void {
  if (image.dataset["fallbackApplied"] === "1") return;
  image.dataset["fallbackApplied"] = "1";
  image.src = image.src.includes("/api/default-company-logo")
    ? "/brand-logo.png"
    : BRAND_LOGO_URL;
  image.style.objectFit = "contain";
  image.style.padding = "6px";
  image.style.boxSizing = "border-box";
  image.style.maxWidth = "100%";
  image.style.maxHeight = "100%";
}
