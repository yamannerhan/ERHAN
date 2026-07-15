/**
 * Anasayfa banner görselleri — public/banners (1200×400, 3:1)
 */
export const HOME_BANNER_ASSETS = [
  {
    title: null,
    subtitle: null,
    ctaLabel: "Hemen İlanları Keşfet",
    altText: "Özel güvenlik görevlisi ve İstanbul silüeti",
    imageUrl: "/banners/career-hero.png",
    linkUrl: "/ilanlar",
    sortOrder: 1,
  },
] as const;

export function getHomeBannerSeeds() {
  return HOME_BANNER_ASSETS.map((b, i) => ({
    id: 9001 + i,
    title: b.title,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    altText: b.altText,
    imageUrl: b.imageUrl,
    mobileImageUrl: null as string | null,
    linkUrl: b.linkUrl,
    sortOrder: b.sortOrder,
  }));
}
