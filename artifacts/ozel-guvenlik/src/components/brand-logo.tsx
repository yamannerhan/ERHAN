import { BRAND_LOGO_ICON_URL, BRAND_LOGO_URL } from "@/lib/brand-logo";

type BrandLogoProps = {
  variant?: "icon" | "full";
  size?: number;
  className?: string;
  alt?: string;
};

export function BrandLogo({
  variant = "icon",
  size,
  className = "",
  alt = "ÖzelGüvenlik.online",
}: BrandLogoProps) {
  const src = variant === "full" ? BRAND_LOGO_URL : BRAND_LOGO_ICON_URL;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`og-brand-logo ${className}`.trim()}
      decoding="async"
    />
  );
}
