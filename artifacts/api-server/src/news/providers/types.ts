export type NewsListItem = {
  sourceUrl: string;
  lastmod?: Date | null;
  /** Liste kartından gelen kapak (detay sayfasında yoksa kullanılır) */
  coverImage?: string | null;
  title?: string | null;
};

export type ArticleDetailHint = {
  lastmod?: Date | null;
  coverImage?: string | null;
  title?: string | null;
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
  getArticleDetail(url: string, hint?: ArticleDetailHint): Promise<NormalizedArticle | null>;
}
