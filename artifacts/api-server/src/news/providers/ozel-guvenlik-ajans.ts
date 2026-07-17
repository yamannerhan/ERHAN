import { createVegaCmsProvider } from "./vega-cms";
import { fetchText } from "../utils";
import type { NewsListItem, NewsProvider } from "./types";

export const DEFAULT_BASE = "https://www.ozelguvenlikajans.com";
/** Ana liste: Güncel kategorisi — her habere girilip başlık/kapak/özet alınır */
export const DEFAULT_LISTING = "https://www.ozelguvenlikajans.com/haberler/guncel/";
const HOME_LISTING = "https://www.ozelguvenlikajans.com/";
const RSS_URL = "https://ozelguvenlikajans.com/rss.xml";

const baseProvider = createVegaCmsProvider({
  key: "ozel_guvenlik_ajans",
  host: "www.ozelguvenlikajans.com",
  defaultListing: DEFAULT_LISTING,
  rssUrl: RSS_URL,
  defaultCategory: "Güncel",
  articlePathRe: /href=["'](https?:\/\/(?:www\.)?ozelguvenlikajans\.com\/haber\/[^"']+\.html)["']/gi,
});

function normalizeArticleUrl(raw: string): string {
  try {
    const u = new URL(raw.trim(), DEFAULT_BASE);
    u.hash = "";
    u.search = "";
    if (u.hostname === "ozelguvenlikajans.com") u.hostname = "www.ozelguvenlikajans.com";
    return u.href.replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

function parseListingLinks(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["'](https?:\/\/(?:www\.)?ozelguvenlikajans\.com\/haber\/[^"']+\.html)["']/gi)) {
    out.push(normalizeArticleUrl(m[1]!));
  }
  for (const m of html.matchAll(/href=["'](\/haber\/[^"']+\.html)["']/gi)) {
    out.push(normalizeArticleUrl(new URL(m[1]!, pageUrl).href));
  }
  return out;
}

async function loadRssDates(): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  try {
    const res = await fetchText(RSS_URL);
    if (!res.ok) return map;
    for (const item of res.text.match(/<item>[\s\S]*?<\/item>/gi) || []) {
      const link = (item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]
        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
        .trim();
      const pub = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1]
        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
        .trim();
      if (!link || !/\/haber\/.+\.html/i.test(link)) continue;
      const n = normalizeArticleUrl(link);
      const d = pub ? new Date(pub) : null;
      if (d && !Number.isNaN(d.getTime())) {
        map.set(n, d);
        map.set(n.replace("www.", ""), d);
      }
    }
  } catch { /* ignore */ }
  return map;
}

/** Güncel + ana sayfa + RSS — her /haber/*.html detaya girilir */
export const ozelGuvenlikAjansProvider: NewsProvider = {
  key: baseProvider.key,

  async getArticleList(opts) {
    const primary = opts.listingUrl?.trim() || DEFAULT_LISTING;
    const pages = [...new Set([primary, DEFAULT_LISTING, HOME_LISTING])];
    const urlSet = new Set<string>();
    for (const page of pages) {
      const res = await fetchText(page);
      if (!res.ok) continue;
      for (const u of parseListingLinks(res.text, page)) urlSet.add(u);
    }
    const dates = await loadRssDates();
    for (const [u] of dates) urlSet.add(normalizeArticleUrl(u));
    if (!urlSet.size) throw new Error("Ajans Güncel listesi boş / erişilemedi");
    return [...urlSet].map((sourceUrl): NewsListItem => ({
      sourceUrl,
      lastmod: dates.get(sourceUrl) || dates.get(sourceUrl.replace("www.", "")) || null,
    }));
  },

  getArticleDetail: (url, hint) => baseProvider.getArticleDetail(url, hint),
};
