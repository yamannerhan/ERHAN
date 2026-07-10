import { Router, type Request, type Response } from "express";
import { db, sourcesTable, pendingJobsTable, importedPostsTable, listingsTable } from "@workspace/db";
import { eq, desc, and, inArray, sql, count } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";
import { isTelegramTokenSet, triggerRescan, reparseImportedListings, refreshScraperInterval, triggerDeepRescan30Days, resetSingleTelegramSource, resetAllTelegramBots, dedupeExistingListings, triggerWhatsAppScan, resetAllWhatsAppSources, resetSingleWhatsAppSource, triggerElemanScan, resetAllElemanSources, getEffectiveScanIntervalMinutes, getScanPhase } from "../workers/scraper";
import { ensureTelegramConnected } from "../services/telegram-client";
import {
  startWhatsAppClient, stopWhatsAppClient, isWhatsAppReady, getWhatsAppStatus, fetchWhatsAppGroups,
} from "../services/whatsapp-client";
import { ELEMAN_CITY_LIST, elemanCityCount, parseElemanCursor, getElemanCityByIndex } from "../services/eleman-client";

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
      targetCities: s.targetCities ?? [],
      publishOnlyTargetCities: s.publishOnlyTargetCities ?? false,
      lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
      lastError: s.lastError ?? null,
      totalImported: s.totalImported,
      lastScanPublished: s.lastScanPublished ?? 0,
      lastScanMessagesRead: s.lastScanMessagesRead ?? 0,
      lastScanFound: s.lastScanFound ?? 0,
      lastScanAdded: s.lastScanAdded ?? 0,
      lastScanDuplicates: s.lastScanDuplicates ?? 0,
      lastScanErrors: s.lastScanErrors ?? 0,
      isScanning: s.isScanning ?? false,
      initialScanDone: s.initialScanDone ?? false,
      telegramChatId: s.telegramChatId ?? null,
      lastTelegramMessageId: s.lastTelegramMessageId ?? null,
      initialScanOffsetId: s.initialScanOffsetId ?? null,
      initialScanProgress: s.initialScanProgress ?? 0,
      initialScanPhase: s.initialScanPhase ?? null,
      initialScanAnchorId: s.initialScanAnchorId ?? null,
      initialScanTopId: s.initialScanTopId ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    telegramTokenSet: isTelegramTokenSet(),
    telegramGramJsConnected: await ensureTelegramConnected(1),
    effectiveScanIntervalMinutes: await getEffectiveScanIntervalMinutes(),
    scanPhase: await getScanPhase(),
  });
});

// ── Create source ─────────────────────────────────────────────────
router.post("/admin/sources", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { name, platform, url, apiToken, active, checkInterval, autoPublish, requireApproval, targetCities, publishOnlyTargetCities } = req.body as {
    name?: string; platform?: string; url?: string; apiToken?: string; active?: boolean; checkInterval?: number;
    autoPublish?: boolean; requireApproval?: boolean; targetCities?: string[]; publishOnlyTargetCities?: boolean;
  };

  if (!name?.trim()) { res.status(400).json({ error: "Kaynak adı zorunlu" }); return; }
  if (!platform || !["telegram", "facebook", "sahibinden", "secretcv", "kariyer", "iskur", "manual_admin", "whatsapp", "eleman"].includes(platform)) { res.status(400).json({ error: "Geçersiz platform" }); return; }
  if (!url?.trim()) { res.status(400).json({ error: "URL zorunlu" }); return; }

  const isTelegram = platform === "telegram";
  const [source] = await db.insert(sourcesTable).values({
    name: name.trim(),
    platform,
    url: isTelegram ? sanitizeTelegramUrl(url) : url.trim(),
    apiToken: apiToken?.trim() || undefined,
    active: active ?? true,
    status: active === false ? "inactive" : "active",
    checkInterval: checkInterval ?? (isTelegram ? 1 : 15),
    autoPublish: isTelegram ? true : (autoPublish ?? false),
    requireApproval: isTelegram ? false : (requireApproval ?? true),
    targetCities: targetCities?.length ? targetCities : undefined,
    publishOnlyTargetCities: publishOnlyTargetCities ?? false,
  }).returning();

  res.json(source);
});

