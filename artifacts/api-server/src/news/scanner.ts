import { db, newsArticlesTable, newsImportLogsTable, newsSourcesTable, pool } from "@workspace/db";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { ensureNewsSchema } from "./ensure";
import { announceNewNews } from "../lib/news-announcements";
import { getProvider } from "./providers/guvenlik-akademi";
import { cleanNewsTitle, mapPool, resolveNewsImageUrl, sleep, slugifyTr, sourceHash } from "./utils";

const LOCK_KEY = "ozelguvenlik:news:scan";
const MAX_SCAN_MS = 12 * 60_000;
/** Otomatik haberler 20 günden eskiyse silinir */
export const NEWS_RETENTION_DAYS = 20;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let scanning = false;

async function tryAdvisoryLock(): Promise<boolean> {
  const res = await pool.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    [LOCK_KEY],
  );
  return !!res.rows[0]?.locked;
}

async function releaseAdvisoryLock(): Promise<void> {
  await pool.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => undefined);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugifyTr(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const [row] = await db.select({ id: newsArticlesTable.id })
      .from(newsArticlesTable)
      .where(eq(newsArticlesTable.slug, candidate))
      .limit(1);
    if (!row) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

export async function purgeExpiredNews(): Promise<number> {
  await ensureNewsSchema();
  const cutoff = new Date(Date.now() - NEWS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(newsArticlesTable)
    .where(and(
      eq(newsArticlesTable.isManual, false),
      or(
        and(
          sql`${newsArticlesTable.sourcePublishedAt} IS NOT NULL`,
          lt(newsArticlesTable.sourcePublishedAt, cutoff),
        ),
        and(
          sql`${newsArticlesTable.sourcePublishedAt} IS NULL`,
          lt(newsArticlesTable.importedAt, cutoff),
        ),
      )!,
    ))
    .returning({ id: newsArticlesTable.id });
  if (deleted.length) {
    logger.info({ count: deleted.length, cutoff }, "news: purged articles older than retention");
  }
  return deleted.length;
}

/** Mevcut kaynak/ayarları istenen çalışma moduna çeker */
export async function ensureDefaultNewsSource(): Promise<void> {
  await ensureNewsSchema();
  const [row] = await db.select()
    .from(newsSourcesTable)
    .where(eq(newsSourcesTable.providerKey, "guvenlik_akademi"))
    .limit(1);

  if (!row) {
    await db.insert(newsSourcesTable).values({
      name: "Güvenlik Akademi",
      baseUrl: "https://guvenlikakademi.com",
      listingUrl: "https://guvenlikakademi.com/sitemap.xml",
      providerKey: "guvenlik_akademi",
      isActive: true,
      scanIntervalMinutes: 30,
      initialLookbackDays: 20,
      importMode: "full",
      downloadImages: false,
      showSource: false,
      showSourceLink: false,
      publishMode: "auto",
    });
  } else {
    const needsRescan =
      row.initialLookbackDays < 20
      || row.importMode !== "full"
      || row.publishMode !== "auto";
    await db.update(newsSourcesTable).set({
      initialLookbackDays: 20,
      importMode: "full",
      publishMode: "auto",
      showSource: false,
      showSourceLink: false,
      // Ayar değiştiyse bir kez tam tarama; mevcut ince kayıtlar scan içinde yenilenir
      ...(needsRescan ? { lastScanAt: null } : {}),
      updatedAt: new Date(),
    }).where(eq(newsSourcesTable.id, row.id));
  }

  // Eski taslak / özet otomatik haberleri hemen yayınla
  await db.execute(sql`
    UPDATE news_articles
    SET
      status = 'published',
      publication_type = 'full',
      published_at = COALESCE(published_at, imported_at, NOW()),
      updated_at = NOW()
    WHERE is_manual = FALSE
      AND (status = 'draft' OR publication_type = 'excerpt')
  `);

  // Başlıklardan kaynak site adını temizle
  await db.execute(sql`
    UPDATE news_articles
    SET
      title = TRIM(REGEXP_REPLACE(title, '\s*[\|\-–—·•]\s*[Gg][üu]venlik\s*[Aa]kademi(si)?(\.com)?\s*$', '', 'g')),
      meta_title = TRIM(REGEXP_REPLACE(COALESCE(meta_title, title), '\s*[\|\-–—·•]\s*[Gg][üu]venlik\s*[Aa]kademi(si)?(\.com)?\s*$', '', 'g')),
      updated_at = NOW()
    WHERE title ~* 'güvenlik\s*akademi|guvenlikakademi'
       OR COALESCE(meta_title, '') ~* 'güvenlik\s*akademi|guvenlikakademi'
  `);
}

export async function scanNewsSource(sourceId: number, opts?: { force?: boolean }): Promise<{
  imported: number;
  duplicates: number;
  skipped: number;
  failed: number;
  discovered: number;
}> {
  await ensureNewsSchema();
  const [source] = await db.select().from(newsSourcesTable)
    .where(eq(newsSourcesTable.id, sourceId))
    .limit(1);
  if (!source) throw new Error("Kaynak bulunamadı");
  if (!source.isActive && !opts?.force) throw new Error("Kaynak pasif");

  const provider = getProvider(source.providerKey);
  if (!provider) throw new Error(`Provider yok: ${source.providerKey}`);

  const [log] = await db.insert(newsImportLogsTable).values({
    sourceId: source.id,
    status: "running",
  }).returning();

  const stats = { imported: 0, duplicates: 0, skipped: 0, failed: 0, discovered: 0 };
  const started = Date.now();
  const lookbackDays = source.initialLookbackDays || NEWS_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  /** İlk tarama hariç yeni haberleri kullanıcıya duyur */
  const announceEnabled = !!source.initialScanDone;

  try {
    const list = await provider.getArticleList({
      baseUrl: source.baseUrl,
      listingUrl: source.listingUrl,
    });
    const candidates = list
      .filter((item) => {
        if (!item.lastmod) return !source.initialScanDone;
        return item.lastmod.getTime() >= cutoff.getTime();
      })
      .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0))
      .slice(0, source.initialScanDone ? 60 : 160);

    stats.discovered = candidates.length;

    await mapPool(candidates, 2, async (item) => {
      if (Date.now() - started > MAX_SCAN_MS) return;
      try {
        const [exists] = await db.select()
          .from(newsArticlesTable)
          .where(eq(newsArticlesTable.sourceUrl, item.sourceUrl))
          .limit(1);

        await sleep(350);
        const article = await provider.getArticleDetail(item.sourceUrl, { lastmod: item.lastmod });
        if (!article) {
          stats.failed += 1;
          return;
        }

        if (article.sourcePublishedAt && article.sourcePublishedAt.getTime() < cutoff.getTime()) {
          stats.skipped += 1;
          return;
        }

        const title = cleanNewsTitle(article.title);
        const coverImage = resolveNewsImageUrl(article.coverImage, article.sourceUrl);

        // Mevcut kaydı tam içerik + kapak + temiz başlık ile güncelle
        if (exists) {
          const contentLen = exists.content?.length || 0;
          const coverIsRelative = !!exists.coverImage && !/^https?:\/\//i.test(exists.coverImage);
          const needsRefresh =
            exists.publicationType !== "full"
            || contentLen < 400
            || !exists.coverImage
            || coverIsRelative
            || exists.status !== "published"
            || /güvenlik\s*akademi|guvenlikakademi/i.test(exists.title);
          if (needsRefresh) {
            await db.update(newsArticlesTable).set({
              title,
              metaTitle: title,
              content: article.contentHtml,
              excerpt: article.excerpt || exists.excerpt,
              coverImage: coverImage || resolveNewsImageUrl(exists.coverImage, article.sourceUrl) || exists.coverImage,
              publicationType: "full",
              status: "published",
              publishedAt: exists.publishedAt || new Date(),
              sourcePublishedAt: article.sourcePublishedAt || exists.sourcePublishedAt,
              metaDescription: (article.excerpt || exists.metaDescription || "").slice(0, 160),
              lastCheckedAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(newsArticlesTable.id, exists.id));
          }
          stats.duplicates += 1;
          return;
        }

        const hash = sourceHash({
          sourceUrl: article.sourceUrl,
          title,
          excerpt: article.excerpt,
        });
        const [hashDup] = await db.select({ id: newsArticlesTable.id })
          .from(newsArticlesTable)
          .where(eq(newsArticlesTable.sourceHash, hash))
          .limit(1);
        if (hashDup) {
          stats.duplicates += 1;
          return;
        }

        const slug = await uniqueSlug(title);
        const now = new Date();
        const autoPublish = source.publishMode !== "draft";
        const publicationType = source.importMode === "excerpt" ? "excerpt" : "full";
        const content = publicationType === "full"
          ? article.contentHtml
          : `<p>${article.excerpt}</p>`;

        const inserted = await db.insert(newsArticlesTable).values({
          title,
          slug,
          excerpt: article.excerpt,
          content,
          coverImage,
          category: article.category,
          authorName: article.authorName,
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: article.sourceUrl,
          canonicalUrl: article.canonicalUrl,
          sourceExternalId: article.sourceUrl.split("/").filter(Boolean).pop() || null,
          sourceHash: hash,
          sourcePublishedAt: article.sourcePublishedAt,
          importedAt: now,
          publishedAt: autoPublish ? (article.sourcePublishedAt || now) : null,
          status: autoPublish ? "published" : "draft",
          publicationType,
          isManual: false,
          metaTitle: title,
          metaDescription: article.excerpt.slice(0, 160),
          tags: article.tags,
          lastCheckedAt: now,
        }).onConflictDoNothing().returning({ id: newsArticlesTable.id, slug: newsArticlesTable.slug, title: newsArticlesTable.title });

        if (inserted.length) {
          stats.imported += 1;
          if (announceEnabled && autoPublish) {
            void announceNewNews({
              id: inserted[0].id,
              title: inserted[0].title,
              slug: inserted[0].slug,
            }).catch((err) => logger.warn({ err }, "news: announce failed"));
          }
        } else {
          stats.duplicates += 1;
        }
        if (article.sourcePublishedMissing) {
          logger.warn({ url: article.sourceUrl }, "news: kaynak yayın tarihi bulunamadı");
        }
      } catch (err) {
        stats.failed += 1;
        logger.warn({ err, url: item.sourceUrl }, "news: article import failed");
      }
    });

    await db.update(newsSourcesTable).set({
      lastScanAt: new Date(),
      lastSuccessAt: new Date(),
      lastError: null,
      initialScanDone: true,
      updatedAt: new Date(),
    }).where(eq(newsSourcesTable.id, source.id));

    await db.update(newsImportLogsTable).set({
      finishedAt: new Date(),
      status: "success",
      discoveredCount: stats.discovered,
      importedCount: stats.imported,
      duplicateCount: stats.duplicates,
      skippedCount: stats.skipped,
      failedCount: stats.failed,
      details: { lookbackDays, cutoff: cutoff.toISOString() },
    }).where(eq(newsImportLogsTable.id, log.id));

    await purgeExpiredNews();
    return stats;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(newsSourcesTable).set({
      lastScanAt: new Date(),
      lastError: msg.slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(newsSourcesTable.id, source.id));
    await db.update(newsImportLogsTable).set({
      finishedAt: new Date(),
      status: "failed",
      discoveredCount: stats.discovered,
      importedCount: stats.imported,
      duplicateCount: stats.duplicates,
      skippedCount: stats.skipped,
      failedCount: stats.failed,
      errorMessage: msg.slice(0, 800),
    }).where(eq(newsImportLogsTable.id, log.id));
    throw err;
  }
}

export async function runNewsScanCycle(force = false): Promise<void> {
  if (scanning) {
    logger.info("news: scan already running — skip");
    return;
  }
  scanning = true;
  const locked = await tryAdvisoryLock();
  if (!locked) {
    scanning = false;
    logger.info("news: advisory lock busy — skip");
    return;
  }
  try {
    await ensureDefaultNewsSource();
    const sources = await db.select().from(newsSourcesTable)
      .where(eq(newsSourcesTable.isActive, true))
      .orderBy(desc(newsSourcesTable.id));
    for (const source of sources) {
      const intervalMs = Math.max(10, source.scanIntervalMinutes || 30) * 60_000;
      const last = source.lastScanAt?.getTime() ?? 0;
      if (!force && source.initialScanDone && Date.now() - last < intervalMs) continue;
      await scanNewsSource(source.id, { force });
    }
  } catch (err) {
    logger.error({ err }, "news: scan cycle failed");
  } finally {
    await releaseAdvisoryLock();
    scanning = false;
  }
}

export function startNewsWorker(): void {
  if (intervalHandle) return;
  void ensureDefaultNewsSource().catch(() => undefined);
  setTimeout(() => {
    void runNewsScanCycle(true).catch((err) => logger.error({ err }, "news: initial scan failed"));
  }, 15_000);
  intervalHandle = setInterval(() => {
    void runNewsScanCycle(false).catch((err) => logger.error({ err }, "news: interval scan failed"));
  }, 5 * 60_000);
  logger.info("news: worker started (30dk kaynak aralığı, 20g saklama, otomatik yayın)");
}

export function stopNewsWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
