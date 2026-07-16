import { guvenlikAkademiProvider } from "./guvenlik-akademi";
import { ozelGuvenlikAjansProvider } from "./ozel-guvenlik-ajans";
import type { NewsProvider } from "./types";

const providers: Record<string, NewsProvider> = {
  [ozelGuvenlikAjansProvider.key]: ozelGuvenlikAjansProvider,
  [guvenlikAkademiProvider.key]: guvenlikAkademiProvider,
};

export function getProvider(key: string): NewsProvider | null {
  return providers[key] ?? null;
}

export { ozelGuvenlikAjansProvider, guvenlikAkademiProvider };
export type { NewsProvider, NewsListItem, NormalizedArticle } from "./types";
