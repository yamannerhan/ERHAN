import { db, newsArticlesTable, newsImportLogsTable, newsSourcesTable, pool } from "@workspace/db";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { ensureNewsSchema } from "./ensure";
import { announceNewNews } from "../lib/news-announcements";
import { findDuplicateArticle, sourceHash } from "./dedup";
import { getProvider, providerKeyFromUrl } from "./providers";
import { DEFAULT_BASE, DEFAULT_LISTING } from "./providers/ozel-guvenlik-ajans";
import { DEFAULT_OGG_BASE, DEFAULT_OGG_LISTING } from "./providers/ogghaber";
import { EGM_DUYURULAR_LISTING, EGM_HABERLER_LISTING } from "./providers/egm";
import { DEFAULT_EGITIM_BASE, DEFAULT_EGITIM_LISTING } from "./providers/guvenlik-egitimi";
import { cleanNewsTitle, mapPool, resolveNewsImageUrl, sleep, slugifyTr } from "./utils";

const LOCK_KEY = "ozelguvenlik:news:scan";
const LOCK_KEY_LIFECYCLE = "ozelguvenlik:news:lifecycle";
const MAX_SCAN_MS = 18 * 60_000;
/** Yayın süresi: 20 gün sonra arşiv */
export const NEWS_PUBLISH_DAYS = 20;
/** Arşivde ek 7 gün, sonra sil */
export const NEWS_ARCHIVE_DAYS = 7;
/** İlk / varsayılan geriye bakış */
export const NEWS_LOOKBACK_DAYS = 10;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lifecycleHandle: ReturnType<typeof setInterval> | null = null;
let scanning = false;
let lastLifecycleDay: string | null = null;

async function tryAdvisoryLock(key = LOCK_KEY): Promise<boolean> {
  const res = await pool.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    [key],
  );
  return !!res.rows[0]?.locked;
}

