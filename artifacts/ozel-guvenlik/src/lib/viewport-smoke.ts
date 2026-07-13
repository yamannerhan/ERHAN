/**
 * Dar responsive smoke checklist (Playwright farm sonraki PR).
 *
 * Manuel / CI notları:
 * - 390x844 (Xiaomi 13T ≈): scrollWidth <= innerWidth, header ~56px, nav inner 68px, pb ≈96px
 * - 320x568: overflow-x yok, input font-size 16px
 * - 768x1024: max-w-md → md:max-w-6xl geçişi
 * - 1280x720: lg:pb-10, bottom-nav gizli (lg:hidden)
 *
 * Canlı ölçüm: https://ozelguvenlik.online/?debugViewport=1
 */
export const VIEWPORT_SMOKE = [
  { w: 320, h: 568, name: "small-phone" },
  { w: 390, h: 844, name: "xiaomi-13t-approx" },
  { w: 768, h: 1024, name: "tablet" },
  { w: 1280, h: 720, name: "desktop" },
] as const;
