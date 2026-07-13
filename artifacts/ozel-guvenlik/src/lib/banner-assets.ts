/**
 * Anasayfa banner görselleri — public/banners (1200×400, 3:1)
 */
export const HOME_BANNER_ASSETS = [
  {
    title: null,
    imageUrl: "/banners/banner-1.jpg",
    sortOrder: 1,
  },
  {
    title: null,
    imageUrl: "/banners/banner-2.jpg",
    sortOrder: 2,
  },
  {
    title: null,
    imageUrl: "/banners/banner-3.jpg",
    sortOrder: 3,
  },
] as const;

export function getHomeBannerSeeds() {
  return HOME_BANNER_ASSETS.map((b, i) => ({
    id: 9001 + i,
    title: b.title,
    imageUrl: b.imageUrl,
    linkUrl: null as string | null,
    sortOrder: b.sortOrder,
  }));
}
