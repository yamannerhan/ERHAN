import { db, newsArticlesTable, newsImportLogsTable, newsSourcesTable, pool } from "@workspace/db";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { ensureNewsSchema } from "./ensure";
import { getProvider } from "./providers/guvenlik-akademi";
import { mapPool, sleep, slugifyTr, sourceHash } from "./utils";

const LOCK_KEY = "ozelguvenlik:news:scan";
const MAX_SCAN_MS = 12 * 60_000;
/** Otomatik haberler 10 günden eskiyse silinir */
export const NEWS_RETENTION_DAYS = 10;

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

export async function ensureDefaultNewsSource(): Promise<void> {
  await ensureNewsSchema();
  const [row] = await db.select({ id: newsSourcesTable.id })
    .from(newsSourcesTable)
    .where(eq(newsSourcesTable.providerKey, "guvenlik_akademi"))
    .limit(1);
  if (row) return;
  await db.insert(newsSourcesTable).values({
    name: "Güvenlik Akademi",
    baseUrl: "https://guvenlikakademi.com",
    listingUrl: "https://guvenlikakademi.com/sitemap.xml",
    providerKey: "guvenlik_akademi",
    isActive: true,
    scanIntervalMinutes: 30,
    initialLookbackDays: 5,
    importMode: "excerpt",
    downloadImages: false,
    showSource: true,
    showSourceLink: true,
    publishMode: "draft",
  });
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
  const lookbackDays = source.initialScanDone ? 3 : (source.initialLookbackDays || 5);
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const list = await provider.getArticleList({
      baseUrl: source.baseUrl,
      listingUrl: source.listingUrl,
    });
    const candidates = list
      .filter((item) => {
        if (!item.lastmod) return !source.initialScanDone; // lastmod yoksa sadece ilk taramada dene
        return item.lastmod.getTime() >= cutoff.getTime();
      })
      .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0))
      .slice(0, source.initialScanDone ? 40 : 80);

    stats.discovered = candidates.length;

    await mapPool(candidates, 2, async (item) => {
      if (Date.now() - started > MAX_SCAN_MS) return;
      try {
        const [exists] = await db.select({ id: newsArticlesTable.id })
          .from(newsArticlesTable)
          .where(eq(newsArticlesTable.sourceUrl, item.sourceUrl))
          .limit(1);
        if (exists) {
          stats.duplicates += 1;
          return;
        }

        await sleep(350);
        const article = await provider.getArticleDetail(item.sourceUrl, { lastmod: item.lastmod });
        if (!article) {
          stats.failed += 1;
          return;
        }

        // 5 günden eski (kaynak tarihi varsa) alma
        if (article.sourcePublishedAt && article.sourcePublishedAt.getTime() < cutoff.getTime()) {
          stats.skipped += 1;
          return;
        }

        const hash = sourceHash({
          sourceUrl: article.sourceUrl,
          title: article.title,
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

        const slug = await uniqueSlug(article.title);
        const now = new Date();
        const autoPublish = source.publishMode === "auto";
        const publicationType = source.importMode === "full" ? "full" : "excerpt";
        const content = publicationType === "full"
          ? article.contentHtml
          : `<p>${article.excerpt}</p>`;

        const inserted = await db.insert(newsArticlesTable).values({
          title: article.title,
          slug,
          excerpt: article.excerpt,
          content,
          coverImage: article.coverImage,
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
          publishedAt: autoPublish ? now : null,
          status: autoPublish ? "published" : "draft",
          publicationType,
          isManual: false,
          metaTitle: article.title,
          metaDescription: article.excerpt.slice(0, 160),
          tags: article.tags,
          lastCheckedAt: now,
        }).onConflictDoNothing().returning({ id: newsArticlesTable.id });

        if (inserted.length) stats.imported += 1;
        else stats.duplicates += 1;
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
  // İlk tarama kısa gecikmeyle
  setTimeout(() => {
    void runNewsScanCycle(true).catch((err) => logger.error({ err }, "news: initial scan failed"));
  }, 15_000);
  intervalHandle = setInterval(() => {
    void runNewsScanCycle(false).catch((err) => logger.error({ err }, "news: interval scan failed"));
  }, 5 * 60_000); // her 5 dk kontrol; kaynak interval'ı scanner içinde uygulanır
  logger.info("news: worker started (30dk kaynak aralığı, 10g saklama)");
}

export function stopNewsWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
