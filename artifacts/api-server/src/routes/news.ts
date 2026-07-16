import { Router } from "express";
import { db, newsArticlesTable, newsImportLogsTable, newsSourcesTable } from "@workspace/db";
import { and, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";
import { ensureNewsSchema } from "../news/ensure";
import { ensureDefaultNewsSource, runNewsScanCycle, scanNewsSource } from "../news/scanner";
import { cleanNewsTitle, resolveNewsImageUrl, sanitizeNewsHtml, slugifyTr, sourceHash } from "../news/utils";

const router = Router();

function toProxiedImage(abs: string | null | undefined): string | null {
  if (!abs) return null;
  if (abs.startsWith("/api/news/image")) return abs;
  return `/api/news/image?url=${encodeURIComponent(abs)}`;
}

function toPublicCover(row: typeof newsArticlesTable.$inferSelect): string | null {
  // Hotlink / referer engellerine karşı her zaman kendi proxy’mizden sun
  const abs = resolveNewsImageUrl(row.coverImage, row.sourceUrl || row.canonicalUrl);
  return toProxiedImage(abs);
}

function proxyInlineImages(html: string | null | undefined): string | null {
  if (!html) return html ?? null;
  return html.replace(
    /(<img\b[^>]*\bsrc=["'])(https?:\/\/[^"']+)(["'])/gi,
    (_m, pre: string, url: string, post: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        if (
          host.includes("ozelguvenlikajans")
          || host.includes("ogghaber")
          || host.includes("egm.gov.tr")
          || host.includes("guvenlikakademi")
          || host.includes("guvenlikegitimi")
          || host.endsWith(".wp.com")
        ) {
          return `${pre}${toProxiedImage(url)}${post}`;
        }
      } catch { /* keep original */ }
      return `${pre}${url}${post}`;
    },
  );
}

function publicArticle(row: typeof newsArticlesTable.$inferSelect) {
  return {
    id: row.id,
    title: cleanNewsTitle(row.title),
    slug: row.slug,
    excerpt: row.excerpt,
    content: proxyInlineImages(row.content),
    coverImage: toPublicCover(row),
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
    sourceName: row.sourceName,
    sourceUrl: row.isManual && row.sourceUrl && !row.sourceUrl.startsWith("manual://")
      ? row.sourceUrl
      : null,
    /** Manuel haberlerde adminin eklediği dış link */
    externalUrl: row.isManual && row.sourceUrl && !row.sourceUrl.startsWith("manual://")
      ? row.sourceUrl
      : null,
  };
}

/** Kapak görseli proxy — harici hotlink / referer sorunlarını önler */
router.get("/news/image", async (req, res) => {
  try {
    const raw = String(req.query["url"] || "").trim();
    if (!raw) {
      res.status(400).type("text/plain").send("missing url");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      res.status(400).type("text/plain").send("bad url");
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      res.status(400).type("text/plain").send("bad protocol");
      return;
    }
    const host = parsed.hostname.toLowerCase();
    const allowed =
      host === "ozelguvenlikajans.com"
      || host.endsWith(".ozelguvenlikajans.com")
      || host === "ogghaber.net"
      || host.endsWith(".ogghaber.net")
      || host === "egm.gov.tr"
      || host.endsWith(".egm.gov.tr")
      ||       host === "guvenlikakademi.com"
      || host.endsWith(".guvenlikakademi.com")
      || host === "guvenlikegitimi.com"
      || host.endsWith(".guvenlikegitimi.com")
      || host.endsWith(".wp.com")
      || host.endsWith(".googleusercontent.com");
    if (!allowed) {
      // Aktif kaynak base_url hostlarına da izin ver
      await ensureNewsSchema();
      const sources = await db.select({ baseUrl: newsSourcesTable.baseUrl }).from(newsSourcesTable);
      const ok = sources.some((s) => {
        try { return new URL(s.baseUrl).hostname.toLowerCase() === host; }
        catch { return false; }
      });
      if (!ok) {
        res.status(403).type("text/plain").send("host not allowed");
        return;
      }
    }

    const upstream = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "ozelguvenlik-newsbot/1.0 (+https://ozelguvenlik.online)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: `${parsed.origin}/`,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) {
      res.status(upstream.status).type("text/plain").send("upstream error");
      return;
    }
    const ctype = upstream.headers.get("content-type") || "";
    if (!/^image\//i.test(ctype)) {
      res.status(415).type("text/plain").send("not an image");
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) {
      res.status(413).type("text/plain").send("too large");
      return;
    }
    res.setHeader("Content-Type", ctype);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(buf);
  } catch (e) {
    res.status(502).type("text/plain").send(e instanceof Error ? e.message : "proxy failed");
  }
});

