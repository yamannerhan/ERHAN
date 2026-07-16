import { egmDuyurularProvider, egmHaberlerProvider } from "./egm";
import { guvenlikAkademiProvider } from "./guvenlik-akademi";
import { ogghaberProvider } from "./ogghaber";
import { ozelGuvenlikAjansProvider } from "./ozel-guvenlik-ajans";
import type { NewsProvider } from "./types";

const providers: Record<string, NewsProvider> = {
  [ozelGuvenlikAjansProvider.key]: ozelGuvenlikAjansProvider,
  [ogghaberProvider.key]: ogghaberProvider,
  [egmHaberlerProvider.key]: egmHaberlerProvider,
  [egmDuyurularProvider.key]: egmDuyurularProvider,
  [guvenlikAkademiProvider.key]: guvenlikAkademiProvider,
};

export function getProvider(key: string): NewsProvider | null {
  return providers[key] ?? null;
}

export function providerKeyFromUrl(url: string | null | undefined): string {
  const u = (url || "").toLowerCase();
  if (u.includes("ogghaber.net")) return "ogghaber";
  if (u.includes("ozelguvenlikajans.com")) return "ozel_guvenlik_ajans";
  if (u.includes("egm.gov.tr") && u.includes("duyuru")) return "egm_duyurular";
  if (u.includes("egm.gov.tr")) return "egm_haberler";
  if (u.includes("guvenlikakademi")) return "guvenlik_akademi";
  return "ozel_guvenlik_ajans";
}

export {
  ozelGuvenlikAjansProvider,
  ogghaberProvider,
  egmHaberlerProvider,
  egmDuyurularProvider,
  guvenlikAkademiProvider,
};
export type { NewsProvider, NewsListItem, NormalizedArticle } from "./types";
