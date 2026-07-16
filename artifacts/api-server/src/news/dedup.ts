import { db, newsArticlesTable } from "@workspace/db";
import { and, desc, eq, gte, ne, or, sql } from "drizzle-orm";
import { sourceHash, stripHtml } from "./utils";
import {
  contentFingerprint,
  normalizeCanonical,
  textSimilarity,
  titleKey,
  urlVariants,
} from "./dedup-core";

export type DedupHit = { id: number; reason: string };

export {
  contentFingerprint,
  normalizeCanonical,
  textSimilarity,
  titleKey,
  urlVariants,
};

/** URL / canonical / hash / başlık / içerik benzerliği ile mükerrer kontrol */
export async function findDuplicateArticle(input: {
  sourceUrl: string;
  canonicalUrl?: string | null;
  title: string;
  excerpt?: string | null;
  contentHtml?: string | null;
  excludeId?: number;
}): Promise<DedupHit | null> {
  const variants = [
    ...urlVariants(input.sourceUrl),
    ...urlVariants(input.canonicalUrl),
  ];
  const hash = sourceHash({
    sourceUrl: normalizeCanonical(input.sourceUrl) || input.sourceUrl,
    title: input.title,
    excerpt: input.excerpt || "",
  });
  const tKey = titleKey(input.title);
  const fp = contentFingerprint(input.contentHtml || input.excerpt || input.title);
  const exclude = input.excludeId
    ? ne(newsArticlesTable.id, input.excludeId)
    : sql`TRUE`;

  if (variants.length) {
    const [byUrl] = await db.select({ id: newsArticlesTable.id })
      .from(newsArticlesTable)
      .where(and(
        exclude,
        or(
          ...variants.flatMap((v) => [
            eq(newsArticlesTable.sourceUrl, v),
            eq(newsArticlesTable.canonicalUrl, v),
          ]),
        )!,
      ))
      .limit(1);
    if (byUrl) return { id: byUrl.id, reason: "url_or_canonical" };
  }

  const [byHash] = await db.select({ id: newsArticlesTable.id })
    .from(newsArticlesTable)
    .where(and(exclude, eq(newsArticlesTable.sourceHash, hash)))
    .limit(1);
  if (byHash) return { id: byHash.id, reason: "source_hash" };

  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const recent = await db.select({
    id: newsArticlesTable.id,
    title: newsArticlesTable.title,
    excerpt: newsArticlesTable.excerpt,
    content: newsArticlesTable.content,
  })
    .from(newsArticlesTable)
    .where(and(
      exclude,
      gte(newsArticlesTable.importedAt, since),
    ))
    .orderBy(desc(newsArticlesTable.importedAt))
    .limit(150);

  for (const row of recent) {
    if (titleKey(row.title) === tKey && tKey.length >= 12) {
      return { id: row.id, reason: "title" };
    }
    const simTitle = textSimilarity(input.title, row.title);
    if (simTitle >= 0.88) {
      return { id: row.id, reason: "title_similarity" };
    }
    const otherFp = contentFingerprint(row.content || row.excerpt || row.title);
    if (otherFp === fp && (input.contentHtml || input.excerpt || "").length > 80) {
      return { id: row.id, reason: "content_hash" };
    }
    const simBody = textSimilarity(
      stripHtml(input.contentHtml || input.excerpt || "").slice(0, 800),
      stripHtml(row.content || row.excerpt || "").slice(0, 800),
    );
    if (simBody >= 0.82 && simTitle >= 0.55) {
      return { id: row.id, reason: "content_similarity" };
    }
  }

  return null;
}

export { sourceHash };
