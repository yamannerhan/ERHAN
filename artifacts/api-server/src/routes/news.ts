import { Router } from "express";
import { db, newsArticlesTable, newsImportLogsTable, newsSourcesTable } from "@workspace/db";
import { and, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";
import { ensureNewsSchema } from "../news/ensure";
import { ensureDefaultNewsSource, runNewsScanCycle, scanNewsSource } from "../news/scanner";
import { cleanNewsTitle, sanitizeNewsHtml, slugifyTr, sourceHash } from "../news/utils";

const router = Router();

function publicArticle(row: typeof newsArticlesTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    coverImage: row.coverImage,
    category: row.category,
    authorName: row.authorName,
    publicationType: row.publicationType,
    publishedAt: row.publishedAt,
    sourcePublishedAt: row.sourcePublishedAt,
    importedAt: row.importedAt,
    viewCount: row.viewCount,
    isFeatured: row.isFeatured,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
  };
}

/** Ana sayfa: en yeni 3 yayınlanmış haber */
router.get("/news/home", async (_req, res) => {
  try {
    await ensureNewsSchema();
    const now = new Date();
    const rows = await db.select().from(newsArticlesTable)
      .where(and(
        eq(newsArticlesTable.status, "published"),
        or(
          sql`${newsArticlesTable.publishedAt} IS NULL`,
          lte(newsArticlesTable.publishedAt, now),
        )!,
      ))
      .orderBy(desc(newsArticlesTable.publishedAt), desc(newsArticlesTable.id))
      .limit(3);
    res.json({ articles: rows.map(publicArticle) });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Haberler alınamadı" });
  }
});