// ── Update source ─────────────────────────────────────────────────
router.patch("/admin/sources/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { name, url, apiToken, active, checkInterval, autoPublish, requireApproval, targetCities, publishOnlyTargetCities } = req.body as {
    name?: string; url?: string; apiToken?: string; active?: boolean;
    checkInterval?: number; autoPublish?: boolean; requireApproval?: boolean;
    targetCities?: string[]; publishOnlyTargetCities?: boolean;
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
  if (checkInterval !== undefined) {
    updates.checkInterval = checkInterval;
  }
  if (autoPublish !== undefined) updates.autoPublish = autoPublish;
  if (requireApproval !== undefined) updates.requireApproval = requireApproval;
  if (targetCities !== undefined) updates.targetCities = targetCities;
  if (publishOnlyTargetCities !== undefined) updates.publishOnlyTargetCities = publishOnlyTargetCities;

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

// Botları sıfırla: bot ilanlarını sil, sırayla 30 gün yeniden tara.
router.post("/admin/sources/reset", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await resetAllTelegramBots();
    res.json({
      success: true,
      deletedListings: result.deletedListings,
      message: `${result.deletedListings} bot ilanı silindi. Gruplar sırayla %1'den %100'e 30 gün taranacak.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/admin/sources/deep-rescan", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  void triggerDeepRescan30Days().catch(() => {});
  res.json({
    success: true,
    message: "30 gün derin tarama başlatıldı. Tüm kaynaklar geriye doğru taranacak (yayındaki ilanlar silinmez).",
  });
});

router.post("/admin/sources/dedupe-listings", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await dedupeExistingListings();
    res.json({
      success: true,
      removed: result.removed,
      kept: result.kept,
      message: `${result.removed} çift ilan silindi, ${result.kept} benzersiz ilan kaldı.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

/** Tek Telegram grubunu sıfırla: o kaynaktan gelen ilanları sil, son 30 günü yeniden tara. */
router.post("/admin/sources/:id/reset", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  try {
    const result = await resetSingleTelegramSource(id);
    res.json({
      success: true,
      deletedListings: result.deletedListings,
      message: `${result.deletedListings} ilan silindi. Son 30 gün yeniden taranıyor.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
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
  res.json(getWhatsAppStatus());
});

router.post("/admin/whatsapp/start", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber.trim() : undefined;
    // Arka planda başlat — QR/kod üretimi initialize sırasında gelir
    void startWhatsAppClient(phoneNumber ? { phoneNumber } : undefined).catch((e) => {
      console.error("wa start error", e);
    });
    res.json({
      success: true,
      message: phoneNumber
        ? "WhatsApp başlatıldı. Telefona gelen onay kodunu bekleyin..."
        : "WhatsApp başlatıldı. QR kod bekleniyor...",
    });
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
  const { groupId, groupName, sourceName } = req.body as {
    groupId?: string; groupName?: string; sourceName?: string;
  };
  if (!groupId || !groupName) {
    res.status(400).json({ error: "groupId ve groupName gerekli." });
    return;
  }

  const existing = await db.select({ id: sourcesTable.id })
    .from(sourcesTable)
    .where(and(eq(sourcesTable.platform, "whatsapp"), eq(sourcesTable.url, groupId)))
    .limit(1);
  if (existing[0]) {
    res.json({ success: true, source: existing[0], message: "Bu grup zaten kayıtlı." });
    return;
  }

  const [source] = await db.insert(sourcesTable).values({
    name: (sourceName || groupName).slice(0, 120),
    platform: "whatsapp",
    url: groupId,
    active: true,
    status: "active",
    checkInterval: 5,
    autoPublish: true,
    requireApproval: false,
    initialScanDone: false,
    initialScanProgress: 1,
    initialScanPhase: "forward",
    lastTelegramMessageId: null,
  }).returning();

  res.json({ success: true, source });
});

router.get("/admin/whatsapp/sources", authMiddleware, requireAdmin, async (_req, res) => {
  const sources = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.platform, "whatsapp"))
    .orderBy(desc(sourcesTable.createdAt));

  const withCounts = await Promise.all(sources.map(async (s) => {
    const [row] = await db.select({ c: count() })
      .from(listingsTable)
      .where(and(eq(listingsTable.sourceId, s.id), eq(listingsTable.status, "active")));
    return {
      id: s.id,
      name: s.name,
      url: s.url,
      active: s.active,
      checkInterval: s.checkInterval,
      initialScanDone: s.initialScanDone ?? false,
      initialScanProgress: s.initialScanProgress ?? 0,
      isScanning: s.isScanning ?? false,
      totalImported: s.totalImported ?? 0,
      listingCount: row?.c ?? 0,
      lastScanMessagesRead: s.lastScanMessagesRead ?? 0,
      lastScanFound: s.lastScanFound ?? 0,
      lastScanAdded: s.lastScanAdded ?? 0,
      lastScanDuplicates: s.lastScanDuplicates ?? 0,
      lastScanErrors: s.lastScanErrors ?? 0,
      lastScanPublished: s.lastScanPublished ?? 0,
      lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
      lastError: s.lastError ?? null,
    };
  }));

  const totals = withCounts.reduce(
    (acc, s) => {
      acc.groups += 1;
      acc.totalImported += s.totalImported;
      acc.listingCount += s.listingCount;
      acc.lastAdded += s.lastScanAdded;
      return acc;
    },
    { groups: 0, totalImported: 0, listingCount: 0, lastAdded: 0 },
  );

  res.json({ sources: withCounts, totals });
});

router.post("/admin/whatsapp/scan-now", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const result = await triggerWhatsAppScan();
    if (!result.ready) {
      res.status(503).json({ error: "WhatsApp bağlı değil. Önce QR veya onay kodu ile bağlanın." });
      return;
    }
    const msg = result.mode === "initial"
      ? `${result.pendingGroups} grupta 30 gün tarama devam ediyor` +
        (result.currentGroup ? ` — şimdi: ${result.currentGroup}` : "") +
        ". Bitince her 5 dk yeni mesaj dinler."
      : `${result.pendingGroups} grup kaldığı yerden taranıyor (sadece yeni mesajlar). Üstüne aynı ilan eklenmez.`;
    res.json({
      success: true,
      scanned: result.scanned,
      queued: result.queued,
      mode: result.mode,
      pendingGroups: result.pendingGroups,
      currentGroup: result.currentGroup,
      results: result.results,
      message: msg,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** WhatsApp sıfırla: WA ilanlarını sil, 30 gün temiz tara (Telegram Botları Sıfırla gibi). */
router.post("/admin/whatsapp/reset", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    if (!isWhatsAppReady()) {
      res.status(503).json({ error: "WhatsApp bağlı değil. Önce bağlanın." });
      return;
    }
    const result = await resetAllWhatsAppSources();
    res.json({
      success: true,
      deletedListings: result.deletedListings,
      pendingGroups: result.pendingGroups,
      message: `${result.deletedListings} WhatsApp ilanı silindi. ${result.pendingGroups} grup sırayla 30 günden temiz taranacak.`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/whatsapp/sources/:id/reset", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Geçersiz id" }); return; }
    const result = await resetSingleWhatsAppSource(id);
    res.json({
      success: true,
      deletedListings: result.deletedListings,
      message: `${result.deletedListings} ilan silindi. Bu grup 30 günden yeniden taranıyor.`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Eleman.net ────────────────────────────────────────────────────
router.get("/admin/eleman/status", authMiddleware, requireAdmin, async (_req, res) => {
  const [source] = await db.select().from(sourcesTable)
    .where(eq(sourcesTable.platform, "eleman"))
    .orderBy(desc(sourcesTable.createdAt))
    .limit(1);

  let listingCount = 0;
  if (source) {
    const [row] = await db.select({ c: count() })
      .from(listingsTable)
      .where(and(eq(listingsTable.sourceId, source.id), eq(listingsTable.status, "active")));
    listingCount = row?.c ?? 0;
  }

  const cursor = parseElemanCursor(source?.initialScanOffsetId);
  const currentCity = source && !source.initialScanDone
    ? getElemanCityByIndex(cursor.cityIndex)
    : null;

  res.json({
    configured: !!source,
    cityCount: elemanCityCount(),
    cities: ELEMAN_CITY_LIST.map((c) => c.name),
    source: source ? {
      id: source.id,
      name: source.name,
      active: source.active,
      checkInterval: source.checkInterval,
      initialScanDone: source.initialScanDone ?? false,
      initialScanProgress: source.initialScanProgress ?? 0,
      isScanning: source.isScanning ?? false,
      totalImported: source.totalImported ?? 0,
      listingCount,
      lastScanMessagesRead: source.lastScanMessagesRead ?? 0,
      lastScanFound: source.lastScanFound ?? 0,
      lastScanAdded: source.lastScanAdded ?? 0,
      lastScanDuplicates: source.lastScanDuplicates ?? 0,
      lastScanErrors: source.lastScanErrors ?? 0,
      lastCheckedAt: source.lastCheckedAt?.toISOString() ?? null,
      lastError: source.lastError ?? null,
      cursor: source.initialScanOffsetId,
      currentCity: currentCity?.name ?? null,
      currentCityIndex: cursor.cityIndex,
    } : null,
  });
});

router.post("/admin/eleman/scan-now", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const result = await triggerElemanScan();
    res.json({
      success: true,
      sourceId: result.sourceId,
      created: result.created,
      message: result.created
        ? "Eleman.net kaynağı oluşturuldu. İl il tarama başladı (sadece telefonlu ilanlar)."
        : "Eleman.net tarama tetiklendi. Bitmemiş iller devam / bittiyse 30 dk yeni ilan dinler.",
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/eleman/reset", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const result = await resetAllElemanSources();
    res.json({
      success: true,
      deletedListings: result.deletedListings,
      sources: result.sources,
      message: `${result.deletedListings} Eleman.net ilanı silindi. İller baştan taranacak (telefon zorunlu).`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
