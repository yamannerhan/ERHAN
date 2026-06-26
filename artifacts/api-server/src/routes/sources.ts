import { Router, type Request, type Response } from "express";
import { db, sourcesTable, pendingJobsTable, importedPostsTable, listingsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";
import { isTelegramTokenSet, triggerRescan, reparseImportedListings } from "../workers/scraper";
import { startWhatsAppClient, stopWhatsAppClient, isWhatsAppReady, getWhatsAppQR, fetchWhatsAppGroups } from "../services/whatsapp-client";

const router = Router();

function sanitizeTelegramUrl(url: string): string {
  return url.trim().replace(/@+$/g, "").replace(/\/+$/g, "");
}

function safeId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── List sources ──────────────────────────────────────────────────
router.get("/admin/sources", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const sources = await db.select().from(sourcesTable).orderBy(desc(sourcesTable.createdAt));
  res.json({
    sources: sources.map(s => ({
      id: s.id,
      name: s.name,
      platform: s.platform,
      url: s.url,
      apiToken: s.apiToken ?? null,
      active: s.active,
      status: s.status ?? (s.active ? "active" : "inactive"),
      checkInterval: s.checkInterval,
      autoPublish: s.autoPublish,
      requireApproval: s.requireApproval,
      lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
      lastError: s.lastError ?? null,
      totalImported: s.totalImported,
      telegramChatId: s.telegramChatId ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    telegramTokenSet: isTelegramTokenSet(),
  });
});

// ── Create source ─────────────────────────────────────────────────
router.post("/admin/sources", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { name, platform, url, apiToken, active, checkInterval, autoPublish, requireApproval } = req.body as {
    name?: string; platform?: string; url?: string; apiToken?: string; active?: boolean; checkInterval?: number;
    autoPublish?: boolean; requireApproval?: boolean;
  };

  if (!name?.trim()) { res.status(400).json({ error: "Kaynak adı zorunlu" }); return; }
  if (!platform || !["telegram", "facebook", "sahibinden", "secretcv", "kariyer", "iskur", "manual_admin"].includes(platform)) { res.status(400).json({ error: "Geçersiz platform" }); return; }
  if (!url?.trim()) { res.status(400).json({ error: "URL zorunlu" }); return; }

  const [source] = await db.insert(sourcesTable).values({
    name: name.trim(),
    platform,
    url: platform === "telegram" ? sanitizeTelegramUrl(url) : url.trim(),
    apiToken: apiToken?.trim() || undefined,
    active: active ?? true,
    status: active === false ? "inactive" : "active",
    checkInterval: checkInterval ?? 15,
    autoPublish: autoPublish ?? false,
    requireApproval: requireApproval ?? true,
  }).returning();

  res.json(source);
});

// ── Update source ─────────────────────────────────────────────────
router.patch("/admin/sources/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { name, url, apiToken, active, checkInterval, autoPublish, requireApproval } = req.body as {
    name?: string; url?: string; apiToken?: string; active?: boolean;
    checkInterval?: number; autoPublish?: boolean; requireApproval?: boolean;
  };

  const updates: Partial<typeof sourcesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name.trim();
  if (url !== undefined) {
    const [existing] = await db.select({ platform: sourcesTable.platform }).from(sourcesTable).where(eq(sourcesTable.id, id));
    updates.url = existing?.platform === "telegram" ? sanitizeTelegramUrl(url) : url.trim();
  }
  if (apiToken !== undefined) updates.apiToken = apiToken?.trim() || null;
  if (active !== undefined) updates.active = active;
  if (active !== undefined) updates.status = active ? "active" : "inactive";
  if (checkInterval !== undefined) updates.checkInterval = checkInterval;
  if (autoPublish !== undefined) updates.autoPublish = autoPublish;
  if (requireApproval !== undefined) updates.requireApproval = requireApproval;

  await db.update(sourcesTable).set(updates).where(eq(sourcesTable.id, id));
  res.json({ success: true });
});

// ── Toggle active ─────────────────────────────────────────────────
router.post("/admin/sources/:id/toggle", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  const [s] = await db.select({ active: sourcesTable.active }).from(sourcesTable).where(eq(sourcesTable.id, id));
  if (!s) { res.status(404).json({ error: "Kaynak bulunamadı" }); return; }
  const nextActive = !s.active;
  await db.update(sourcesTable)
    .set({ active: nextActive, status: nextActive ? "active" : "inactive", ...(nextActive ? { lastError: null } : {}) })
    .where(eq(sourcesTable.id, id));
  res.json({ active: nextActive });
});

