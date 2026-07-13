/** API duyurusu yokken anasayfa kayan şeritte gösterilen örnek metinler */
export const HOME_TICKER_FALLBACK = [
  "Türkiye geneli özel güvenlik iş ilanları — ücretsiz inceleyin ve hemen başvurun",
  "Silahlı, silahsız ve part-time güvenlik pozisyonları her gün güncellenir",
  "Profilinizi tamamlayın; işverenler sizi daha hızlı bulsun",
  "ozelguvenlik.online — güvenilir özel güvenlik iş ilanı platformu",
] as const;

export function getHomeTickerLines(announcements: { content?: string | null }[] | null | undefined): string[] {
  const list = Array.isArray(announcements) ? announcements : [];
  const fromApi = list
    .map((a) => a.content?.trim())
    .filter((c): c is string => Boolean(c));
  return fromApi.length > 0 ? fromApi : [...HOME_TICKER_FALLBACK];
}