async function releaseAdvisoryLock(key = LOCK_KEY): Promise<void> {
  await pool.query("SELECT pg_advisory_unlock(hashtext($1))", [key]).catch(() => undefined);
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

/** 20g → archived, arşivde +7g → sil. Manuel haberler dokunulmaz. */
export async function runNewsLifecycle(): Promise<{ archived: number; deleted: number }> {
  await ensureNewsSchema();
  const publishCutoff = new Date(Date.now() - NEWS_PUBLISH_DAYS * 24 * 60 * 60 * 1000);
  const deleteCutoff = new Date(Date.now() - NEWS_ARCHIVE_DAYS * 24 * 60 * 60 * 1000);

  const archivedRows = await db.update(newsArticlesTable).set({
    status: "archived",
    archivedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(newsArticlesTable.isManual, false),
    eq(newsArticlesTable.status, "published"),
    or(
      and(
        sql`${newsArticlesTable.sourcePublishedAt} IS NOT NULL`,
        lt(newsArticlesTable.sourcePublishedAt, publishCutoff),
      ),
      and(
        sql`${newsArticlesTable.sourcePublishedAt} IS NULL`,
        lt(newsArticlesTable.importedAt, publishCutoff),
      ),
    )!,
  )).returning({ id: newsArticlesTable.id });

  const deletedRows = await db.delete(newsArticlesTable)
    .where(and(
      eq(newsArticlesTable.isManual, false),
      eq(newsArticlesTable.status, "archived"),
      sql`${newsArticlesTable.archivedAt} IS NOT NULL`,
      lt(newsArticlesTable.archivedAt, deleteCutoff),
    ))
    .returning({ id: newsArticlesTable.id });

  if (archivedRows.length || deletedRows.length) {
    logger.info(
      { archived: archivedRows.length, deleted: deletedRows.length },
      "news: lifecycle archive/delete",
    );
  }
  return { archived: archivedRows.length, deleted: deletedRows.length };
}

/** @deprecated use runNewsLifecycle */
export async function purgeExpiredNews(): Promise<number> {
  const r = await runNewsLifecycle();
  return r.deleted;
}

type SourceSeed = {
  providerKey: string;
  name: string;
  baseUrl: string;
  listingUrl: string;
};

const SOURCE_SEEDS: SourceSeed[] = [
  {
    providerKey: "ozel_guvenlik_ajans",
    name: "Özel Güvenlik Ajans",
    baseUrl: DEFAULT_BASE,
    listingUrl: DEFAULT_LISTING,
  },
  {
    providerKey: "ogghaber",
    name: "OGG Haber",
    baseUrl: DEFAULT_OGG_BASE,
    listingUrl: DEFAULT_OGG_LISTING,
  },
  {
    providerKey: "guvenlik_akademi",
    name: "Güvenlik Akademi",
    baseUrl: "https://guvenlikakademi.com",
    listingUrl: "https://guvenlikakademi.com/sitemap.xml",
  },
  {
    providerKey: "guvenlik_egitimi",
    name: "Akademi Güvenlik Eğitimi",
    baseUrl: DEFAULT_EGITIM_BASE,
    listingUrl: DEFAULT_EGITIM_LISTING,
  },
  {
    providerKey: "egm_haberler",
    name: "EGM Özel Güvenlik Haberler",
    baseUrl: "https://www.egm.gov.tr",
    listingUrl: EGM_HABERLER_LISTING,
  },
  {
    providerKey: "egm_duyurular",
    name: "EGM Özel Güvenlik Duyurular",
    baseUrl: "https://www.egm.gov.tr",
    listingUrl: EGM_DUYURULAR_LISTING,
  },
];

/** 6 aktif kaynak · lookback 10 gün · sürekli arka plan tarama */
export async function ensureDefaultNewsSource(): Promise<void> {
  await ensureNewsSchema();

  for (const seed of SOURCE_SEEDS) {
    const [row] = await db.select()
      .from(newsSourcesTable)
      .where(eq(newsSourcesTable.providerKey, seed.providerKey))
      .limit(1);

    if (!row) {
      await db.insert(newsSourcesTable).values({
        name: seed.name,
        baseUrl: seed.baseUrl,
        listingUrl: seed.listingUrl,
        providerKey: seed.providerKey,
        isActive: true,
        scanIntervalMinutes: 30,
        initialLookbackDays: NEWS_LOOKBACK_DAYS,
        importMode: "full",
        downloadImages: false,
        showSource: true,
        showSourceLink: false,
        publishMode: "auto",
        initialScanDone: false,
        lastScanAt: null,
      });
    } else {
      const lookbackGrew = (row.initialLookbackDays || 0) < NEWS_LOOKBACK_DAYS;
      const reactivated = !row.isActive;
      await db.update(newsSourcesTable).set({
        name: seed.name,
        baseUrl: seed.baseUrl,
        listingUrl: seed.listingUrl,
        isActive: true,
        initialLookbackDays: NEWS_LOOKBACK_DAYS,
        importMode: "full",
        publishMode: "auto",
        showSource: true,
        showSourceLink: false,
        scanIntervalMinutes: 30,
        // Lookback genişledi veya kaynak yeniden açıldıysa hemen tara
        ...((lookbackGrew || reactivated) ? { lastScanAt: null as Date | null, initialScanDone: false } : {}),
        updatedAt: new Date(),
      }).where(eq(newsSourcesTable.id, row.id));
    }
  }

  await db.execute(sql`
    UPDATE news_articles
    SET
      status = 'published',
      publication_type = 'full',
      published_at = COALESCE(published_at, imported_at, NOW()),
      updated_at = NOW()
    WHERE is_manual = FALSE
      AND status = 'draft'
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
  const lookbackDays = source.initialLookbackDays || NEWS_LOOKBACK_DAYS;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const announceEnabled = !!source.initialScanDone;

  try {
    const list = await provider.getArticleList({
      baseUrl: source.baseUrl,
      listingUrl: source.listingUrl,
    });
    const candidates = list
      .filter((item) => {
        // Tarihsiz adayları da al — kesin tarih kontrolü detayda yapılır
        if (!item.lastmod) return true;
        return item.lastmod.getTime() >= cutoff.getTime();
      })
      .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0))
      .slice(0, source.initialScanDone ? 160 : 220);

    stats.discovered = candidates.length;

    // Hafif paralellik; kaynaklar döngüde sırayla
    await mapPool(candidates, 2, async (item) => {
      if (Date.now() - started > MAX_SCAN_MS) return;
      try {
        await sleep(220);
        const article = await provider.getArticleDetail(item.sourceUrl, { lastmod: item.lastmod });
        if (!article) {
          stats.failed += 1;
          return;
        }
        // Özet yoksa içerikten üret; tamamen boşsa atla
        const excerpt = (article.excerpt || "").trim().length >= 8
          ? article.excerpt
          : (article.contentHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
        if (!excerpt || excerpt.length < 8) {
          stats.skipped += 1;
          return;
        }
        article.excerpt = excerpt;

        if (article.sourcePublishedAt && article.sourcePublishedAt.getTime() < cutoff.getTime()) {
          stats.skipped += 1;
          return;
        }

        const title = cleanNewsTitle(article.title);
        const coverImage = resolveNewsImageUrl(article.coverImage, article.sourceUrl);

        const dup = await findDuplicateArticle({
          sourceUrl: article.sourceUrl,
          canonicalUrl: article.canonicalUrl,
          title,
          excerpt: article.excerpt,
          contentHtml: article.contentHtml,
        });

        if (dup) {
          // Aynı kayıt: kapak/metin tazele (archived değilse)
          const [exists] = await db.select().from(newsArticlesTable)
            .where(eq(newsArticlesTable.id, dup.id))
            .limit(1);
          if (exists && exists.status !== "archived") {
            await db.update(newsArticlesTable).set({
              content: article.contentHtml || exists.content,
              excerpt: article.excerpt || exists.excerpt,
              coverImage: coverImage || resolveNewsImageUrl(exists.coverImage, article.sourceUrl) || exists.coverImage,
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
        }).onConflictDoNothing().returning({
          id: newsArticlesTable.id,
          slug: newsArticlesTable.slug,
          title: newsArticlesTable.title,
        });

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
      details: { lookbackDays, cutoff: cutoff.toISOString(), source: source.name },
    }).where(eq(newsImportLogsTable.id, log.id));

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

export async function resetAutoImportedNews(): Promise<{ deleted: number }> {
  await ensureNewsSchema();
  let locked = false;
  for (let i = 0; i < 15; i++) {
    locked = await tryAdvisoryLock();
    if (locked) break;
    await sleep(1000);
  }
  try {
    const deleted = await db.delete(newsArticlesTable)
      .where(eq(newsArticlesTable.isManual, false))
      .returning({ id: newsArticlesTable.id });
    await db.delete(newsImportLogsTable);
    await db.update(newsSourcesTable).set({
      initialScanDone: false,
      lastScanAt: null,
      lastSuccessAt: null,
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(newsSourcesTable.isActive, true));
    logger.info({ deleted: deleted.length }, "news: auto-imported articles reset");
    return { deleted: deleted.length };
  } finally {
    if (locked) await releaseAdvisoryLock();
  }
}

export async function repairNewsArticles(limit = 80): Promise<{ repaired: number; failed: number }> {
  await ensureNewsSchema();
  const rows = await db.select()
    .from(newsArticlesTable)
    .where(and(
      eq(newsArticlesTable.isManual, false),
      sql`${newsArticlesTable.sourceUrl} IS NOT NULL`,
      sql`${newsArticlesTable.status} <> 'archived'`,
    ))
    .orderBy(desc(newsArticlesTable.importedAt))
    .limit(limit);

  let repaired = 0;
  let failed = 0;
  for (const row of rows) {
    const sourceUrl = row.sourceUrl;
    if (!sourceUrl) continue;
    const needs =
      !row.coverImage
      || !/^https?:\/\//i.test(row.coverImage)
      || !row.excerpt
      || (row.excerpt?.length || 0) < 40
      || !row.content
      || (row.content?.length || 0) < 400
      || row.publicationType !== "full";
    const stale = !row.lastCheckedAt || (Date.now() - row.lastCheckedAt.getTime() > 6 * 60 * 60 * 1000);
    if (!needs && !stale) continue;

    try {
      const provider = getProvider(providerKeyFromUrl(sourceUrl));
      if (!provider) { failed += 1; continue; }
      await sleep(300);
      const article = await provider.getArticleDetail(sourceUrl, {
        lastmod: row.sourcePublishedAt ?? undefined,
      });
      if (!article || !article.excerpt) {
        failed += 1;
        continue;
      }
      const title = cleanNewsTitle(article.title);
      const coverImage = resolveNewsImageUrl(article.coverImage, article.sourceUrl);
      await db.update(newsArticlesTable).set({
        title,
        metaTitle: title,
        excerpt: article.excerpt || row.excerpt,
        content: article.contentHtml || row.content,
        coverImage: coverImage || resolveNewsImageUrl(row.coverImage, sourceUrl) || row.coverImage,
        category: article.category || row.category,
        publicationType: "full",
        sourcePublishedAt: article.sourcePublishedAt || row.sourcePublishedAt,
        metaDescription: (article.excerpt || row.metaDescription || "").slice(0, 160),
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(newsArticlesTable.id, row.id));
      repaired += 1;
    } catch (err) {
      failed += 1;
      logger.warn({ err, id: row.id, sourceUrl }, "news: repair article failed");
    }
  }
  if (repaired || failed) {
    logger.info({ repaired, failed, total: rows.length }, "news: repair finished");
  }
  return { repaired, failed };
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
      .orderBy(newsSourcesTable.id);
    for (const source of sources) {
      const intervalMs = Math.max(10, source.scanIntervalMinutes || 30) * 60_000;
      const last = source.lastScanAt?.getTime() ?? 0;
      if (!force && source.initialScanDone && Date.now() - last < intervalMs) continue;
      try {
        await scanNewsSource(source.id, { force });
      } catch (err) {
        logger.error({ err, sourceId: source.id, name: source.name }, "news: source scan failed — continue");
      }
    }
    await repairNewsArticles(force ? 80 : 30);
  } catch (err) {
    logger.error({ err }, "news: scan cycle failed");
  } finally {
    await releaseAdvisoryLock();
    scanning = false;
  }
}

/** Europe/Istanbul 03:00 civarı lifecycle */
async function maybeRunLifecycleAt3am(): Promise<void> {
  const now = new Date();
  const tr = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const dayKey = `${tr.getFullYear()}-${tr.getMonth() + 1}-${tr.getDate()}`;
  if (tr.getHours() !== 3) return;
  if (lastLifecycleDay === dayKey) return;
  const locked = await tryAdvisoryLock(LOCK_KEY_LIFECYCLE);
  if (!locked) return;
  try {
    lastLifecycleDay = dayKey;
    await runNewsLifecycle();
  } finally {
    await releaseAdvisoryLock(LOCK_KEY_LIFECYCLE);
  }
}

export function startNewsWorker(): void {
  if (intervalHandle) return;
  void ensureDefaultNewsSource().catch(() => undefined);
  setTimeout(() => {
    void runNewsScanCycle(true).catch((err) => logger.error({ err }, "news: initial scan failed"));
  }, 12_000);
  setTimeout(() => {
    void repairNewsArticles(80).catch((err) => logger.warn({ err }, "news: boot repair failed"));
  }, 45_000);
  intervalHandle = setInterval(() => {
    void runNewsScanCycle(false).catch((err) => logger.error({ err }, "news: interval scan failed"));
  }, 5 * 60_000);
  lifecycleHandle = setInterval(() => {
    void maybeRunLifecycleAt3am().catch((err) => logger.warn({ err }, "news: lifecycle tick failed"));
  }, 15 * 60_000);
  logger.info("news: worker started (6 kaynak, 10g lookback, 30dk tarama, 20g arşiv+7g silme)");
}

export function stopNewsWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (lifecycleHandle) {
    clearInterval(lifecycleHandle);
    lifecycleHandle = null;
  }
}