const newestOrder = sql`COALESCE(${newsArticlesTable.publishedAt}, ${newsArticlesTable.sourcePublishedAt}, ${newsArticlesTable.importedAt})`;

/** Ana sayfa: en yeni 3 yayınlanmış haber (en yeniden eskiye) */
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
      .orderBy(desc(newestOrder), desc(newsArticlesTable.id))
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
      .orderBy(desc(newestOrder), desc(newsArticlesTable.id))
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
        showSource: true,
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
    category?: string; status?: string; publishedAt?: string; linkUrl?: string; sourceUrl?: string;
    sourceName?: string;
  };
  const title = String(body.title || "").trim();
  if (!title) {
    res.status(400).json({ error: "Başlık gerekli" });
    return;
  }
  let slug = slugifyTr(title);
  const [clash] = await db.select({ id: newsArticlesTable.id }).from(newsArticlesTable).where(eq(newsArticlesTable.slug, slug)).limit(1);
  if (clash) slug = `${slug}-${Date.now()}`;
  const now = new Date();
  const status = body.status === "published" ? "published" : "draft";
  const linkRaw = String(body.linkUrl || body.sourceUrl || "").trim();
  let linkUrl: string | null = null;
  if (linkRaw) {
    try {
      const u = new URL(linkRaw);
      if (["http:", "https:"].includes(u.protocol)) linkUrl = u.toString();
    } catch {
      res.status(400).json({ error: "Geçersiz link adresi" });
      return;
    }
  }
  const hash = sourceHash({ sourceUrl: linkUrl || `manual://${slug}`, title, excerpt: body.excerpt || "" });
  const [row] = await db.insert(newsArticlesTable).values({
    title,
    slug,
    excerpt: body.excerpt || null,
    content: body.content ? sanitizeNewsHtml(body.content) : null,
    coverImage: body.coverImage || null,
    category: body.category || "Genel Haberler",
    sourceName: body.sourceName?.trim() || "Manuel",
    sourceUrl: linkUrl,
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

router.post("/admin/news/repair", authMiddleware, requireAdmin, async (_req, res) => {
  const { repairNewsArticles } = await import("../news/scanner");
  void repairNewsArticles(150).catch(() => undefined);
  res.json({ success: true, message: "Haber kapak/içerik onarımı başlatıldı" });
});

router.post("/admin/news/lifecycle", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const { runNewsLifecycle } = await import("../news/scanner");
    const result = await runNewsLifecycle();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Lifecycle failed" });
  }
});

/** Otomatik haberleri silip kaynaklardan sıfırdan yeniden çeker (manuel haberler kalır) */
router.post("/admin/news/reset", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const { resetAutoImportedNews, runNewsScanCycle } = await import("../news/scanner");
    const { deleted } = await resetAutoImportedNews();
    const kick = () => void runNewsScanCycle(true).catch(() => undefined);
    kick();
    // İlk tarama kilitliyse birkaç kez daha dene
    setTimeout(kick, 20_000);
    setTimeout(kick, 60_000);
    res.json({
      success: true,
      deleted,
      message: `${deleted} otomatik haber silindi; yeniden tarama başladı`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Sıfırlama başarısız" });
  }
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

router.post("/cron/news-lifecycle", async (req, res) => {
  const secret = process.env["CRON_SECRET"] || process.env["NEWS_CRON_SECRET"];
  const header = String(req.headers["x-cron-secret"] || "");
  if (!secret || header !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { runNewsLifecycle } = await import("../news/scanner");
  const result = await runNewsLifecycle();
  res.json({ success: true, ...result });
});

export default router;
