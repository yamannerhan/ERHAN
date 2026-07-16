import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";
import { stripListingSourceLabels } from "../lib/strip-listing-source";
import { wipeAllNotificationsNow } from "../lib/wipe-notifications-once";

const router = Router();

router.get("/notifications", authMiddleware, async (req, res): Promise<void> => {
  const notifications = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const isStaff = req.user!.role === "admin" || req.user!.role === "moderator";

  res.json(notifications.map(n => {
    // Kullanıcıya kaynak adı (Telegram/WhatsApp/Eleman) gitmesin; admin_listing staff'ta kalır
    const scrub = !isStaff || n.type === "listing";
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: scrub ? stripListingSourceLabels(n.message ?? "") : n.message,
      isRead: n.isRead,
      linkUrl: n.linkUrl,
      relatedId: n.relatedId,
      createdAt: n.createdAt.toISOString(),
    };
  }));
});

router.post("/notifications/read-all", authMiddleware, async (req, res): Promise<void> => {
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, req.user!.id));
  res.json({ success: true });
});

router.post("/notifications/:id/read", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Geçersiz bildirim" }); return; }
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.user!.id)));
  res.json({ success: true });
});

router.delete("/notifications", authMiddleware, async (req, res): Promise<void> => {
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, req.user!.id));
  res.json({ success: true });
});

/** Admin: tüm kullanıcıların bildirimlerini sıfırla */
router.delete("/admin/notifications", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const deleted = await wipeAllNotificationsNow();
  res.json({ success: true, deleted });
});

router.get("/notifications/unread-count", authMiddleware, async (req, res): Promise<void> => {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.user!.id), eq(notificationsTable.isRead, false)));
  res.json({ count: result?.count ?? 0 });
});

export default router;
