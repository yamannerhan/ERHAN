export type NewsListItem = {
  sourceUrl: string;
  lastmod?: Date | null;
};

export type NormalizedArticle = {
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImage: string | null;
  category: string;
  authorName: string | null;
  sourceUrl: string;
  canonicalUrl: string | null;
  sourcePublishedAt: Date | null;
  sourcePublishedMissing: boolean;
  tags: string[];
};

export interface NewsProvider {
  key: string;
  getArticleList(opts: { baseUrl: string; listingUrl?: string | null }): Promise<NewsListItem[]>;
  getArticleDetail(url: string, hint?: { lastmod?: Date | null }): Promise<NormalizedArticle | null>;
}
