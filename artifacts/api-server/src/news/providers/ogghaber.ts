import { createVegaCmsProvider } from "./vega-cms";

export const DEFAULT_OGG_BASE = "https://www.ogghaber.net";
export const DEFAULT_OGG_LISTING = "https://www.ogghaber.net/";

export const ogghaberProvider = createVegaCmsProvider({
  key: "ogghaber",
  host: "www.ogghaber.net",
  defaultListing: DEFAULT_OGG_LISTING,
  rssUrl: "https://www.ogghaber.net/rss.xml",
  defaultCategory: "Güncel",
  articlePathRe: /href=["'](https?:\/\/(?:www\.)?ogghaber\.net\/haber\/[^"']+)["']/gi,
});