router.get("/news", async (req, res) => {
  try {
    await ensureNewsSchema();
    const page = Math.max(1, Number(req.query["page"] ?? 1));
    const limit = Math.min(48, Math.max(1, Number(req.query["limit"] ?? 12)));
    const q = String(req.query["q"] ?? "").trim();
    const category = String(req.query["category"] ?? "").trim();
    const conditions = [eq(newsArticlesTable.status, "published")];
    if (category) conditions.push(eq(newsArticlesTable.category, category));
    if (q) {
      conditions.push(or(
        ilike(newsArticlesTable.title, `%${q}%`),
        ilike(newsArticlesTable.excerpt, `%${q}%`),
      )!);
    }
    const offset = (page - 1) * limit;
    const rows = await db.select().from(newsArticlesTable)
      .where(and(...conditions))
      .orderBy(desc(newsArticlesTable.publishedAt), desc(newsArticlesTable.id))
      .limit(limit)
      .offset(offset);
    const [countRow] = await db.select({ c: sql<number>`count(*)::int` })
      .from(newsArticlesTable)
      .where(and(...conditions));
    res.json({
      articles: rows.map(publicArticle),
      page,
      limit,
      total: Number(countRow?.c ?? 0),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Haberler alınamadı" });
  }
});

router.get("/news/:slug", async (req, res) => {
  try {
    await ensureNewsSchema();
    const slug = String(req.params.slug || "");
    const [row] = await db.select().from(newsArticlesTable)
      .where(and(eq(newsArticlesTable.slug, slug), eq(newsArticlesTable.status, "published")))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Haber bulunamadı" });
      return;
    }
    await db.update(newsArticlesTable)
      .set({ viewCount: sql`${newsArticlesTable.viewCount} + 1` })
      .where(eq(newsArticlesTable.id, row.id));
    res.json({
      article: {
        ...publicArticle(row),
        showSource: false,
        showSourceLink: false,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Haber alınamadı" });
  }
});

/** Admin */
router.get("/admin/news", authMiddleware, requireAdmin, async (req, res) => {
  await ensureNewsSchema();
  const status = String(req.query["status"] ?? "").trim();
  const rows = await db.select().from(newsArticlesTable)
    .where(status ? eq(newsArticlesTable.status, status) : undefined)
    .orderBy(desc(newsArticlesTable.importedAt), desc(newsArticlesTable.id))
    .limit(200);
  res.json({ articles: rows });
});

router.post("/admin/news", authMiddleware, requireAdmin, async (req, res) => {
  await ensureNewsSchema();
  const body = req.body as {
    title?: string; excerpt?: string; content?: string; coverImage?: string;
    category?: string; status?: string; publishedAt?: string;
  };
  const title = cleanNewsTitle(String(body.title || "").trim());
  if (!title || title === "Haber") {
    res.status(400).json({ error: "Başlık gerekli" });
    return;
  }
  let slug = slugifyTr(title);
  const [clash] = await db.select({ id: newsArticlesTable.id }).from(newsArticlesTable).where(eq(newsArticlesTable.slug, slug)).limit(1);
  if (clash) slug = `${slug}-${Date.now()}`;
  const now = new Date();
  const status = body.status === "published" ? "published" : "draft";
  const hash = sourceHash({ sourceUrl: `manual://${slug}`, title, excerpt: body.excerpt || "" });
  const [row] = await db.insert(newsArticlesTable).values({
    title,
    slug,
    excerpt: body.excerpt || null,
    content: body.content ? sanitizeNewsHtml(body.content) : null,
    coverImage: body.coverImage || null,
    category: body.category || "Genel Haberler",
    sourceHash: hash,
    status,
    publicationType: "manual",
    isManual: true,
    publishedAt: status === "published" ? (body.publishedAt ? new Date(body.publishedAt) : now) : null,
    createdBy: req.user!.id,
    metaTitle: title,
    metaDescription: (body.excerpt || "").slice(0, 160),
  }).returning();
  res.json({ success: true, article: row });
});

router.patch("/admin/news/:id", authMiddleware, requireAdmin, async (req, res) => {
  await ensureNewsSchema();
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof newsArticlesTable.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["title", "excerpt", "content", "coverImage", "category", "status", "authorName", "sourceName", "sourceUrl"] as const) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
  }
  if (typeof patch.content === "string") patch.content = sanitizeNewsHtml(patch.content);
  if (body.status === "published" && !body.publishedAt) {
    patch.publishedAt = new Date();
  }
  if (typeof body.publishedAt === "string") patch.publishedAt = new Date(body.publishedAt);
  if (typeof body.isFeatured === "boolean") patch.isFeatured = body.isFeatured;
  const [row] = await db.update(newsArticlesTable).set(patch).where(eq(newsArticlesTable.id, id)).returning();
  res.json({ success: true, article: row });
});

router.delete("/admin/news/:id", authMiddleware, requireAdmin, async (req, res) => {
  await ensureNewsSchema();
  const id = Number(req.params.id);
  await db.delete(newsArticlesTable).where(eq(newsArticlesTable.id, id));
  res.json({ success: true });
});

router.get("/admin/news-sources", authMiddleware, requireAdmin, async (_req, res) => {
  await ensureDefaultNewsSource();
  const sources = await db.select().from(newsSourcesTable).orderBy(desc(newsSourcesTable.id));
  res.json({ sources });
});

router.patch("/admin/news-sources/:id", authMiddleware, requireAdmin, async (req, res) => {
  await ensureNewsSchema();
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof newsSourcesTable.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "name", "baseUrl", "listingUrl", "isActive", "scanIntervalMinutes", "initialLookbackDays",
    "importMode", "downloadImages", "showSource", "showSourceLink", "publishMode",
  ] as const) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
  }
  const [row] = await db.update(newsSourcesTable).set(patch).where(eq(newsSourcesTable.id, id)).returning();
  res.json({ success: true, source: row });
});

router.post("/admin/news-sources/:id/scan-now", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    void scanNewsSource(id, { force: true }).catch(() => undefined);
    res.json({ success: true, message: "Tarama başlatıldı" });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/news/scan-now", authMiddleware, requireAdmin, async (_req, res) => {
  void runNewsScanCycle(true).catch(() => undefined);
  res.json({ success: true, message: "Tüm aktif kaynaklar taranıyor" });
});

router.get("/admin/news-import-logs", authMiddleware, requireAdmin, async (_req, res) => {
  await ensureNewsSchema();
  const logs = await db.select().from(newsImportLogsTable)
    .orderBy(desc(newsImportLogsTable.startedAt))
    .limit(50);
  res.json({ logs });
});

/** Cron secret ile dış tetik (Railway cron) */
router.post("/cron/news-scan", async (req, res) => {
  const secret = process.env["CRON_SECRET"] || process.env["NEWS_CRON_SECRET"];
  const header = String(req.headers["x-cron-secret"] || "");
  if (!secret || header !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  void runNewsScanCycle(true).catch(() => undefined);
  res.json({ success: true });
});

export default router;
