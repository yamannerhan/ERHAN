import { Router } from "express";
import { db, sourcesTable, importedPostsTable, pendingJobsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";
import { isTelegramTokenSet, triggerRescan, reparseImportedListings } from "../workers/scraper";

const router = Router();

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
      active: s.active,
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
  const { name, platform, url, active, checkInterval, autoPublish, requireApproval } = req.body as {
    name?: string; platform?: string; url?: string;
    active?: boolean; checkInterval?: number;
    autoPublish?: boolean; requireApproval?: boolean;
  };

  if (!name?.trim()) { res.status(400).json({ error: "Kaynak adı zorunlu" }); return; }
  if (!platform || !["telegram", "facebook"].includes(platform)) { res.status(400).json({ error: "Geçersiz platform" }); return; }
  if (!url?.trim()) { res.status(400).json({ error: "URL zorunlu" }); return; }

  const [source] = await db.insert(sourcesTable).values({
    name: name.trim(),
    platform,
    url: url.trim(),
    active: active ?? true,
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

  const { name, url, active, checkInterval, autoPublish, requireApproval } = req.body as {
    name?: string; url?: string; active?: boolean;
    checkInterval?: number; autoPublish?: boolean; requireApproval?: boolean;
  };

  const updates: Partial<typeof sourcesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name.trim();
  if (url !== undefined) updates.url = url.trim();
  if (active !== undefined) updates.active = active;
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
  await db.update(sourcesTable).set({ active: !s.active }).where(eq(sourcesTable.id, id));
  res.json({ active: !s.active });
});

// ── Delete source ─────────────────────────────────────────────────
router.delete("/admin/sources/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Geçersiz ID" }); return; }
  await db.delete(sourcesTable).where(eq(sourcesTable.id, id));
  res.json({ success: true });
});

// ── Reset bots & re-scan ──────────────────────────────────────────
// İçe aktarma geçmişini ve bekleyen (onaylanmamış) ilanları temizler, kaynak
// sayaçlarını sıfırlar ve hemen yeniden tarama başlatır. Yayındaki ilanlar SİLİNMEZ;
// mükerrer kontrolü sayesinde aynı ilanlar tekrar eklenmez.
router.post("/admin/sources/reset", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  await db.delete(pendingJobsTable).where(eq(pendingJobsTable.status, "pending"));
  await db.delete(importedPostsTable);
  await db.update(sourcesTable).set({ lastCheckedAt: null, totalImported: 0, lastError: null });

  // Taramayı arka planda tetikle (yanıtı bekletme)
  void triggerRescan().catch(() => { /* hata logger içinde yakalanır */ });

  res.json({ success: true, message: "Botlar sıfırlandı, yeniden tarama başlatıldı." });
});

// ── Re-check / re-parse imported listings ─────────────────────────
// Otomatik içe aktarılan ilanları kayıtlı metinlerinden yeniden ayrıştırır
// (maaş, şehir, başlık, cinsiyet). Eksik bilgiyle eklenmiş eski ilanları düzeltir.
router.post("/admin/sources/reparse", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const result = await reparseImportedListings();
  res.json({ success: true, ...result, message: `${result.updated}/${result.total} ilan güncellendi.` });
});

export default router;
