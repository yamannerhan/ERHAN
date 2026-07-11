import { Router } from "express";
import { db, announcementsTable, adminSettingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";

const router = Router();

function announcementJson(a: typeof announcementsTable.$inferSelect) {
  return {
    id: a.id,
    content: a.content,
    isActive: a.isActive,
    isPinned: a.isPinned ?? false,
    placement: a.placement ?? "home",
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/announcements", async (_req, res): Promise<void> => {
  const announcements = await db.select().from(announcementsTable)
    .where(and(eq(announcementsTable.isActive, true), eq(announcementsTable.placement, "home")))
    .orderBy(desc(announcementsTable.isPinned), desc(announcementsTable.createdAt));

  res.json(announcements.map(announcementJson));
});

/** Sohbet kayan yazı + sabit duyuru (herkese açık) */
router.get("/chat/announcements", async (_req, res): Promise<void> => {
  const settings = await db.select().from(adminSettingsTable).limit(1);
  const s = settings[0];
  const defaultTicker = "Küfür, hakaret, reklam ve yanıltıcı ilan yasaktır.";
  res.json({
    ticker: (s?.chatTickerMessage?.trim() || defaultTicker),
    pinned: s?.chatPinnedMessage?.trim() || null,
  });
});

router.get("/admin/announcements", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const announcements = await db.select().from(announcementsTable)
    .orderBy(desc(announcementsTable.isPinned), desc(announcementsTable.createdAt));

  res.json(announcements.map(announcementJson));
});

router.post("/announcements", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { content, placement, isPinned } = req.body as { content?: string; placement?: string; isPinned?: boolean };
  if (!content?.trim()) {
    res.status(400).json({ error: "İçerik zorunludur" });
    return;
  }
  const place = placement === "chat" ? "chat" : "home";
  const [announcement] = await db.insert(announcementsTable).values({
    content: content.trim(),
    isActive: true,
    isPinned: Boolean(isPinned),
    placement: place,
  }).returning();
  res.status(201).json(announcementJson(announcement));
});

router.patch("/announcements/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  const { content, isActive, isPinned, placement } = req.body as {
    content?: string; isActive?: boolean; isPinned?: boolean; placement?: string;
  };
  const updates: Partial<typeof announcementsTable.$inferInsert> = {};
  if (content !== undefined) {
    if (!content.trim()) { res.status(400).json({ error: "İçerik zorunludur" }); return; }
    updates.content = content.trim();
  }
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (isPinned !== undefined) {
    updates.isPinned = Boolean(isPinned);
    // Tek sabit duyuru: diğerlerinin pin'ini kaldır
    if (updates.isPinned) {
      await db.update(announcementsTable).set({ isPinned: false }).where(eq(announcementsTable.isPinned, true));
    }
  }
  if (placement !== undefined) updates.placement = placement === "chat" ? "chat" : "home";

  const [announcement] = await db.update(announcementsTable).set(updates).where(eq(announcementsTable.id, id)).returning();
  if (!announcement) { res.status(404).json({ error: "Kayan yazı bulunamadı" }); return; }
  res.json(announcementJson(announcement));
});

router.delete("/announcements/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.sendStatus(204);
});

export default router;