// ── Delete source ─────────────────────────────────────────────────
router.delete("/admin/sources/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(sourcesTable).where(eq(sourcesTable.id, id));
  res.json({ success: true });
});

// ── Reset bots & re-scan ──────────────────────────────────────────
// Botun çektiği ilanları sıfırlar, son 30 günü baştan tarar, sonra seçili dakikada
// kaldığı mesajdan devam ederek sürekli tarama yapar.
router.post("/admin/sources/reset", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const deletedListings = await db.delete(listingsTable)
    .where(eq(listingsTable.sourceTag, "telegram"))
    .returning({ id: listingsTable.id });

  await db.delete(pendingJobsTable);
  await db.delete(importedPostsTable);

  const telegramSources = await db.select().from(sourcesTable).where(eq(sourcesTable.platform, "telegram"));
  for (const s of telegramSources) {
    const cleanUrl = sanitizeTelegramUrl(s.url);
    if (cleanUrl !== s.url) {
      await db.update(sourcesTable).set({ url: cleanUrl }).where(eq(sourcesTable.id, s.id));
    }
  }

  await db.update(sourcesTable).set({
    lastCheckedAt: null,
    lastTelegramMessageId: null,
    totalImported: 0,
    lastError: null,
  });

  void triggerRescan().catch(() => { /* hata logger içinde yakalanır */ });

  res.json({
    success: true,
    deletedListings: deletedListings.length,
    message: `${deletedListings.length} Telegram ilanı sıfırlandı. Son 30 gün baştan taranıyor; ardından seçili dakikada kaldığı yerden devam edecek.`,
  });
});

// ── Re-check / re-parse imported listings ─────────────────────────
// Otomatik içe aktarılan ilanları kayıtlı metinlerinden yeniden ayrıştırır
// (maaş, şehir, başlık, cinsiyet). Eksik bilgiyle eklenmiş eski ilanları düzeltir.
router.post("/admin/sources/reparse", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const result = await reparseImportedListings();
  res.json({ success: true, ...result, message: `${result.updated}/${result.total} ilan güncellendi.` });
});

function cronAuthorized(req: Request): boolean {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret) return false;
  const headerSecret = req.header("x-cron-secret") ?? "";
  const authSecret = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return headerSecret === secret || authSecret === secret;
}

async function runScrapeEndpoint(req: Request, res: Response): Promise<void> {
  if (!process.env["CRON_SECRET"]?.trim()) {
    res.status(503).json({ error: "CRON_SECRET env ayarlı değil." });
    return;
  }
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: "Yetkisiz cron isteği." });
    return;
  }
  void triggerRescan().catch(() => {});
  res.json({ success: true, message: "İlan tarama işi başlatıldı." });
}

router.get("/admin/scrape/run", runScrapeEndpoint);
router.post("/admin/scrape/run", runScrapeEndpoint);

// ── WhatsApp endpoints ─────────────────────────────────────────────

router.get("/admin/whatsapp/status", authMiddleware, requireAdmin, async (_req, res) => {
  res.json({
    ready: isWhatsAppReady(),
    connected: isWhatsAppReady(),
    qr: getWhatsAppQR(),
  });
});

router.post("/admin/whatsapp/start", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    await startWhatsAppClient();
    res.json({ success: true, message: "WhatsApp client başlatıldı. QR kod bekleniyor..." });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post("/admin/whatsapp/stop", authMiddleware, requireAdmin, async (_req, res) => {
  await stopWhatsAppClient();
  res.json({ success: true, message: "WhatsApp client durduruldu." });
});

router.get("/admin/whatsapp/groups", authMiddleware, requireAdmin, async (_req, res) => {
  if (!isWhatsAppReady()) {
    res.status(503).json({ error: "WhatsApp bağlı değil." });
    return;
  }
  const groups = await fetchWhatsAppGroups();
  res.json({ groups });
});

router.post("/admin/whatsapp/add-source", authMiddleware, requireAdmin, async (req, res) => {
  const { groupId, groupName } = req.body;
  if (!groupId || !groupName) {
    res.status(400).json({ error: "groupId ve groupName gerekli." });
    return;
  }

  const [source] = await db.insert(sourcesTable).values({
    name: groupName,
    platform: "whatsapp",
    url: groupId,
    active: true,
    status: "active",
    checkInterval: 1,
    autoPublish: true,
    requireApproval: false,
  }).returning();

  res.json({ success: true, source });
});

export default router;
